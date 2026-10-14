-- Organizations, profiles, membership, invitations and the authorization helpers.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  id boolean primary key default true check (id),
  allow_self_service_orgs boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_url text,
  contact_email extensions.citext,
  contact_phone text,
  currency char(3) not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Africa/Nairobi',
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function app.set_updated_at();

create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  default_check_in_time time not null default '14:00',
  default_check_out_time time not null default '10:00',
  booking_reference_prefix text not null default 'CS' check (booking_reference_prefix ~ '^[A-Z0-9]{1,6}$'),
  default_deposit_percent numeric(5, 2) not null default 30 check (default_deposit_percent between 0 and 100),
  enabled_payment_methods public.payment_method[] not null
    default array['mpesa', 'bank_transfer', 'cash', 'card', 'platform_payout', 'other']::public.payment_method[],
  balance_due_days_before_arrival integer not null default 3 check (balance_due_days_before_arrival between 0 and 60),
  notification_preferences jsonb not null default jsonb_build_object(
    'upcoming_check_in', true,
    'upcoming_departure', true,
    'overdue_balance', true,
    'housekeeping_deadline', true,
    'maintenance', true,
    'low_stock', true
  ),
  updated_at timestamptz not null default now()
);
create trigger organization_settings_updated_at before update on public.organization_settings
  for each row execute function app.set_updated_at();

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext,
  full_name text not null default '' check (length(full_name) <= 120),
  phone text check (phone is null or length(phone) <= 20),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  status public.member_status not null default 'active',
  -- Property managers only: grants finance.view / finance.record / reports.financial.
  can_view_finances boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);
create trigger organization_members_updated_at before update on public.organization_members
  for each row execute function app.set_updated_at();

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email extensions.citext not null,
  full_name text,
  role public.member_role not null,
  can_view_finances boolean not null default false,
  property_ids uuid[] not null default '{}',
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index organization_invitations_org_idx on public.organization_invitations (organization_id);
create unique index organization_invitations_open_email_idx
  on public.organization_invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Profile bootstrap from auth.users
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

create or replace function app.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function app.sync_profile_email();

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

-- The caller's active role in an organization, or null.
create or replace function app.member_role(org uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = org
    and m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

create or replace function app.is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

-- Role -> permission matrix. Keep in sync with src/lib/permissions.ts (a test compares them).
create or replace function app.role_permissions(r public.member_role, finances boolean default false)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case r
    when 'owner' then array[
      'org.settings', 'staff.manage', 'audit.view', 'integrations.manage',
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

create or replace function app.has_perm(org uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select perm = any (app.role_permissions(m.role, m.can_view_finances))
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  ), false);
$$;

-- Owners and finance staff see every property in the organization; managers and housekeeping
-- staff only the properties they are assigned to.
create or replace function app.has_full_property_scope(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.member_role(org) in ('owner', 'finance'), false);
$$;

-- Definition completed in the properties migration once staff_property_assignments exists.
create or replace function app.can_access_property(org uuid, prop uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_full_property_scope(org);
$$;

-- Public, callable wrapper so the UI can ask "what may I do here?" in one round trip.
create or replace function public.my_permissions(org uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select app.role_permissions(m.role, m.can_view_finances)
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  ), array[]::text[]);
$$;

-- ---------------------------------------------------------------------------
-- Membership invariants
-- ---------------------------------------------------------------------------

-- An organization must always keep at least one active owner.
create or replace function app.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
begin
  -- Deleting the whole organization removes every membership; nothing to protect then.
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return coalesce(new, old);
  end if;
  if (tg_op = 'DELETE' and old.role = 'owner' and old.status = 'active')
     or (tg_op = 'UPDATE' and old.role = 'owner' and old.status = 'active'
         and (new.role <> 'owner' or new.status <> 'active')) then
    select count(*) into remaining
    from public.organization_members
    where organization_id = old.organization_id
      and role = 'owner' and status = 'active'
      and id <> old.id;
    if remaining = 0 then
      raise exception 'An organization must keep at least one active owner.'
        using errcode = 'P0001', hint = 'last_owner';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger organization_members_last_owner
  before update or delete on public.organization_members
  for each row execute function app.guard_last_owner();

-- Members cannot change their own role/status (prevents self-escalation and self-lockout).
create or replace function app.guard_self_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and old.user_id = (select auth.uid())
     and (new.role is distinct from old.role
          or new.status is distinct from old.status
          or new.can_view_finances is distinct from old.can_view_finances) then
    raise exception 'You cannot change your own role or access.' using errcode = '42501';
  end if;
  if new.organization_id <> old.organization_id or new.user_id <> old.user_id then
    raise exception 'Membership organization and user cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organization_members_self_guard
  before update on public.organization_members
  for each row execute function app.guard_self_membership();

-- ---------------------------------------------------------------------------
-- Organization lifecycle RPCs
-- ---------------------------------------------------------------------------

-- Creates an organization with the caller as owner. Allowed for the first organization on a
-- deployment (bootstrap) or when self-service organizations are enabled in platform_settings.
create or replace function public.create_organization(
  org_name text,
  org_contact_phone text default null,
  org_contact_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_id uuid;
  base_slug text;
  candidate text;
  n integer := 1;
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if org_name is null or length(trim(org_name)) < 2 then
    raise exception 'Business name must be at least 2 characters.' using errcode = '22023';
  end if;

  -- Serialize bootstrap checks.
  perform pg_advisory_xact_lock(hashtext('coaststay.create_organization'));

  if exists (select 1 from public.organizations)
     and not (select allow_self_service_orgs from public.platform_settings where id) then
    raise exception 'Creating additional businesses is disabled on this deployment. Ask an owner to invite you.'
      using errcode = '42501', hint = 'org_creation_disabled';
  end if;

  base_slug := coalesce(nullif(app.slugify(org_name), ''), 'business');
  candidate := base_slug;
  while exists (select 1 from public.organizations where slug = candidate) loop
    n := n + 1;
    candidate := base_slug || '-' || n;
  end loop;

  insert into public.organizations (name, slug, contact_phone, contact_email)
  values (trim(org_name), candidate, nullif(trim(org_contact_phone), ''), nullif(trim(org_contact_email), ''))
  returning id into new_id;

  insert into public.organization_settings (organization_id) values (new_id);

  -- Ensure a profile exists even if the auth trigger was bypassed.
  insert into public.profiles (id, email)
  select u.id, u.email from auth.users u where u.id = uid
  on conflict (id) do nothing;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_id, uid, 'owner');

  perform app.seed_organization_defaults(new_id);

  return new_id;
end;
$$;

-- Whether the current deployment allows the caller to create an organization (for the UI).
create or replace function public.can_create_organization()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (not exists (select 1 from public.organizations)
         or (select allow_self_service_orgs from public.platform_settings where id));
$$;

-- Defaults are filled in by later migrations (expense categories, checklists, templates).
create or replace function app.seed_organization_defaults(org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  null;
end;
$$;
