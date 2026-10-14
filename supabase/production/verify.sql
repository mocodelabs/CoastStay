-- Read-only go-live checks. Run in the SQL editor of the target project; every row should say ok.
-- Safe to run at any time: it changes nothing.

with checks(check_name, ok, detail) as (
  select 'migrations applied',
         (select count(*) from supabase_migrations.schema_migrations) >= 20,
         (select count(*) || ' recorded, latest ' || max(version) from supabase_migrations.schema_migrations)
  union all
  select 'pg_cron enabled',
         exists (select 1 from pg_extension where extname = 'pg_cron'), null
  union all
  select 'reminders scheduled',
         exists (select 1 from cron.job where jobname = 'coaststay-reminders' and active), null
  union all
  select 'calendar sync scheduled',
         exists (select 1 from cron.job where jobname = 'coaststay-ical-sync' and active),
         'optional until a calendar feed is added'
  union all
  select 'calendar sync secrets in vault',
         (select count(*) from vault.secrets where name in ('project_url', 'ical_sync_secret')) = 2,
         'optional until a calendar feed is added'
  union all
  select 'RLS on every public table',
         not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
         (select string_agg(tablename, ', ') from pg_tables where schemaname = 'public' and not rowsecurity)
  union all
  select 'security-definer functions pin search_path',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public', 'app') and p.prosecdef
                       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
         null
  union all
  select 'self-service businesses disabled',
         not (select allow_self_service_orgs from public.platform_settings where id), null
  union all
  select 'bootstrap owner reserved (or business exists)',
         exists (select 1 from public.organizations)
           or (select bootstrap_owner_email is not null from public.platform_settings where id),
         'set platform_settings.bootstrap_owner_email before publishing the URL'
  union all
  select 'storage buckets present',
         (select count(*) from storage.buckets
           where id in ('property-photos', 'receipts', 'task-photos', 'maintenance-attachments', 'branding')) = 5, null
  union all
  select 'private buckets are private',
         not exists (select 1 from storage.buckets
                     where id in ('property-photos', 'receipts', 'task-photos', 'maintenance-attachments') and public), null
  union all
  select 'reminders ran in the last hour',
         exists (select 1 from public.reminder_runs where started_at > now() - interval '1 hour'),
         'expected false for the first 30 minutes after deploy'
)
select case when ok then 'ok' else 'CHECK' end as result, check_name, detail from checks;
