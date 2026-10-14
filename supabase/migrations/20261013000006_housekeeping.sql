-- Housekeeping: checklist templates, tasks, checklist items, comments, inspection photos,
-- recurring templates, and idempotent turnover-task generation from bookings.

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  task_type public.task_type not null default 'turnover_clean',
  -- Used automatically for generated tasks of this type.
  is_default boolean not null default false,
  -- [{ "label": "Clean bathrooms", "requires_photo": false }, ...]
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index checklist_templates_default_idx on public.checklist_templates (organization_id, task_type) where is_default;
create trigger checklist_templates_updated_at before update on public.checklist_templates
  for each row execute function app.set_updated_at();

create table public.housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  unit_id uuid not null,
  booking_id uuid,
  task_type public.task_type not null default 'turnover_clean',
  title text not null check (length(trim(title)) between 2 and 160),
  description text check (description is null or length(description) <= 2000),
  assigned_to uuid,
  scheduled_at timestamptz not null,
  due_at timestamptz,
  status public.task_status not null default 'pending',
  priority public.priority_level not null default 'normal',
  inspection_required boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  completion_notes text check (completion_notes is null or length(completion_notes) <= 2000),
  inspected_by uuid references public.profiles (id) on delete set null,
  inspected_at timestamptz,
  -- Idempotency key for generated tasks, e.g. 'turnover:<booking id>' or 'recurring:<template>:<date>'.
  generation_key text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade,
  foreign key (property_id, unit_id) references public.property_units (property_id, id) on delete cascade,
  foreign key (organization_id, booking_id) references public.bookings (organization_id, id),
  foreign key (organization_id, assigned_to) references public.organization_members (organization_id, user_id) on delete set null (assigned_to),
  unique (organization_id, generation_key),
  unique (organization_id, id),
  check (due_at is null or due_at >= scheduled_at),
  check ((status = 'completed') = (completed_at is not null))
);
create index housekeeping_tasks_org_sched_idx on public.housekeeping_tasks (organization_id, scheduled_at);
create index housekeeping_tasks_org_status_idx on public.housekeeping_tasks (organization_id, status);
create index housekeeping_tasks_property_idx on public.housekeeping_tasks (property_id, scheduled_at);
create index housekeeping_tasks_assignee_idx on public.housekeeping_tasks (assigned_to, status);
create index housekeeping_tasks_booking_idx on public.housekeeping_tasks (booking_id);
create trigger housekeeping_tasks_updated_at before update on public.housekeeping_tasks
  for each row execute function app.set_updated_at();
create trigger housekeeping_tasks_stamp_actor before insert on public.housekeeping_tasks
  for each row execute function app.stamp_actor('created_by');

create table public.housekeeping_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  label text not null check (length(trim(label)) between 1 and 160),
  requires_photo boolean not null default false,
  is_completed boolean not null default false,
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  notes text check (notes is null or length(notes) <= 500),
  sort_order integer not null default 0,
  foreign key (organization_id, task_id) references public.housekeeping_tasks (organization_id, id) on delete cascade
);
create index housekeeping_checklist_items_task_idx on public.housekeeping_checklist_items (task_id, sort_order);

create table public.housekeeping_task_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, task_id) references public.housekeeping_tasks (organization_id, id) on delete cascade
);
create index housekeeping_task_comments_task_idx on public.housekeeping_task_comments (task_id, created_at);
create trigger housekeeping_task_comments_stamp_actor before insert on public.housekeeping_task_comments
  for each row execute function app.stamp_actor('author_id');

create table public.housekeeping_task_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  checklist_item_id uuid references public.housekeeping_checklist_items (id) on delete set null,
  storage_path text not null unique,
  caption text check (caption is null or length(caption) <= 200),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, task_id) references public.housekeeping_tasks (organization_id, id) on delete cascade
);
create index housekeeping_task_photos_task_idx on public.housekeeping_task_photos (task_id);
create trigger housekeeping_task_photos_stamp_actor before insert on public.housekeeping_task_photos
  for each row execute function app.stamp_actor('uploaded_by');

create table public.recurring_task_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  unit_id uuid,
  task_type public.task_type not null default 'deep_clean',
  title text not null check (length(trim(title)) between 2 and 160),
  description text check (description is null or length(description) <= 2000),
  frequency text not null check (frequency in ('weekly', 'monthly')),
  interval_count smallint not null default 1 check (interval_count between 1 and 12),
  next_due_on date not null,
  assigned_to uuid,
  priority public.priority_level not null default 'normal',
  checklist_template_id uuid references public.checklist_templates (id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade,
  foreign key (property_id, unit_id) references public.property_units (property_id, id) on delete cascade,
  foreign key (organization_id, assigned_to) references public.organization_members (organization_id, user_id) on delete set null (assigned_to)
);
create index recurring_task_templates_due_idx on public.recurring_task_templates (is_active, next_due_on);
create trigger recurring_task_templates_updated_at before update on public.recurring_task_templates
  for each row execute function app.set_updated_at();
