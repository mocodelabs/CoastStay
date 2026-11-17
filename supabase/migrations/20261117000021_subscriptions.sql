-- Subscriptions: every business gets a 14-day trial, then a monthly or annual plan.
--
-- * State is derived from dates, never stored: active while current_period_end is in the future,
--   trialing while trial_ends_at is, otherwise expired.
-- * An expired business becomes read-only: people can still sign in, see and export everything,
--   manage staff and renew, but operational records cannot be created or changed.
-- * Payment is by M-Pesa or bank transfer to the platform operator. The owner submits the
--   transaction reference; a platform administrator checks it and approves. Nothing here claims a
--   payment was verified automatically.

-- ---------------------------------------------------------------------------
-- Plans (prices in KES). Keep in sync with src/lib/plans.ts (an integration test compares them).
-- ---------------------------------------------------------------------------
create table public.subscription_plans (
  code text primary key check (code in ('monthly', 'annual')),
  name text not null,
  price numeric(12, 2) not null check (price > 0),
  period interval not null,
  sort_order integer not null default 0
);
insert into public.subscription_plans (code, name, price, period, sort_order) values
  ('monthly', 'Monthly', 2999, interval '1 month', 1),
  ('annual', 'Annual', 32900, interval '1 year', 2);

alter table public.subscription_plans enable row level security;
create policy subscription_plans_read on public.subscription_plans for select to anon, authenticated using (true);
grant select on public.subscription_plans to anon;   -- anon default privileges are revoked (migration 9)

-- ---------------------------------------------------------------------------
-- One subscription per business
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan text references public.subscription_plans (code),
  trial_ends_at timestamptz not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function app.set_updated_at();
alter table public.subscriptions enable row level security;   -- read through subscription_status()

-- Payment confirmations submitted by owners, reviewed by platform administrators.
create table public.subscription_payment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan text not null references public.subscription_plans (code),
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('mpesa', 'bank')),
  reference text not null check (length(trim(reference)) between 4 and 60),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 300),
  period_start timestamptz,
  period_end timestamptz
);
-- A transaction reference can only be claimed once, platform-wide (unless it was rejected).
create unique index subscription_payment_requests_reference_key
  on public.subscription_payment_requests (method, upper(trim(reference))) where status <> 'rejected';
create index subscription_payment_requests_org_idx on public.subscription_payment_requests (organization_id, submitted_at desc);
create index subscription_payment_requests_pending_idx on public.subscription_payment_requests (submitted_at) where status = 'pending';

alter table public.subscription_payment_requests enable row level security;
create policy subscription_payment_requests_read on public.subscription_payment_requests for select to authenticated
  using (app.has_perm(organization_id, 'billing.manage'));
-- No client writes: requests go through request_subscription_payment(), reviews through review_subscription_payment().

-- Platform administrators (the operator, e.g. mocode labs). Managed with SQL only.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;   -- no client policies

alter table public.platform_settings
  add column trial_days integer not null default 14 check (trial_days between 0 and 90),
  add column billing_instructions text not null default
    'Pay by M-Pesa or bank transfer to mocode labs. Call or WhatsApp 0721 609 317 or email mocodelabs@gmail.com for the payment details, then enter your transaction reference below. Your plan is activated as soon as the payment is confirmed.';

-- A subscription platform: businesses sign up themselves (each starts with a trial).
update public.platform_settings set allow_self_service_orgs = true where id;

-- Owners also manage billing. Same matrix as before plus 'billing.manage' for owners.
create or replace function app.role_permissions(r public.member_role, finances boolean default false)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case r
    when 'owner' then array[
      'org.settings', 'staff.manage', 'audit.view', 'integrations.manage', 'billing.manage',
      'property.view', 'property.create', 'property.edit',
      'block.manage',
      'booking.view', 'booking.manage',
      'guest.view', 'guest.manage',
      'finance.view', 'finance.record', 'finance.reverse',
      'housekeeping.view', 'housekeeping.manage', 'housekeeping.work',
      'maintenance.view', 'maintenance.report', 'maintenance.manage',
      'inventory.view', 'inventory.manage', 'inventory.consume', 'inventory.adjust',
      'reports.operational', 'reports.financial',
      'comms.send', 'comms.templates'
    ]
    when 'manager' then array[
      'property.view', 'property.edit',
      'block.manage',
      'booking.view', 'booking.manage',
      'guest.view', 'guest.manage',
      'housekeeping.view', 'housekeeping.manage', 'housekeeping.work',
      'maintenance.view', 'maintenance.report', 'maintenance.manage',
      'inventory.view', 'inventory.manage', 'inventory.consume', 'inventory.adjust',
      'reports.operational',
      'comms.send'
    ] || case when finances then array['finance.view', 'finance.record', 'reports.financial'] else array[]::text[] end
    when 'housekeeping' then array[
      'property.view',
      'housekeeping.view', 'housekeeping.work',
      'maintenance.view', 'maintenance.report',
      'inventory.view', 'inventory.consume'
    ]
    when 'finance' then array[
      'property.view',
      'booking.view',
      'guest.view',
      'finance.view', 'finance.record', 'finance.reverse',
      'reports.operational', 'reports.financial',
      'comms.send'
    ]
  end;
