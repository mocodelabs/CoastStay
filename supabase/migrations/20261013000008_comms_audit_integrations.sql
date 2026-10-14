-- Notifications, audit trail, guest communication templates/logs, external calendar feeds,
-- and per-organization default data.

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(title) between 1 and 160),
  message text not null default '' check (length(message) <= 1000),
  notification_type text not null check (notification_type in (
    'upcoming_check_in', 'upcoming_departure', 'overdue_balance', 'housekeeping_deadline',
    'maintenance', 'low_stock', 'task_assigned', 'system'
  )),
  related_entity_type text,
  related_entity_id uuid,
  -- Prevents duplicate reminders, e.g. 'overdue_balance:<booking>:2026-10-13'
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, organization_id, read_at, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and app.is_member(organization_id));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- Users may only flip read_at on their notifications.
create or replace function app.notifications_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.title, new.message, new.notification_type, new.user_id, new.organization_id, new.dedupe_key)
     is distinct from (old.title, old.message, old.notification_type, old.user_id, old.organization_id, old.dedupe_key) then
    raise exception 'Notifications are read-only apart from their read state.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger notifications_guard before update on public.notifications
  for each row execute function app.notifications_guard();

-- Server-side helper used by triggers and scheduled jobs.
create or replace function app.notify(
  org uuid, recipient uuid, n_type text, n_title text, n_message text,
  entity_type text default null, entity_id uuid default null, n_dedupe text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (organization_id, user_id, notification_type, title, message,
    related_entity_type, related_entity_id, dedupe_key)
  values (org, recipient, n_type, n_title, coalesce(n_message, ''), entity_type, entity_id, n_dedupe)
  on conflict (organization_id, user_id, dedupe_key) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  -- no FK: the audit trail must not block (or be cascaded by) organization deletion
  organization_id uuid not null,
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  -- booking the change relates to (for booking history), when applicable
  booking_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_booking_idx on public.audit_logs (booking_id) where booking_id is not null;

create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  rec jsonb := coalesce(new_j, old_j);
  diff jsonb := '{}'::jsonb;
  k text;
  org uuid;
  bid uuid;
begin
  org := coalesce((rec ->> 'organization_id')::uuid, case when tg_table_name = 'organizations' then (rec ->> 'id')::uuid end);
  if org is null then
    return null;
  end if;
  bid := case
    when tg_table_name = 'bookings' then (rec ->> 'id')::uuid
    when rec ? 'booking_id' then (rec ->> 'booking_id')::uuid
  end;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      if k not in ('updated_at') and (new_j -> k) is distinct from (old_j -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('old', old_j -> k, 'new', new_j -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then
      return null;
    end if;
  elsif tg_op = 'INSERT' then
    diff := new_j - 'created_at' - 'updated_at';
  else
    diff := old_j;
  end if;
  -- Never copy secrets into the audit log.
  diff := diff - 'wifi_password' - 'token_hash' - 'url';
  insert into public.audit_logs (organization_id, actor_id, entity_type, entity_id, booking_id, action, changes)
  values (org, (select auth.uid()), tg_table_name, (rec ->> 'id')::uuid, bid, lower(tg_op), diff);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'organization_settings', 'organization_members', 'organization_invitations',
    'staff_property_assignments', 'properties', 'property_units', 'property_blocks',
    'bookings', 'booking_payments', 'expenses', 'expense_categories',
    'maintenance_requests', 'inventory_items', 'inventory_movements'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()',
      t || '_audit', t
    );
  end loop;
end;
$$;

alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    app.has_perm(organization_id, 'audit.view')
    or (booking_id is not null
        and entity_type = 'bookings'
        and app.has_perm(organization_id, 'booking.view')
        and exists (select 1 from public.bookings b where b.id = audit_logs.booking_id
                    and app.can_access_property(b.organization_id, b.property_id)))
    or (booking_id is not null
        and entity_type = 'booking_payments'
        and app.has_perm(organization_id, 'finance.view')
        and exists (select 1 from public.bookings b where b.id = audit_logs.booking_id
                    and app.can_access_property(b.organization_id, b.property_id)))
  );
-- Written only by triggers; never updated or deleted by clients.

-- ---------------------------------------------------------------------------
-- Guest communication
-- ---------------------------------------------------------------------------
create table public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_key text not null check (template_key ~ '^[a-z0-9_]+$'),
  name text not null check (length(trim(name)) between 2 and 80),
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'email', 'sms')),
  subject text check (subject is null or length(subject) <= 160),
  body text not null check (length(body) between 1 and 4000),
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, template_key)
);
create trigger communication_templates_updated_at before update on public.communication_templates
  for each row execute function app.set_updated_at();

