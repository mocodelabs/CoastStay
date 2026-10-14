-- Early check-out: bring the pending turnover clean forward to the actual departure time.
create or replace function app.sync_turnover_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  co_time time;
  ci_time time;
  key text := 'turnover:' || new.id;
  sched timestamptz;
  due timestamptz;
  prop_name text;
  unit_name text;
  new_task uuid;
begin
  if new.status in ('confirmed', 'checked_in', 'checked_out') then
    select o.timezone,
           coalesce(p.check_out_time, s.default_check_out_time, '10:00'),
           coalesce(p.check_in_time, s.default_check_in_time, '14:00'),
           p.name, u.name
      into tz, co_time, ci_time, prop_name, unit_name
    from public.properties p
    join public.organizations o on o.id = p.organization_id
    left join public.organization_settings s on s.organization_id = p.organization_id
    join public.property_units u on u.id = new.unit_id
    where p.id = new.property_id;

    sched := (new.check_out_date + co_time) at time zone tz;
    due := (new.check_out_date + ci_time) at time zone tz;
    if due <= sched then
      due := sched + interval '4 hours';
    end if;

    insert into public.housekeeping_tasks (
      organization_id, property_id, unit_id, booking_id, task_type, title, description,
      scheduled_at, due_at, priority, generation_key
    ) values (
      new.organization_id, new.property_id, new.unit_id, new.id, 'turnover_clean',
      'Turnover clean — ' || prop_name || case when unit_name <> 'Entire property' then ' / ' || unit_name else '' end,
      'Departure of booking ' || new.booking_reference,
      sched, due, 'normal', key
    )
    on conflict (organization_id, generation_key) do nothing
    returning id into new_task;

    if new_task is not null then
      perform app.apply_checklist(new_task);
    elsif tg_op = 'UPDATE' and new.status = 'checked_out' and old.status is distinct from 'checked_out' then
      -- Guest left before the scheduled departure: the clean can start now.
      update public.housekeeping_tasks
        set scheduled_at = least(scheduled_at, now()),
            due_at = case when due_at is null then null else greatest(least(due_at, now() + interval '4 hours'), least(scheduled_at, now())) end
        where organization_id = new.organization_id and generation_key = key and status = 'pending'
          and scheduled_at > now();
    elsif tg_op = 'UPDATE' and (new.check_out_date <> old.check_out_date) then
      update public.housekeeping_tasks
        set scheduled_at = sched, due_at = due
        where organization_id = new.organization_id and generation_key = key and status = 'pending';
    end if;
  elsif new.status in ('cancelled', 'no_show') and tg_op = 'UPDATE' and old.status <> new.status then
    update public.housekeeping_tasks
      set status = 'cancelled', completion_notes = 'Booking ' || new.status
      where organization_id = new.organization_id and generation_key = key and status = 'pending';
  end if;
  return null;
end;
$$;
