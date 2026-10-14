-- Lint fix: explicit text[] initializer in sync_calendar_feed (no behaviour change).
create or replace function public.sync_calendar_feed(feed_id uuid, events jsonb, fetch_error text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  feed public.calendar_feeds;
  run_id uuid;
  e jsonb;
  ev public.external_calendar_events;
  fp text;
  blk uuid;
  n_found integer := 0;
  n_created integer := 0;
  n_updated integer := 0;
  n_removed integer := 0;
  n_conflicts integer := 0;
  seen text[] := array[]::text[];
  horizon date;
begin
  select * into feed from public.calendar_feeds where id = feed_id;
  if feed.id is null then
    raise exception 'Calendar feed not found' using errcode = 'P0002';
  end if;
  horizon := app.org_today(feed.organization_id) - 1;

  insert into public.calendar_sync_runs (organization_id, feed_id) values (feed.organization_id, feed.id) returning id into run_id;

  if fetch_error is not null then
    update public.calendar_sync_runs set status = 'error', error = left(fetch_error, 1000), finished_at = now() where id = run_id;
    update public.calendar_feeds set last_synced_at = now(), last_status = 'error', last_error = left(fetch_error, 1000) where id = feed.id;
    return jsonb_build_object('status', 'error', 'error', fetch_error);
  end if;

  for e in select * from jsonb_array_elements(coalesce(events, '[]'::jsonb)) loop
    -- Past stays are irrelevant for availability.
    continue when (e ->> 'end')::date <= horizon;
    n_found := n_found + 1;
    seen := seen || (e ->> 'uid');
    fp := md5((e ->> 'start') || '|' || (e ->> 'end') || '|' || coalesce(e ->> 'summary', ''));

    select * into ev from public.external_calendar_events x where x.feed_id = feed.id and x.external_uid = e ->> 'uid';
    if ev.id is null then
      insert into public.external_calendar_events (organization_id, feed_id, unit_id, external_uid, fingerprint, summary, start_date, end_date)
      values (feed.organization_id, feed.id, feed.unit_id, e ->> 'uid', fp, nullif(e ->> 'summary', ''), (e ->> 'start')::date, (e ->> 'end')::date)
      returning * into ev;
      n_created := n_created + 1;
    elsif ev.fingerprint <> fp or ev.status <> 'active' or ev.block_id is null then
      if ev.block_id is not null then
        delete from public.property_blocks where id = ev.block_id;
      end if;
      update public.external_calendar_events
        set fingerprint = fp, summary = nullif(e ->> 'summary', ''), start_date = (e ->> 'start')::date,
            end_date = (e ->> 'end')::date, status = 'active', block_id = null, last_seen_at = now()
        where id = ev.id
        returning * into ev;
      n_updated := n_updated + 1;
    else
      update public.external_calendar_events set last_seen_at = now() where id = ev.id;
      continue;
    end if;

    blk := app.try_block_for_event(ev, feed);
    if blk is null then
      update public.external_calendar_events set status = 'conflict' where id = ev.id;
      n_conflicts := n_conflicts + 1;
      perform app.notify_many(feed.organization_id,
        array(select app.recipients(feed.organization_id, feed.property_id, 'managers')),
        'system', 'Calendar conflict: ' || feed.name,
        to_char(ev.start_date, 'DD/MM/YYYY') || ' – ' || to_char(ev.end_date, 'DD/MM/YYYY')
          || ' is booked on ' || feed.source::text || ' but overlaps a stay or block in CoastStay.',
        'booking', null, 'ical-conflict:' || ev.id || ':' || fp);
    else
      update public.external_calendar_events set block_id = blk where id = ev.id;
    end if;
  end loop;

  -- Events no longer in the feed (cancelled on the platform) release their dates.
  for ev in
    select * from public.external_calendar_events x
    where x.feed_id = feed.id and x.status <> 'removed' and not (x.external_uid = any (seen))
      and x.end_date > horizon
  loop
    if ev.block_id is not null then
      delete from public.property_blocks where id = ev.block_id;
    end if;
    update public.external_calendar_events set status = 'removed', block_id = null where id = ev.id;
    n_removed := n_removed + 1;
  end loop;

  update public.calendar_sync_runs
    set status = 'ok', finished_at = now(), events_found = n_found, events_created = n_created,
        events_updated = n_updated, events_removed = n_removed,
        error = case when n_conflicts > 0 then n_conflicts || ' conflicting event(s)' end
    where id = run_id;
  update public.calendar_feeds set last_synced_at = now(), last_status = 'ok', last_error = null where id = feed.id;

  return jsonb_build_object('status', 'ok', 'found', n_found, 'created', n_created, 'updated', n_updated,
                            'removed', n_removed, 'conflicts', n_conflicts);
end;
$$;