create table public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid,
  guest_id uuid,
  template_key text,
  channel text not null check (channel in ('whatsapp', 'email', 'sms', 'in_app')),
  recipient text,
  body text not null default '',
  -- prepared = message text generated; opened = WhatsApp hand-off opened by staff;
  -- sent/failed = reported by an automated provider.
  status text not null default 'prepared' check (status in ('prepared', 'opened', 'sent', 'failed', 'skipped')),
  provider text,
  provider_message_id text,
  error text,
  dedupe_key text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, booking_id) references public.bookings (organization_id, id),
  foreign key (organization_id, guest_id) references public.guests (organization_id, id),
  unique (organization_id, dedupe_key)
);
create index communication_logs_booking_idx on public.communication_logs (booking_id, created_at);
create index communication_logs_org_idx on public.communication_logs (organization_id, created_at desc);
create trigger communication_logs_stamp_actor before insert on public.communication_logs
  for each row execute function app.stamp_actor('created_by');

alter table public.communication_templates enable row level security;
alter table public.communication_logs enable row level security;

create policy communication_templates_select on public.communication_templates for select to authenticated
  using (app.has_perm(organization_id, 'comms.send') or app.has_perm(organization_id, 'comms.templates'));
create policy communication_templates_insert on public.communication_templates for insert to authenticated
  with check (app.has_perm(organization_id, 'comms.templates') and not is_system);
create policy communication_templates_update on public.communication_templates for update to authenticated
  using (app.has_perm(organization_id, 'comms.templates'))
  with check (app.has_perm(organization_id, 'comms.templates'));
create policy communication_templates_delete on public.communication_templates for delete to authenticated
  using (app.has_perm(organization_id, 'comms.templates') and not is_system);

create policy communication_logs_select on public.communication_logs for select to authenticated
  using (
    app.has_perm(organization_id, 'comms.send')
    and (booking_id is null and app.has_full_property_scope(organization_id)
         or exists (select 1 from public.bookings b where b.id = communication_logs.booking_id
                    and app.can_access_property(b.organization_id, b.property_id)))
  );
create policy communication_logs_insert on public.communication_logs for insert to authenticated
  with check (
    app.has_perm(organization_id, 'comms.send')
    and status in ('prepared', 'opened')
    and (booking_id is null
         or exists (select 1 from public.bookings b where b.id = communication_logs.booking_id
                    and app.can_access_property(b.organization_id, b.property_id)))
  );

-- ---------------------------------------------------------------------------
-- External calendar (iCal) feeds — fetched only by a trusted backend worker.
-- ---------------------------------------------------------------------------
create table public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  unit_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 80),
  source public.booking_source not null default 'airbnb',
  -- Private feed URL: readable only by owners (integrations.manage); never logged.
  url text not null check (url ~ '^https://' and length(url) <= 2000),
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_status text check (last_status in ('ok', 'error')),
  last_error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade,
  foreign key (property_id, unit_id) references public.property_units (property_id, id) on delete cascade
);
create trigger calendar_feeds_updated_at before update on public.calendar_feeds
  for each row execute function app.set_updated_at();
create trigger calendar_feeds_stamp_actor before insert on public.calendar_feeds
  for each row execute function app.stamp_actor('created_by');

create table public.calendar_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  feed_id uuid not null references public.calendar_feeds (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  events_found integer not null default 0,
  events_created integer not null default 0,
  events_updated integer not null default 0,
  events_removed integer not null default 0,
  error text
);
create index calendar_sync_runs_feed_idx on public.calendar_sync_runs (feed_id, started_at desc);

create table public.external_calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  feed_id uuid not null references public.calendar_feeds (id) on delete cascade,
  unit_id uuid not null references public.property_units (id) on delete cascade,
  external_uid text not null,
  fingerprint text not null,
  summary text,
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'removed', 'conflict')),
  block_id uuid references public.property_blocks (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (feed_id, external_uid),
  check (end_date > start_date)
);
alter table public.property_blocks
  add constraint property_blocks_external_event_fk foreign key (external_event_id)
  references public.external_calendar_events (id) on delete set null;

alter table public.calendar_feeds enable row level security;
alter table public.calendar_sync_runs enable row level security;
alter table public.external_calendar_events enable row level security;

create policy calendar_feeds_all on public.calendar_feeds for all to authenticated
  using (app.has_perm(organization_id, 'integrations.manage'))
  with check (app.has_perm(organization_id, 'integrations.manage'));
create policy calendar_sync_runs_select on public.calendar_sync_runs for select to authenticated
  using (app.has_perm(organization_id, 'integrations.manage'));
