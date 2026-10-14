-- In-app notifications, scheduled reminders and queued guest messages.
--
-- public.run_reminders() is idempotent: every notification and queued message carries a dedupe key
-- (unique per organization), so running it every 30 minutes never creates duplicates. Guest messages
-- are only *prepared* (communication_logs.status = 'prepared'); staff send them through WhatsApp
-- hand-off unless an automated provider is configured later.

create table public.reminder_runs (
  id bigint generated always as identity primary key,
  organization_id uuid,
  triggered_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notifications_created integer not null default 0,
  messages_prepared integer not null default 0,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  error text
);
alter table public.reminder_runs enable row level security;
create policy reminder_runs_select on public.reminder_runs for select to authenticated
  using (organization_id is not null and app.has_perm(organization_id, 'org.settings'));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.org_today(org uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone o.timezone)::date from public.organizations o where o.id = org;
$$;

create or replace function app.pref_enabled(org uuid, n_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((s.notification_preferences ->> n_type)::boolean, true)
  from public.organization_settings s where s.organization_id = org;
$$;

-- Active members who should hear about something at a property.
--   operations: owners, assigned managers and assigned housekeeping
--   managers:   owners and assigned managers
--   finance:    owners, finance staff, assigned managers with finance access
--   inventory:  owners and (assigned) managers
create or replace function app.recipients(org uuid, prop uuid, kind text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
  from public.organization_members m
  where m.organization_id = org and m.status = 'active'
    and (
      m.role = 'owner'
      or (kind = 'finance' and m.role = 'finance')
      or (
        m.role in ('manager', 'housekeeping')
        and (kind <> 'finance' or (m.role = 'manager' and m.can_view_finances))
        and (kind <> 'managers' or m.role = 'manager')
        and (kind <> 'inventory' or m.role = 'manager')
        and (prop is null or exists (
          select 1 from public.staff_property_assignments a
          where a.organization_id = org and a.property_id = prop and a.user_id = m.user_id))
      )
    );
$$;

create or replace function app.money_text(amount numeric, currency text)
returns text
language sql
immutable
set search_path = ''
as $$
  select currency || ' ' || to_char(coalesce(amount, 0), 'FM999,999,999,990.00');
$$;

-- Replaces {{key}} placeholders with non-empty values from vars; unknown/empty ones stay visible.
create or replace function app.render_template(body text, vars jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v text;
  out text := body;
begin
  for k, v in select key, value from jsonb_each_text(vars) loop
    if v is not null and btrim(v) <> '' then
      out := regexp_replace(out, '\{\{\s*' || k || '\s*\}\}', replace(v, '\', '\\'), 'g');
    end if;
  end loop;
  return out;
end;
$$;

create or replace function app.booking_template_vars(target uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'guest_name', split_part(g.full_name, ' ', 1),
    'property_name', p.name,
    'property_address', concat_ws(', ', p.address, p.location_name),
    'check_in_date', to_char(b.check_in_date, 'DD/MM/YYYY'),
    'check_out_date', to_char(b.check_out_date, 'DD/MM/YYYY'),
    'check_in_time', to_char(coalesce(p.check_in_time, s.default_check_in_time), 'HH24:MI'),
    'check_out_time', to_char(coalesce(p.check_out_time, s.default_check_out_time), 'HH24:MI'),
    'booking_reference', b.booking_reference,
    'total_amount', app.money_text(b.total_amount, b.currency),
    'balance_due', app.money_text(greatest(b.balance_due, 0), b.currency),
    'check_in_instructions', p.check_in_instructions,
    'check_out_instructions', p.check_out_instructions,
    'directions', p.directions,
    'wifi_name', p.wifi_name,
    'wifi_password', p.wifi_password,
    'business_name', o.name,
    'business_phone', o.contact_phone
  )
  from public.bookings b
  join public.guests g on g.id = b.guest_id
  join public.properties p on p.id = b.property_id
  join public.organizations o on o.id = b.organization_id
  left join public.organization_settings s on s.organization_id = b.organization_id
  where b.id = target;
$$;

-- Prepares a templated guest message once per dedupe key. Returns true if a new row was queued.
create or replace function app.queue_guest_message(target uuid, tpl_key text, dedupe text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  tpl record;
  inserted integer;
begin
  select bk.id, bk.organization_id, bk.guest_id, g.phone, g.anonymized_at
    into b
  from public.bookings bk join public.guests g on g.id = bk.guest_id
  where bk.id = target;
  if b.id is null or b.anonymized_at is not null then
    return false;
  end if;
  select * into tpl from public.communication_templates
  where organization_id = b.organization_id and template_key = tpl_key and is_active;
  if tpl.id is null then
    return false;
  end if;

  insert into public.communication_logs (organization_id, booking_id, guest_id, template_key, channel, recipient, body, status, error, dedupe_key)
  values (
    b.organization_id, b.id, b.guest_id, tpl_key, 'whatsapp', b.phone,
    app.render_template(tpl.body, app.booking_template_vars(b.id)),
    case when b.phone is null then 'skipped' else 'prepared' end,
    case when b.phone is null then 'Guest has no phone number' end,
    dedupe
  )
  on conflict (organization_id, dedupe_key) do nothing;
  get diagnostics inserted = row_count;
  return inserted > 0;
end;
$$;

-- Notifies a set of users; returns how many notifications were created.
create or replace function app.notify_many(
  org uuid, users uuid[], n_type text, n_title text, n_message text, entity_type text, entity_id uuid, dedupe text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not app.pref_enabled(org, case when n_type = 'task_assigned' then 'housekeeping_deadline' else n_type end) then
    return 0;
  end if;
  insert into public.notifications (organization_id, user_id, notification_type, title, message, related_entity_type, related_entity_id, dedupe_key)
  select org, u, n_type, left(n_title, 160), left(coalesce(n_message, ''), 1000), entity_type, entity_id, dedupe
  from unnest(users) u
  where u is not null
  on conflict (organization_id, user_id, dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- The reminder sweep
-- ---------------------------------------------------------------------------
create or replace function app.run_reminders_for(org uuid)
returns table (notifications integer, messages integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := app.org_today(org);
  due_days integer;
  r record;
  n integer := 0;
  m integer := 0;
  week text := to_char(app.org_today(org), 'IYYY-IW');
begin
  select coalesce(s.balance_due_days_before_arrival, 3) into due_days
  from public.organization_settings s where s.organization_id = org;

  -- Arrivals tomorrow → staff heads-up + check-in instructions for the guest.
  for r in
    select b.id, b.property_id, g.full_name, p.name as pname, b.check_in_date
    from public.bookings b join public.guests g on g.id = b.guest_id join public.properties p on p.id = b.property_id
    where b.organization_id = org and b.status in ('pending', 'confirmed') and b.check_in_date = today + 1
  loop
    n := n + app.notify_many(org, array(select app.recipients(org, r.property_id, 'operations')), 'upcoming_check_in',
      'Arrival tomorrow: ' || r.full_name, r.pname || ' · ' || to_char(r.check_in_date, 'DD/MM/YYYY'),
      'booking', r.id, 'arrival:' || r.id);
    if app.queue_guest_message(r.id, 'check_in_instructions', 'msg:check_in:' || r.id) then m := m + 1; end if;
  end loop;

  -- Departures today → housekeeping/manager heads-up + check-out reminder for the guest.
  for r in
    select b.id, b.property_id, g.full_name, p.name as pname
    from public.bookings b join public.guests g on g.id = b.guest_id join public.properties p on p.id = b.property_id
    where b.organization_id = org and b.status in ('confirmed', 'checked_in') and b.check_out_date = today
  loop
    n := n + app.notify_many(org, array(select app.recipients(org, r.property_id, 'operations')), 'upcoming_departure',
      'Departure today: ' || r.full_name, r.pname || ' — turnover clean due', 'booking', r.id, 'departure:' || r.id);
    if app.queue_guest_message(r.id, 'check_out_reminder', 'msg:check_out:' || r.id) then m := m + 1; end if;
  end loop;

  -- Overdue balances (balance due N days before arrival) → finance staff daily; guest reminder once.
  for r in
    select b.id, b.property_id, g.full_name, b.balance_due, b.currency, b.check_in_date
    from public.bookings b join public.guests g on g.id = b.guest_id
    where b.organization_id = org and b.status in ('pending', 'confirmed', 'checked_in')
      and b.balance_due > 0 and b.check_in_date - due_days <= today
  loop
    n := n + app.notify_many(org, array(select app.recipients(org, r.property_id, 'finance')), 'overdue_balance',
      'Balance overdue: ' || r.full_name,
      app.money_text(r.balance_due, r.currency) || ' due · arrives ' || to_char(r.check_in_date, 'DD/MM/YYYY'),
      'booking', r.id, 'overdue:' || r.id || ':' || today);
    if app.queue_guest_message(r.id, 'balance_due', 'msg:balance:' || r.id) then m := m + 1; end if;
  end loop;

  -- Review request the day after check-out.
  for r in
    select b.id from public.bookings b
    where b.organization_id = org and b.status = 'checked_out' and b.check_out_date = today - 1
  loop
    if app.queue_guest_message(r.id, 'review_request', 'msg:review:' || r.id) then m := m + 1; end if;
  end loop;

  -- Housekeeping: due within 12 hours, or overdue.
  for r in
    select t.id, t.property_id, t.title, t.assigned_to, t.due_at, t.due_at < now() as overdue
    from public.housekeeping_tasks t
    where t.organization_id = org and t.status in ('pending', 'in_progress')
      and t.due_at is not null and t.due_at < now() + interval '12 hours'
  loop
    n := n + app.notify_many(org,
      case when r.assigned_to is not null and not r.overdue then array[r.assigned_to]
           else array(select app.recipients(org, r.property_id, 'managers')) || r.assigned_to end,
      'housekeeping_deadline',
      case when r.overdue then 'Overdue: ' else 'Due soon: ' end || r.title,
      'Due ' || to_char(r.due_at at time zone (select o.timezone from public.organizations o where o.id = org), 'DD/MM/YYYY HH24:MI'),
      'housekeeping_task', r.id,
      case when r.overdue then 'hk-overdue:' || r.id || ':' || today else 'hk-due:' || r.id end);
  end loop;

  -- Maintenance: urgent open requests and missed target dates, daily.
  for r in
    select q.id, q.property_id, q.title, q.priority, q.target_date
    from public.maintenance_requests q
    where q.organization_id = org and q.status not in ('resolved', 'closed')
      and (q.priority = 'urgent' or q.target_date < today)
  loop
    n := n + app.notify_many(org, array(select app.recipients(org, r.property_id, 'managers')), 'maintenance',
      case when r.priority = 'urgent' then 'Urgent repair open: ' else 'Repair overdue: ' end || r.title,
      case when r.target_date is not null then 'Target ' || to_char(r.target_date, 'DD/MM/YYYY') else '' end,
      'maintenance_request', r.id, 'mx:' || r.id || ':' || today);
  end loop;

  -- Low stock, at most weekly per item.
  for r in
    select i.id, i.property_id, i.name, i.quantity_on_hand, i.unit_of_measure
    from public.inventory_items i
    where i.organization_id = org and i.is_active and i.is_low_stock
  loop
    n := n + app.notify_many(org, array(select app.recipients(org, r.property_id, 'inventory')), 'low_stock',
      'Low stock: ' || r.name, r.quantity_on_hand || ' ' || r.unit_of_measure || ' left',
      'inventory_item', r.id, 'low:' || r.id || ':' || week);
  end loop;

  return query select n, m;
end;
$$;

-- Runs the sweep. Without a signed-in user (pg_cron) it processes every organization; an owner can
-- run it for their own organization from Settings.
create or replace function public.run_reminders(target_org uuid default null)
returns table (organization_id uuid, notifications integer, messages integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  org uuid;
  res record;
  run_id bigint;
begin
  if uid is not null and (target_org is null or not app.has_perm(target_org, 'org.settings')) then
    raise exception 'Only an owner can run reminders for their business.' using errcode = '42501';
  end if;
  for org in
    select o.id from public.organizations o where target_org is null or o.id = target_org
  loop
    insert into public.reminder_runs (organization_id, triggered_by) values (org, uid) returning id into run_id;
    begin
      select * into res from app.run_reminders_for(org);
      update public.reminder_runs
        set finished_at = now(), status = 'ok', notifications_created = res.notifications, messages_prepared = res.messages
        where id = run_id;
      organization_id := org;
      notifications := res.notifications;
      messages := res.messages;
      return next;
    exception when others then
      update public.reminder_runs set finished_at = now(), status = 'error', error = sqlerrm where id = run_id;
    end;
  end loop;
end;
$$;

revoke execute on function public.run_reminders(uuid) from anon, public;
grant execute on function public.run_reminders(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Immediate notifications
-- ---------------------------------------------------------------------------
create or replace function app.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null and new.assigned_to is distinct from (select auth.uid())
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform app.notify_many(new.organization_id, array[new.assigned_to], 'task_assigned',
      'New task: ' || new.title,
      'Scheduled ' || to_char(new.scheduled_at at time zone (select o.timezone from public.organizations o where o.id = new.organization_id), 'DD/MM/YYYY HH24:MI'),
      'housekeeping_task', new.id, 'assigned:' || new.id || ':' || new.assigned_to);
  end if;
  return null;
end;
$$;

create trigger housekeeping_tasks_notify_assignment
  after insert or update of assigned_to on public.housekeeping_tasks
  for each row execute function app.notify_task_assignment();

create or replace function app.notify_maintenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.priority in ('urgent', 'high') then
    perform app.notify_many(new.organization_id,
      array(select u from app.recipients(new.organization_id, new.property_id, 'managers') u where u is distinct from (select auth.uid())),
      'maintenance', initcap(new.priority::text) || ' repair reported: ' || new.title, coalesce(left(new.description, 200), ''),
      'maintenance_request', new.id, 'mx-new:' || new.id);
  end if;
  if new.assigned_to is not null and new.assigned_to is distinct from (select auth.uid())
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform app.notify_many(new.organization_id, array[new.assigned_to], 'maintenance',
      'Repair assigned to you: ' || new.title, '', 'maintenance_request', new.id, 'mx-assigned:' || new.id || ':' || new.assigned_to);
  end if;
  return null;
end;
$$;

create trigger maintenance_requests_notify
  after insert or update of assigned_to on public.maintenance_requests
  for each row execute function app.notify_maintenance();

-- ---------------------------------------------------------------------------
-- Prepared messages: staff may mark them opened (sent via WhatsApp) or skipped.
-- ---------------------------------------------------------------------------
create policy communication_logs_update on public.communication_logs for update to authenticated
  using (app.has_perm(organization_id, 'comms.send')
         and (booking_id is null and app.has_full_property_scope(organization_id)
              or exists (select 1 from public.bookings b where b.id = communication_logs.booking_id
                         and app.can_access_property(b.organization_id, b.property_id))))
  with check (app.has_perm(organization_id, 'comms.send'));

create or replace function app.communication_logs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (
       new.body <> old.body or new.recipient is distinct from old.recipient or new.booking_id is distinct from old.booking_id
       or new.organization_id <> old.organization_id or new.dedupe_key is distinct from old.dedupe_key
       or not (old.status = 'prepared' and new.status in ('opened', 'skipped'))) then
    raise exception 'Only prepared messages can be marked as sent or skipped.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger communication_logs_guard before update on public.communication_logs
  for each row execute function app.communication_logs_guard();

-- ---------------------------------------------------------------------------
-- Schedule (pg_cron). Hosted Supabase: enable the pg_cron extension in the dashboard first.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('coaststay-reminders', '*/30 * * * *', 'select public.run_reminders()');
  else
    raise notice 'pg_cron not available: schedule public.run_reminders() externally.';
  end if;
end;
$$;
