-- Production bootstrap safeguard.
--
-- On an empty deployment the first signed-in user may create the business and becomes its owner.
-- Between deploying and the administrator signing up, anyone who found the URL could claim it.
-- Setting platform_settings.bootstrap_owner_email (service role / SQL editor only — the table has
-- no client policies) restricts that first business to the named, confirmed email address.
-- NULL keeps the previous behaviour (local development, tests).

alter table public.platform_settings
  add column bootstrap_owner_email extensions.citext;

-- Single source of truth for "may this user create a business right now?".
create or replace function app.may_create_organization(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid is not null
    and case
      when exists (select 1 from public.organizations) then
        (select ps.allow_self_service_orgs from public.platform_settings ps where ps.id)
      else
        coalesce(
          (select ps.bootstrap_owner_email is null
               or exists (select 1 from auth.users u
                          where u.id = uid
                            and u.email_confirmed_at is not null
                            and lower(u.email) = lower(ps.bootstrap_owner_email::text))
             from public.platform_settings ps where ps.id),
          true)
    end;
$$;

revoke all on function app.may_create_organization(uuid) from public, anon, authenticated;

create or replace function public.can_create_organization()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.may_create_organization((select auth.uid()));
$$;

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

  if not app.may_create_organization(uid) then
    if exists (select 1 from public.organizations) then
      raise exception 'Creating additional businesses is disabled on this deployment. Ask an owner to invite you.'
        using errcode = '42501', hint = 'org_creation_disabled';
    end if;
    raise exception 'This deployment is reserved for its administrator. Sign in with the administrator email address.'
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
