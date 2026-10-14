-- RLS for tenancy tables, staff invitations, guest anonymization, storage buckets and grants.

-- ---------------------------------------------------------------------------
-- Tenancy RLS
-- ---------------------------------------------------------------------------
alter table public.platform_settings enable row level security;   -- no client policies
alter table public.organizations enable row level security;
alter table public.organization_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;

create policy organizations_select on public.organizations for select to authenticated
  using (app.is_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (app.has_perm(id, 'org.settings'))
  with check (app.has_perm(id, 'org.settings'));

create policy organization_settings_select on public.organization_settings for select to authenticated
  using (app.is_member(organization_id));
create policy organization_settings_update on public.organization_settings for update to authenticated
  using (app.has_perm(organization_id, 'org.settings'))
  with check (app.has_perm(organization_id, 'org.settings'));

-- Profiles are visible to yourself and to people you share an organization with.
create or replace function app.shares_org_with(profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid()) and mine.status = 'active'
      and theirs.user_id = profile
  );
$$;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.shares_org_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create or replace function app.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or (new.email is distinct from old.email and (select auth.uid()) is not null) then
    raise exception 'Email is managed by authentication settings.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function app.profiles_guard();

create policy organization_members_select on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or app.is_member(organization_id));
create policy organization_members_update on public.organization_members for update to authenticated
  using (app.has_perm(organization_id, 'staff.manage'))
  with check (app.has_perm(organization_id, 'staff.manage'));
create policy organization_members_delete on public.organization_members for delete to authenticated
  using (app.has_perm(organization_id, 'staff.manage'));
-- Memberships are created only by create_organization() and accept_invitation().

create policy organization_invitations_select on public.organization_invitations for select to authenticated
  using (app.has_perm(organization_id, 'staff.manage'));
create policy organization_invitations_update on public.organization_invitations for update to authenticated
  using (app.has_perm(organization_id, 'staff.manage'))
  with check (app.has_perm(organization_id, 'staff.manage'));

create or replace function app.invitations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Clients may only revoke an open invitation.
  if (select auth.uid()) is not null and (
       new.token_hash <> old.token_hash or new.email <> old.email or new.role <> old.role
       or new.organization_id <> old.organization_id or new.accepted_at is distinct from old.accepted_at
       or new.accepted_by is distinct from old.accepted_by or new.property_ids <> old.property_ids
       or new.can_view_finances <> old.can_view_finances or new.expires_at <> old.expires_at
       or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)) then
    if coalesce(current_setting('coaststay.invite_rpc', true), '') <> 'on' then
      raise exception 'Invitations can only be revoked.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger organization_invitations_guard before update on public.organization_invitations
  for each row execute function app.invitations_guard();

-- ---------------------------------------------------------------------------
-- Invitation RPCs
-- ---------------------------------------------------------------------------

-- Returns the raw invitation token once; only its SHA-256 hash is stored.
create or replace function public.create_invitation(
  org uuid,
  invite_email text,
  invite_role public.member_role,
  invite_full_name text default null,
  invite_can_view_finances boolean default false,
  invite_property_ids uuid[] default '{}'
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_token text := encode(extensions.gen_random_bytes(24), 'hex');
  clean_email text := lower(trim(invite_email));
  inv public.organization_invitations;
begin
  if not app.has_perm(org, 'staff.manage') then
    raise exception 'Only an owner can invite staff.' using errcode = '42501';
  end if;
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
    where m.organization_id = org and p.email = clean_email::extensions.citext
  ) then
    raise exception 'This person is already a staff member.' using errcode = '23505';
  end if;
  if exists (
    select 1 from unnest(coalesce(invite_property_ids, '{}')) pid
    where not exists (select 1 from public.properties p where p.id = pid and p.organization_id = org)
  ) then
    raise exception 'One of the selected properties does not belong to this business.' using errcode = '23503';
  end if;

  perform set_config('coaststay.invite_rpc', 'on', true);
  update public.organization_invitations i
    set revoked_at = now()
    where i.organization_id = org and i.email = clean_email::extensions.citext
      and i.accepted_at is null and i.revoked_at is null;

  insert into public.organization_invitations (
    organization_id, email, full_name, role, can_view_finances, property_ids, token_hash, invited_by
  ) values (
    org, clean_email, nullif(trim(invite_full_name), ''), invite_role,
    invite_role = 'manager' and coalesce(invite_can_view_finances, false),
    case when invite_role in ('owner', 'finance') then '{}' else coalesce(invite_property_ids, '{}') end,
    encode(sha256(convert_to(raw_token, 'UTF8')), 'hex'), (select auth.uid())
  ) returning * into inv;
  perform set_config('coaststay.invite_rpc', 'off', true);

  return query select inv.id, raw_token, inv.expires_at;
end;
$$;

