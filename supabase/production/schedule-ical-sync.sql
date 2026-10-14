-- Schedule the `ical-sync` Edge Function (hourly) on a hosted Supabase project.
--
-- Run ONCE per environment in the SQL editor, after migrations and after deploying the function.
-- Not a migration: it needs per-project values, and secrets must not be committed.
--
-- Before running:
--   1. Database → Extensions: enable pg_cron and pg_net (Vault is enabled by default).
--   2. Generate a random secret (at least 32 characters), e.g. `openssl rand -hex 32`.
--   3. Give the SAME value to the function:
--        npx supabase secrets set ICAL_SYNC_SECRET=<secret> --project-ref <ref>
--   4. Replace the two placeholders below. Do not save this file with real values.
--
-- The scheduler never holds the service-role key: it presents only ICAL_SYNC_SECRET, which can sync
-- calendars and nothing else. Rotate it by updating both the Vault secret and the function secret.

select vault.create_secret('https://<project-ref>.supabase.co', 'project_url', 'CoastStay API URL for scheduled jobs');
select vault.create_secret('<ICAL_SYNC_SECRET>', 'ical_sync_secret', 'Shared secret for the ical-sync Edge Function');

-- Re-running replaces the job instead of duplicating it.
select cron.unschedule('coaststay-ical-sync') where exists (select 1 from cron.job where jobname = 'coaststay-ical-sync');

select cron.schedule(
  'coaststay-ical-sync',
  '7 * * * *',   -- hourly, off the hour
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/ical-sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ical_sync_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

-- Check (after the next run):
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select status_code, left(content, 300), created from net._http_response order by created desc limit 5;
--   select status, events_found, error, started_at from public.calendar_sync_runs order by started_at desc limit 10;
--
-- Rotate the secret:
--   select vault.update_secret((select id from vault.secrets where name = 'ical_sync_secret'), '<new secret>');
--   npx supabase secrets set ICAL_SYNC_SECRET=<new secret> --project-ref <ref>