$$;

-- ---------------------------------------------------------------------------
-- State helpers
-- ---------------------------------------------------------------------------
create or replace function app.subscription_state(org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when s.current_period_end > now() then 'active'
      when s.trial_ends_at > now() then 'trialing'
      else 'expired'
    end
    from public.subscriptions s where s.organization_id = org
  ), 'expired');
$$;

create or replace function app.subscription_allows_writes(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.subscription_state(org) in ('active', 'trialing');
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()));
$$;

revoke all on function app.subscription_state(uuid), app.subscription_allows_writes(uuid), app.is_platform_admin()
  from public, anon, authenticated;

-- New businesses start their trial immediately (before the creation RPC seeds defaults).
create or replace function app.start_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (organization_id, trial_ends_at)
  values (new.id, now() + make_interval(days => (select ps.trial_days from public.platform_settings ps where ps.id)))
  on conflict (organization_id) do nothing;
  return new;
end;
$$;
create trigger organizations_start_trial after insert on public.organizations
  for each row execute function app.start_trial();

-- Existing businesses get a fresh trial from today.
insert into public.subscriptions (organization_id, trial_ends_at)
select o.id, now() + interval '14 days' from public.organizations o
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- Read-only mode: block user writes to operational records of an expired business.
-- System jobs (no signed-in user: reminders, calendar sync) are not affected, and rows removed
-- because their business is being deleted are always allowed.
-- ---------------------------------------------------------------------------
create or replace function app.require_active_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
begin
  if (select auth.uid()) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then org := old.organization_id; else org := new.organization_id; end if;
  if not app.subscription_allows_writes(org)
     and exists (select 1 from public.organizations o where o.id = org) then
    raise exception 'Your CoastStay subscription has ended, so this business is read-only. The owner can renew in Settings → Billing.'
      using errcode = '42501', hint = 'subscription_inactive';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'booking_payments', 'bookings', 'calendar_feeds', 'checklist_templates', 'communication_logs',
    'communication_templates', 'expense_categories', 'expenses', 'guests',
    'housekeeping_checklist_items', 'housekeeping_task_comments', 'housekeeping_task_photos',
    'housekeeping_tasks', 'inventory_items', 'inventory_movements', 'maintenance_attachments',
    'maintenance_requests', 'organization_settings', 'properties', 'property_blocks', 'property_photos',
    'property_units', 'recurring_task_templates'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function app.require_active_subscription()',
      t || '_require_subscription', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs for members and owners
