-- Properties, rentable units, photos, staff assignments, availability blocks and the
-- unit_occupancy table that enforces non-overlapping stays/blocks per unit.

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  -- generated from the name when left empty
  slug text not null default '' check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (description is null or length(description) <= 5000),
  property_type public.property_type not null default 'apartment',
  location_name text check (location_name is null or length(location_name) <= 120),
  address text check (address is null or length(address) <= 500),
  county text check (county is null or length(county) <= 60),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  bedrooms smallint not null default 1 check (bedrooms between 0 and 50),
  bathrooms numeric(3, 1) not null default 1 check (bathrooms between 0 and 50),
  max_guests smallint not null default 2 check (max_guests between 1 and 100),
  standard_nightly_rate numeric(12, 2) not null default 0 check (standard_nightly_rate >= 0),
  cleaning_fee numeric(12, 2) not null default 0 check (cleaning_fee >= 0),
  amenities text[] not null default '{}',
  check_in_time time,
  check_out_time time,
  check_in_instructions text check (check_in_instructions is null or length(check_in_instructions) <= 5000),
  check_out_instructions text check (check_out_instructions is null or length(check_out_instructions) <= 5000),
  directions text check (directions is null or length(directions) <= 5000),
  house_rules text check (house_rules is null or length(house_rules) <= 5000),
  wifi_name text check (wifi_name is null or length(wifi_name) <= 100),
  wifi_password text check (wifi_password is null or length(wifi_password) <= 100),
  caretaker_id uuid references public.profiles (id) on delete set null,
  status public.property_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (organization_id, id)
);
create index properties_org_status_idx on public.properties (organization_id, status);
create index properties_caretaker_idx on public.properties (caretaker_id);
create trigger properties_updated_at before update on public.properties
  for each row execute function app.set_updated_at();

create table public.property_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  -- null = inherit the property's max_guests
  max_guests smallint check (max_guests is null or max_guests between 1 and 100),
  -- null = use the property's standard_nightly_rate
  nightly_rate_override numeric(12, 2) check (nightly_rate_override is null or nightly_rate_override >= 0),
  is_default boolean not null default false,
  status public.unit_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade,
  unique (organization_id, id),
  unique (property_id, id),
  unique (property_id, name)
);
create index property_units_org_idx on public.property_units (organization_id);
create index property_units_property_idx on public.property_units (property_id);
create unique index property_units_one_default_idx on public.property_units (property_id) where is_default;
create trigger property_units_updated_at before update on public.property_units
  for each row execute function app.set_updated_at();

create table public.property_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  storage_path text not null unique,
  caption text check (caption is null or length(caption) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade
);
create index property_photos_property_idx on public.property_photos (property_id, sort_order);
create index property_photos_org_idx on public.property_photos (organization_id);

create table public.staff_property_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade,
  -- assignee must be a member of the same organization; removing the membership removes assignments
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete cascade,
  unique (property_id, user_id)
);
create index staff_property_assignments_user_idx on public.staff_property_assignments (organization_id, user_id);

create table public.property_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  unit_id uuid not null,
  -- Blocked range is [start_date, end_date): end_date is the first date available again,
  -- matching the booking check-out convention.
  start_date date not null,
  end_date date not null,
  reason public.block_reason not null default 'other',
  notes text check (notes is null or length(notes) <= 2000),
  maintenance_request_id uuid,
  external_event_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade,
  foreign key (property_id, unit_id) references public.property_units (property_id, id) on delete cascade,
  check (end_date > start_date),
  check (end_date - start_date <= 366)
);
create index property_blocks_org_idx on public.property_blocks (organization_id);
create index property_blocks_unit_dates_idx on public.property_blocks (unit_id, start_date, end_date);