create policy external_events_select on public.external_calendar_events for select to authenticated
  using (app.has_perm(organization_id, 'booking.view')
         and exists (select 1 from public.property_units u where u.id = external_calendar_events.unit_id
                     and app.can_access_property(u.organization_id, u.property_id)));

-- ---------------------------------------------------------------------------
-- Organization defaults
-- ---------------------------------------------------------------------------
create or replace function app.seed_organization_defaults(org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.expense_categories (organization_id, code, name, is_system, sort_order)
  values
    (org, 'utilities', 'Utilities', true, 1),
    (org, 'internet', 'Internet', true, 2),
    (org, 'cleaning', 'Cleaning', true, 3),
    (org, 'laundry', 'Laundry', true, 4),
    (org, 'maintenance', 'Maintenance & repairs', true, 5),
    (org, 'supplies', 'Supplies', true, 6),
    (org, 'staff', 'Staff', true, 7),
    (org, 'platform_fees', 'Platform fees', true, 8),
    (org, 'transport', 'Transport', true, 9),
    (org, 'other', 'Other', true, 10)
  on conflict (organization_id, code) do nothing;

  insert into public.checklist_templates (organization_id, name, task_type, is_default, items)
  values (org, 'Standard turnover', 'turnover_clean', true, jsonb_build_array(
    jsonb_build_object('label', 'Strip and replace linen', 'requires_photo', false),
    jsonb_build_object('label', 'Clean bedrooms', 'requires_photo', false),
    jsonb_build_object('label', 'Clean bathrooms', 'requires_photo', false),
    jsonb_build_object('label', 'Clean kitchen', 'requires_photo', false),
    jsonb_build_object('label', 'Empty bins', 'requires_photo', false),
    jsonb_build_object('label', 'Replenish toiletries', 'requires_photo', false),
    jsonb_build_object('label', 'Replenish drinking water (if provided)', 'requires_photo', false),
    jsonb_build_object('label', 'Check towels', 'requires_photo', false),
    jsonb_build_object('label', 'Test Wi-Fi', 'requires_photo', false),
    jsonb_build_object('label', 'Check air conditioning and appliances', 'requires_photo', false),
    jsonb_build_object('label', 'Inspect keys and access devices', 'requires_photo', false),
    jsonb_build_object('label', 'Report damages', 'requires_photo', false),
    jsonb_build_object('label', 'Upload inspection photos', 'requires_photo', true)
  ))
  on conflict do nothing;

  insert into public.communication_templates (organization_id, template_key, name, body, is_system)
  values
    (org, 'booking_confirmation', 'Booking confirmation',
     E'Hello {{guest_name}}, your stay at {{property_name}} is confirmed.\nCheck-in: {{check_in_date}}\nCheck-out: {{check_out_date}}\nBooking reference: {{booking_reference}}\nTotal: {{total_amount}}\nBalance due: {{balance_due}}\nKaribu!', true),
    (org, 'deposit_received', 'Deposit received',
     E'Hello {{guest_name}}, we have received your payment of {{last_payment_amount}} for booking {{booking_reference}} at {{property_name}}. Balance due: {{balance_due}}. Asante!', true),
    (org, 'balance_due', 'Balance due',
     E'Hello {{guest_name}}, a friendly reminder that a balance of {{balance_due}} is due for your stay at {{property_name}} ({{check_in_date}} – {{check_out_date}}), booking {{booking_reference}}.', true),
    (org, 'directions', 'Directions to the property',
     E'Hello {{guest_name}}, here are directions to {{property_name}}:\n{{directions}}\n{{property_address}}', true),
    (org, 'check_in_instructions', 'Check-in instructions',
     E'Hello {{guest_name}}, we look forward to welcoming you to {{property_name}} on {{check_in_date}} from {{check_in_time}}.\n{{check_in_instructions}}', true),
    (org, 'wifi_instructions', 'Wi-Fi instructions',
     E'Hello {{guest_name}}, Wi-Fi at {{property_name}}:\nNetwork: {{wifi_name}}\nPassword: {{wifi_password}}', true),
    (org, 'check_out_reminder', 'Check-out reminder',
     E'Hello {{guest_name}}, a reminder that check-out from {{property_name}} is on {{check_out_date}} by {{check_out_time}}.\n{{check_out_instructions}}\nThank you for staying with us!', true),
    (org, 'review_request', 'Review request',
     E'Hello {{guest_name}}, thank you for staying at {{property_name}}! We would love to hear about your experience — a short review helps us a lot.', true),
    (org, 'booking_cancellation', 'Booking cancellation',
     E'Hello {{guest_name}}, your booking {{booking_reference}} at {{property_name}} ({{check_in_date}} – {{check_out_date}}) has been cancelled. Please contact us with any questions.', true)
  on conflict (organization_id, template_key) do nothing;
end;
$$;