-- ---------------------------------------------------------------------------
create or replace function public.subscription_status(org uuid)
returns table (
  state text,
  plan text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  days_left integer,
  can_manage boolean,
  pending_request boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    app.subscription_state(org),
    s.plan,
    s.trial_ends_at,
    s.current_period_end,
    greatest(0, ceil(extract(epoch from (
      case when s.current_period_end > now() then s.current_period_end else s.trial_ends_at end - now()
    )) / 86400))::integer,
    app.has_perm(org, 'billing.manage'),
    exists (select 1 from public.subscription_payment_requests r where r.organization_id = org and r.status = 'pending')
  from public.subscriptions s
  where s.organization_id = org and app.is_member(org);
$$;

create or replace function public.billing_instructions()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ps.billing_instructions from public.platform_settings ps
  where ps.id and (select auth.uid()) is not null;
$$;

create or replace function public.request_subscription_payment(
  org uuid,
  plan_code text,
  pay_method text,
  pay_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.subscription_plans;
  ref text := upper(trim(pay_reference));
  existing public.subscription_payment_requests;
  new_id uuid;
begin
  if not app.has_perm(org, 'billing.manage') then
    raise exception 'Only the business owner can manage billing.' using errcode = '42501';
  end if;
  select * into p from public.subscription_plans where code = plan_code;
  if not found then
    raise exception 'Choose the monthly or annual plan.' using errcode = '22023';
  end if;
  if pay_method not in ('mpesa', 'bank') then
    raise exception 'Choose M-Pesa or bank transfer.' using errcode = '22023';
  end if;
  if ref is null or length(ref) < 4 or length(ref) > 60 then
    raise exception 'Enter the transaction reference from your M-Pesa message or bank slip.' using errcode = '22023';
  end if;

  -- Retry-safe: the same business submitting the same reference again gets the same request back.
  select * into existing from public.subscription_payment_requests r
  where r.method = pay_method and upper(trim(r.reference)) = ref and r.status <> 'rejected';
  if found then
    if existing.organization_id = org then return existing.id; end if;
    raise exception 'This transaction reference has already been submitted.' using errcode = '23505';
  end if;

  insert into public.subscription_payment_requests (organization_id, plan, amount, method, reference, submitted_by)
  values (org, p.code, p.price, pay_method, ref, (select auth.uid()))
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs for platform administrators
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_platform_admin();
$$;

create or replace function public.platform_subscriptions()
returns table (
  organization_id uuid,
  organization_name text,
  owner_email text,
  created_at timestamptz,
  state text,
  plan text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  pending_requests integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Platform administrators only.' using errcode = '42501';
  end if;
  return query
    select o.id, o.name,
      (select p.email::text from public.organization_members m join public.profiles p on p.id = m.user_id
        where m.organization_id = o.id and m.role = 'owner' and m.status = 'active' order by m.created_at limit 1),
      o.created_at, app.subscription_state(o.id), s.plan, s.trial_ends_at, s.current_period_end,
      (select count(*)::integer from public.subscription_payment_requests r where r.organization_id = o.id and r.status = 'pending')
    from public.organizations o
    left join public.subscriptions s on s.organization_id = o.id
    order by o.created_at desc;
end;
$$;

create or replace function public.platform_payment_requests()
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  plan text,
  amount numeric,
  method text,
  reference text,
  status text,
  submitted_by_email text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Platform administrators only.' using errcode = '42501';
  end if;
  return query
    select r.id, r.organization_id, o.name, r.plan, r.amount, r.method, r.reference, r.status,
      p.email::text, r.submitted_at, r.reviewed_at, r.review_note
    from public.subscription_payment_requests r
    join public.organizations o on o.id = r.organization_id
    left join public.profiles p on p.id = r.submitted_by
    order by (r.status = 'pending') desc, r.submitted_at desc
    limit 200;
end;
$$;

-- Approving extends the subscription by one plan period, starting from whichever is later:
-- now, the end of the trial, or the end of the current paid period (paying early never loses days).
create or replace function public.review_subscription_payment(request_id uuid, approve boolean, note text default null)
returns public.subscription_payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.subscription_payment_requests;
  s public.subscriptions;
  p public.subscription_plans;
  start_at timestamptz;
begin
  if not app.is_platform_admin() then
    raise exception 'Platform administrators only.' using errcode = '42501';
  end if;
  select * into r from public.subscription_payment_requests where id = request_id for update;
  if not found then
    raise exception 'Payment request not found.' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'This payment request has already been reviewed.' using errcode = '22023';
  end if;

  if not approve then
    update public.subscription_payment_requests
      set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = nullif(trim(note), '')
      where id = request_id returning * into r;
    return r;
  end if;

  select * into p from public.subscription_plans where code = r.plan;
  select * into s from public.subscriptions where organization_id = r.organization_id for update;
  start_at := greatest(now(), coalesce(s.trial_ends_at, now()), coalesce(s.current_period_end, now()));

  update public.subscriptions
    set plan = r.plan, current_period_end = start_at + p.period
    where organization_id = r.organization_id;

  update public.subscription_payment_requests
    set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now(),
        review_note = nullif(trim(note), ''), period_start = start_at, period_end = start_at + p.period
    where id = request_id returning * into r;

  insert into public.notifications (organization_id, user_id, notification_type, title, message, dedupe_key)
  select r.organization_id, m.user_id, 'system', 'Subscription active',
         format('Payment %s confirmed. Your %s plan runs until %s.', r.reference, lower(p.name),
                to_char((start_at + p.period) at time zone 'Africa/Nairobi', 'DD/MM/YYYY')),
         'billing:' || r.id
  from public.organization_members m
  where m.organization_id = r.organization_id and m.status = 'active' and m.role = 'owner'
  on conflict do nothing;

  return r;
end;
$$;

revoke all on function public.platform_subscriptions(), public.platform_payment_requests(),
  public.review_subscription_payment(uuid, boolean, text), public.request_subscription_payment(uuid, text, text, text),
  public.subscription_status(uuid), public.billing_instructions(), public.is_platform_admin()
  from public, anon;
grant execute on function public.platform_subscriptions(), public.platform_payment_requests(),
  public.review_subscription_payment(uuid, boolean, text), public.request_subscription_payment(uuid, text, text, text),
  public.subscription_status(uuid), public.billing_instructions(), public.is_platform_admin()
  to authenticated;
