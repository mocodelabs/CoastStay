-- Removing a calendar feed releases the dates it blocked (blocks would otherwise be orphaned when
-- the feed's events cascade-delete). The external-block guard honours a transaction-local flag so
-- only this server-side path may remove imported blocks.

create or replace function app.guard_external_blocks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and old.reason = 'external_calendar'
     and coalesce(current_setting('coaststay.calendar_sync', true), '') <> 'on' then
    raise exception 'This block comes from an external calendar. Change it on the platform; the next sync updates it.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function app.release_feed_blocks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('coaststay.calendar_sync', 'on', true);
  delete from public.property_blocks b
  using public.external_calendar_events e
  where e.feed_id = old.id and b.id = e.block_id;
  perform set_config('coaststay.calendar_sync', 'off', true);
  return old;
end;
$$;

create trigger calendar_feeds_release_blocks
  before delete on public.calendar_feeds
  for each row execute function app.release_feed_blocks();

-- Deactivating a feed keeps its blocks until it is removed or synced again.