create trigger recurring_task_templates_stamp_actor before insert on public.recurring_task_templates
  for each row execute function app.stamp_actor('created_by');

-- ---------------------------------------------------------------------------
-- Task rules
-- ---------------------------------------------------------------------------

-- Copies the organization's default checklist for a task type onto a task.
create or replace function app.apply_checklist(task uuid, template uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  tpl_items jsonb;
begin
  select * into t from public.housekeeping_tasks where id = task;
  if template is not null then
    select items into tpl_items from public.checklist_templates
    where id = template and organization_id = t.organization_id;
  else
    select items into tpl_items from public.checklist_templates
    where organization_id = t.organization_id and task_type = t.task_type and is_default;
  end if;
  if tpl_items is null then
    return;
  end if;
  insert into public.housekeeping_checklist_items (organization_id, task_id, label, requires_photo, sort_order)
  select t.organization_id, t.id, left(trim(e.value ->> 'label'), 160),
         coalesce((e.value ->> 'requires_photo')::boolean, false), e.ordinality::integer
  from jsonb_array_elements(tpl_items) with ordinality as e(value, ordinality)
  where coalesce(trim(e.value ->> 'label'), '') <> '';
end;
$$;

-- Workers (housekeeping.work without housekeeping.manage) may only progress their own task.
create or replace function app.housekeeping_tasks_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  is_manager boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
    return new;
  end if;

  if new.organization_id <> old.organization_id or new.property_id <> old.property_id
     or new.generation_key is distinct from old.generation_key or new.created_by is distinct from old.created_by then
    raise exception 'Task business, property and origin cannot be changed.' using errcode = '42501';
  end if;
  if new.unit_id <> old.unit_id or new.booking_id is distinct from old.booking_id then
    raise exception 'Task unit and booking cannot be changed.' using errcode = '42501';
  end if;

  is_manager := uid is null or app.has_perm(new.organization_id, 'housekeeping.manage');

  if not is_manager then
    if new.title <> old.title or new.description is distinct from old.description
       or new.task_type <> old.task_type or new.scheduled_at <> old.scheduled_at
       or new.due_at is distinct from old.due_at or new.priority <> old.priority
       or new.inspection_required <> old.inspection_required
       or new.inspected_by is distinct from old.inspected_by or new.inspected_at is distinct from old.inspected_at then
      raise exception 'Only a manager can change task details.' using errcode = '42501';
    end if;
    -- Claiming an unassigned task is allowed; reassigning is not.
    if new.assigned_to is distinct from old.assigned_to
       and not (old.assigned_to is null and new.assigned_to = uid) then
      raise exception 'Only a manager can reassign tasks.' using errcode = '42501';
    end if;
    if new.status <> old.status and not (
      (old.status = 'pending' and new.status = 'in_progress')
      or (old.status = 'in_progress' and new.status = 'pending')
      or (old.status = 'in_progress' and new.status = 'awaiting_inspection' and old.inspection_required)
      or (old.status = 'in_progress' and new.status = 'completed' and not old.inspection_required)
    ) then
      raise exception 'You cannot move this task from % to %.', old.status, new.status using errcode = '42501';
    end if;
  else
    -- Unassigning (e.g. the staff member was removed) is fine; rescheduling/reassigning is not.
    if old.status in ('completed', 'cancelled') and new.status = old.status
       and (new.scheduled_at <> old.scheduled_at
            or (new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null)) then
      raise exception 'Reopen the task before changing it.' using errcode = '23514';
    end if;
  end if;

  if new.status <> old.status then
    if new.status = 'in_progress' and new.started_at is null then
      new.started_at := now();
    end if;
    if new.status = 'completed' then
      new.completed_at := now();
      if old.status = 'awaiting_inspection' or new.inspection_required then
        if not is_manager then
          raise exception 'A manager must sign off this task.' using errcode = '42501';
        end if;
        new.inspected_by := uid;
        new.inspected_at := now();
      end if;
    else
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger housekeeping_tasks_before_write
  before insert or update on public.housekeeping_tasks
  for each row execute function app.housekeeping_tasks_before_write();

create or replace function app.checklist_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if tg_op = 'UPDATE' then
    if new.task_id <> old.task_id or new.organization_id <> old.organization_id then
      raise exception 'Checklist items cannot be moved.' using errcode = '42501';
    end if;
    if (new.label <> old.label or new.sort_order <> old.sort_order or new.requires_photo <> old.requires_photo)
       and uid is not null and not app.has_perm(new.organization_id, 'housekeeping.manage') then
      raise exception 'Only a manager can edit the checklist.' using errcode = '42501';
    end if;
    if new.is_completed and not old.is_completed then
      new.completed_by := uid;
      new.completed_at := now();
    elsif not new.is_completed then
      new.completed_by := null;
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger housekeeping_checklist_items_before_write
  before insert or update on public.housekeeping_checklist_items
  for each row execute function app.checklist_items_before_write();

-- Turnover cleaning task for a booking. Idempotent via generation_key; never auto-completes.
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

create trigger bookings_turnover_task
  after insert or update of status, check_out_date on public.bookings
  for each row execute function app.sync_turnover_task();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.checklist_templates enable row level security;
alter table public.housekeeping_tasks enable row level security;
alter table public.housekeeping_checklist_items enable row level security;
alter table public.housekeeping_task_comments enable row level security;
alter table public.housekeeping_task_photos enable row level security;
alter table public.recurring_task_templates enable row level security;

create policy checklist_templates_select on public.checklist_templates for select to authenticated
  using (app.has_perm(organization_id, 'housekeeping.view'));
create policy checklist_templates_write on public.checklist_templates for all to authenticated
  using (app.has_perm(organization_id, 'housekeeping.manage'))
  with check (app.has_perm(organization_id, 'housekeeping.manage'));

create or replace function app.can_view_task(org uuid, task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.housekeeping_tasks t
    where t.id = task and t.organization_id = org
      and app.has_perm(org, 'housekeeping.view')
      and app.can_access_property(org, t.property_id)
  );
$$;

create or replace function app.can_work_task(org uuid, task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.housekeeping_tasks t
    where t.id = task and t.organization_id = org
      and app.can_access_property(org, t.property_id)
      and (app.has_perm(org, 'housekeeping.manage')
           or (app.has_perm(org, 'housekeeping.work')
               and (t.assigned_to = (select auth.uid()) or t.assigned_to is null)))
  );
$$;

create policy housekeeping_tasks_select on public.housekeeping_tasks for select to authenticated
  using (app.has_perm(organization_id, 'housekeeping.view') and app.can_access_property(organization_id, property_id));
create policy housekeeping_tasks_insert on public.housekeeping_tasks for insert to authenticated
  with check (app.has_perm(organization_id, 'housekeeping.manage') and app.can_access_property(organization_id, property_id));
create policy housekeeping_tasks_update on public.housekeeping_tasks for update to authenticated
  using (app.can_work_task(organization_id, id))
  with check (app.can_access_property(organization_id, property_id)
              and (app.has_perm(organization_id, 'housekeeping.manage') or assigned_to = (select auth.uid())));
create policy housekeeping_tasks_delete on public.housekeeping_tasks for delete to authenticated
  using (app.has_perm(organization_id, 'housekeeping.manage') and app.can_access_property(organization_id, property_id)
         and status in ('pending', 'cancelled') and generation_key is null);

create policy checklist_items_select on public.housekeeping_checklist_items for select to authenticated
  using (app.can_view_task(organization_id, task_id));
create policy checklist_items_insert on public.housekeeping_checklist_items for insert to authenticated
  with check (app.has_perm(organization_id, 'housekeeping.manage') and app.can_view_task(organization_id, task_id));
create policy checklist_items_update on public.housekeeping_checklist_items for update to authenticated
  using (app.can_work_task(organization_id, task_id))
  with check (app.can_work_task(organization_id, task_id));
create policy checklist_items_delete on public.housekeeping_checklist_items for delete to authenticated
  using (app.has_perm(organization_id, 'housekeeping.manage') and app.can_view_task(organization_id, task_id));

create policy task_comments_select on public.housekeeping_task_comments for select to authenticated
  using (app.can_view_task(organization_id, task_id));
create policy task_comments_insert on public.housekeeping_task_comments for insert to authenticated
  with check (app.can_view_task(organization_id, task_id));

create policy task_photos_select on public.housekeeping_task_photos for select to authenticated
  using (app.can_view_task(organization_id, task_id));
create policy task_photos_insert on public.housekeeping_task_photos for insert to authenticated
  with check (app.can_work_task(organization_id, task_id));
create policy task_photos_delete on public.housekeeping_task_photos for delete to authenticated
  using (app.has_perm(organization_id, 'housekeeping.manage') and app.can_view_task(organization_id, task_id)
         or uploaded_by = (select auth.uid()));

create policy recurring_templates_select on public.recurring_task_templates for select to authenticated
  using (app.has_perm(organization_id, 'housekeeping.view') and app.can_access_property(organization_id, property_id));
create policy recurring_templates_write on public.recurring_task_templates for all to authenticated
  using (app.has_perm(organization_id, 'housekeeping.manage') and app.can_access_property(organization_id, property_id))
  with check (app.has_perm(organization_id, 'housekeeping.manage') and app.can_access_property(organization_id, property_id));