-- Single source of truth for occupied unit-nights. Rows are maintained only by triggers on
-- bookings and property_blocks; the exclusion constraint makes overlapping inserts fail even
-- under concurrent transactions.
create table public.unit_occupancy (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  unit_id uuid not null references public.property_units (id) on delete cascade,
  during daterange not null check (not isempty(during) and lower_inc(during) and not upper_inc(during)),
  source_type text not null check (source_type in ('booking', 'block')),
  booking_id uuid unique,
  block_id uuid unique references public.property_blocks (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((source_type = 'booking') = (booking_id is not null)),
  check ((source_type = 'block') = (block_id is not null)),
  constraint unit_occupancy_no_overlap exclude using gist (unit_id with =, during with &&)
);
create index unit_occupancy_org_idx on public.unit_occupancy (organization_id);

-- ---------------------------------------------------------------------------
-- Property scope helper (full definition now that assignments exist)
-- ---------------------------------------------------------------------------
create or replace function app.can_access_property(org uuid, prop uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when app.has_full_property_scope(org) then true
    when app.is_member(org) then exists (
      select 1 from public.staff_property_assignments a
      where a.organization_id = org
        and a.property_id = prop
        and a.user_id = (select auth.uid())
    )
    else false
  end;
$$;

-- Property ids the caller may see in an organization (used by list queries and reports).
create or replace function public.my_property_ids(org uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.properties p
  where p.organization_id = org
    and app.has_perm(org, 'property.view')
    and app.can_access_property(org, p.id);
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function app.properties_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_slug text;
  candidate text;
  n integer := 1;
begin
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'A property cannot be moved to another business.' using errcode = '42501';
  end if;
  -- Slugs are generated once and stay stable on rename (bookmarkable URLs).
  if new.slug is null or new.slug = '' then
    base_slug := coalesce(nullif(app.slugify(new.name), ''), 'property');
    candidate := base_slug;
    while exists (
      select 1 from public.properties
      where organization_id = new.organization_id and slug = candidate and id <> new.id
    ) loop
      n := n + 1;
      candidate := base_slug || '-' || n;
    end loop;
    new.slug := candidate;
  end if;
  new.amenities := coalesce(
    (select array_agg(distinct trim(a)) from unnest(new.amenities) a where trim(a) <> ''),
    '{}'
  );
  if new.caretaker_id is not null and not exists (
    select 1 from public.organization_members m
    where m.organization_id = new.organization_id and m.user_id = new.caretaker_id and m.status = 'active'
  ) then
    raise exception 'The caretaker must be an active staff member of this business.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger properties_before_write
  before insert or update on public.properties
  for each row execute function app.properties_before_write();

create or replace function app.properties_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.property_units (organization_id, property_id, name, is_default)
    values (new.organization_id, new.id, 'Entire property', true);
  end if;
  if new.caretaker_id is not null and (tg_op = 'INSERT' or new.caretaker_id is distinct from old.caretaker_id) then
    insert into public.staff_property_assignments (organization_id, property_id, user_id)
    values (new.organization_id, new.id, new.caretaker_id)
    on conflict (property_id, user_id) do nothing;
  end if;
  return null;
end;
$$;

create trigger properties_after_write
  after insert or update on public.properties
  for each row execute function app.properties_after_write();

create or replace function app.property_units_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.property_id <> old.property_id or new.organization_id <> old.organization_id) then
    raise exception 'A unit cannot be moved to another property.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger property_units_guard
  before update on public.property_units
  for each row execute function app.property_units_guard();

-- Blocks -> occupancy
create or replace function app.sync_block_occupancy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.unit_id <> old.unit_id or new.organization_id <> old.organization_id then
      raise exception 'A block cannot be moved to another unit; delete and recreate it.' using errcode = '42501';
    end if;
    update public.unit_occupancy
      set during = daterange(new.start_date, new.end_date, '[)')
      where block_id = new.id;
    return null;
  end if;
  insert into public.unit_occupancy (organization_id, unit_id, during, source_type, block_id)
  values (new.organization_id, new.unit_id, daterange(new.start_date, new.end_date, '[)'), 'block', new.id);
  return null;
exception
  when exclusion_violation then
    raise exception 'These dates overlap an existing reservation or block for this unit.'
      using errcode = '23P01', hint = 'unit_unavailable';
end;
$$;

create trigger property_blocks_occupancy
  after insert or update on public.property_blocks
  for each row execute function app.sync_block_occupancy();

create trigger property_blocks_stamp_actor
  before insert on public.property_blocks
  for each row execute function app.stamp_actor('created_by');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.properties enable row level security;
alter table public.property_units enable row level security;
alter table public.property_photos enable row level security;
alter table public.staff_property_assignments enable row level security;
alter table public.property_blocks enable row level security;
alter table public.unit_occupancy enable row level security;

create policy properties_select on public.properties for select to authenticated
  using (app.has_perm(organization_id, 'property.view') and app.can_access_property(organization_id, id));
create policy properties_insert on public.properties for insert to authenticated
  with check (app.has_perm(organization_id, 'property.create'));
create policy properties_update on public.properties for update to authenticated
  using (app.has_perm(organization_id, 'property.edit') and app.can_access_property(organization_id, id))
  with check (app.has_perm(organization_id, 'property.edit') and app.can_access_property(organization_id, id));

create policy property_units_select on public.property_units for select to authenticated
  using (app.has_perm(organization_id, 'property.view') and app.can_access_property(organization_id, property_id));
create policy property_units_insert on public.property_units for insert to authenticated
  with check (app.has_perm(organization_id, 'property.edit') and app.can_access_property(organization_id, property_id));
create policy property_units_update on public.property_units for update to authenticated
  using (app.has_perm(organization_id, 'property.edit') and app.can_access_property(organization_id, property_id))
  with check (app.has_perm(organization_id, 'property.edit') and app.can_access_property(organization_id, property_id));

create policy property_photos_select on public.property_photos for select to authenticated
  using (app.has_perm(organization_id, 'property.view') and app.can_access_property(organization_id, property_id));
create policy property_photos_insert on public.property_photos for insert to authenticated
  with check (app.has_perm(organization_id, 'property.edit') and app.can_access_property(organization_id, property_id));
create policy property_photos_update on public.property_photos for update to authenticated
  using (app.has_perm(organization_id, 'property.edit') and app.can_access_property(organization_id, property_id))
  with check (app.has_perm(organization_id, 'property.edit') and app.can_access_property(organization_id, property_id));
create policy property_photos_delete on public.property_photos for delete to authenticated
  using (app.has_perm(organization_id, 'property.edit') and app.can_access_property(organization_id, property_id));

-- Staff can see their own assignments; owners manage all assignments.
create policy staff_property_assignments_select on public.staff_property_assignments for select to authenticated
  using (user_id = (select auth.uid()) or app.has_perm(organization_id, 'staff.manage')
         or (app.has_perm(organization_id, 'property.view') and app.can_access_property(organization_id, property_id)));
create policy staff_property_assignments_insert on public.staff_property_assignments for insert to authenticated
  with check (app.has_perm(organization_id, 'staff.manage'));
create policy staff_property_assignments_delete on public.staff_property_assignments for delete to authenticated
  using (app.has_perm(organization_id, 'staff.manage'));

create policy property_blocks_select on public.property_blocks for select to authenticated
  using (app.has_perm(organization_id, 'property.view') and app.can_access_property(organization_id, property_id));
create policy property_blocks_insert on public.property_blocks for insert to authenticated
  with check (app.has_perm(organization_id, 'block.manage') and app.can_access_property(organization_id, property_id));
create policy property_blocks_update on public.property_blocks for update to authenticated
  using (app.has_perm(organization_id, 'block.manage') and app.can_access_property(organization_id, property_id))
  with check (app.has_perm(organization_id, 'block.manage') and app.can_access_property(organization_id, property_id));
create policy property_blocks_delete on public.property_blocks for delete to authenticated
  using (app.has_perm(organization_id, 'block.manage') and app.can_access_property(organization_id, property_id));

-- Occupancy is read-only to clients; writes happen in security-definer triggers.
create policy unit_occupancy_select on public.unit_occupancy for select to authenticated
  using (
    app.has_perm(organization_id, 'property.view')
    and exists (
      select 1 from public.property_units u
      where u.id = unit_occupancy.unit_id
        and app.can_access_property(u.organization_id, u.property_id)
    )
  );