-- Lets the accept page show who invited you before you sign in. Reveals nothing without the token.
create or replace function public.get_invitation(invite_token text)
returns table (organization_name text, email text, role public.member_role, expires_at timestamptz, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, i.email::text, i.role, i.expires_at,
    case
      when i.accepted_at is not null then 'accepted'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at < now() then 'expired'
      else 'open'
    end
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token_hash = encode(sha256(convert_to(coalesce(invite_token, ''), 'UTF8')), 'hex');
$$;

create or replace function public.accept_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  user_email text;
  inv public.organization_invitations;
begin
  if uid is null then
    raise exception 'Sign in to accept the invitation.' using errcode = '42501';
  end if;
  select * into inv from public.organization_invitations
  where token_hash = encode(sha256(convert_to(coalesce(invite_token, ''), 'UTF8')), 'hex')
  for update;
  if inv.id is null or inv.revoked_at is not null then
    raise exception 'This invitation is not valid.' using errcode = 'P0002', hint = 'invite_invalid';
  end if;
  if inv.accepted_at is not null then
    raise exception 'This invitation has already been used.' using errcode = 'P0002', hint = 'invite_used';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invitation has expired. Ask the owner for a new one.' using errcode = 'P0002', hint = 'invite_expired';
  end if;

  select email into user_email from auth.users where id = uid;
  if lower(user_email) <> lower(inv.email::text) then
    raise exception 'This invitation was sent to a different email address.' using errcode = '42501', hint = 'invite_email_mismatch';
  end if;
  if exists (select 1 from public.organization_members where organization_id = inv.organization_id and user_id = uid) then
    raise exception 'You are already a member of this business.' using errcode = '23505';
  end if;

  insert into public.profiles (id, email, full_name)
  values (uid, user_email, coalesce(inv.full_name, split_part(user_email, '@', 1)))
  on conflict (id) do update
    set full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end;

  insert into public.organization_members (organization_id, user_id, role, can_view_finances)
  values (inv.organization_id, uid, inv.role, inv.can_view_finances);

  insert into public.staff_property_assignments (organization_id, property_id, user_id)
  select inv.organization_id, p.id, uid
  from public.properties p
  where p.organization_id = inv.organization_id and p.id = any (inv.property_ids)
  on conflict (property_id, user_id) do nothing;

  perform set_config('coaststay.invite_rpc', 'on', true);
  update public.organization_invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  perform set_config('coaststay.invite_rpc', 'off', true);

  return inv.organization_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guest data minimization
-- ---------------------------------------------------------------------------
-- Removes personal data while keeping booking and financial history intact.
create or replace function public.anonymize_guest(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
begin
  select organization_id into org from public.guests where id = target;
  if org is null or app.member_role(org) is distinct from 'owner' then
    raise exception 'Only an owner can anonymize guest records.' using errcode = '42501';
  end if;
  update public.guests
    set full_name = 'Anonymized guest', email = null, phone = null, country = null,
        preferences = null, notes = null, anonymized_at = now()
    where id = target;
  update public.communication_logs set recipient = null, body = '[removed]' where guest_id = target;
  insert into public.audit_logs (organization_id, actor_id, entity_type, entity_id, action, changes)
  values (org, (select auth.uid()), 'guests', target, 'update', jsonb_build_object('anonymized', true));
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage buckets and policies. Object paths: <organization_id>/<entity_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('property-photos', 'property-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('task-photos', 'task-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('maintenance-attachments', 'maintenance-attachments', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('branding', 'branding', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Safe uuid extraction from an object path segment (null if not a uuid).
create or replace function app.path_uuid(object_name text, idx integer)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then s::uuid end
  from (select split_part(object_name, '/', idx) as s) x;
$$;

-- Helper instead of an inline subquery: inside a policy on storage.objects, an unqualified `name`
-- in a subquery over properties would bind to properties.name.
create or replace function app.property_in_org(org uuid, prop uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.properties p where p.id = prop and p.organization_id = org);
$$;

create policy "property photos read" on storage.objects for select to authenticated
  using (bucket_id = 'property-photos'
         and app.has_perm(app.path_uuid(name, 1), 'property.view')
         and app.can_access_property(app.path_uuid(name, 1), app.path_uuid(name, 2)));
create policy "property photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-photos'
              and app.has_perm(app.path_uuid(name, 1), 'property.edit')
              and app.can_access_property(app.path_uuid(name, 1), app.path_uuid(name, 2))
              and app.property_in_org(app.path_uuid(name, 1), app.path_uuid(name, 2)));
create policy "property photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'property-photos'
         and app.has_perm(app.path_uuid(name, 1), 'property.edit')
         and app.can_access_property(app.path_uuid(name, 1), app.path_uuid(name, 2)));

-- receipts/<org>/<expense or upload batch id>/<file>
create policy "receipts read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and app.has_perm(app.path_uuid(name, 1), 'finance.view'));
create policy "receipts write" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and app.has_perm(app.path_uuid(name, 1), 'finance.record'));
create policy "receipts delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and owner_id = (select auth.uid())::text
         and app.has_perm(app.path_uuid(name, 1), 'finance.record'));

create policy "task photos read" on storage.objects for select to authenticated
  using (bucket_id = 'task-photos' and app.can_view_task(app.path_uuid(name, 1), app.path_uuid(name, 2)));
create policy "task photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-photos' and app.can_work_task(app.path_uuid(name, 1), app.path_uuid(name, 2)));
create policy "task photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'task-photos' and owner_id = (select auth.uid())::text);

create policy "maintenance files read" on storage.objects for select to authenticated
  using (bucket_id = 'maintenance-attachments'
         and app.can_view_maintenance(app.path_uuid(name, 1), app.path_uuid(name, 2)));
create policy "maintenance files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'maintenance-attachments'
              and app.can_view_maintenance(app.path_uuid(name, 1), app.path_uuid(name, 2))
              and app.has_perm(app.path_uuid(name, 1), 'maintenance.report'));
create policy "maintenance files delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'maintenance-attachments' and owner_id = (select auth.uid())::text);

-- branding is a public bucket (logos appear on printed confirmations); only owners write.
create policy "branding write" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and app.has_perm(app.path_uuid(name, 1), 'org.settings'));
create policy "branding update" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and app.has_perm(app.path_uuid(name, 1), 'org.settings'));
create policy "branding delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and app.has_perm(app.path_uuid(name, 1), 'org.settings'));

-- ---------------------------------------------------------------------------
-- Grants: the anonymous role gets nothing except the invitation preview.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.get_invitation(text) to anon;

revoke execute on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;
