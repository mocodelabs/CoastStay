-- Maintenance requests and inventory (movement ledger with a transaction-safe balance).

-- ---------------------------------------------------------------------------
-- Maintenance
-- ---------------------------------------------------------------------------
create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  unit_id uuid,
  title text not null check (length(trim(title)) between 2 and 160),
  description text check (description is null or length(description) <= 5000),
  category text not null default 'general' check (category in (
    'plumbing', 'electrical', 'appliance', 'air_conditioning', 'furniture', 'structural',
    'pest_control', 'pool', 'garden', 'internet', 'security', 'general'
  )),
  priority public.priority_level not null default 'normal',
  status public.maintenance_status not null default 'reported',
  assigned_to uuid,
  technician_name text check (technician_name is null or length(technician_name) <= 120),
  technician_phone text check (technician_phone is null or technician_phone ~ '^\+?[0-9]{7,15}$'),
  reported_by uuid references public.profiles (id) on delete set null,
  estimated_cost numeric(12, 2) check (estimated_cost is null or estimated_cost >= 0),
  actual_cost numeric(12, 2) check (actual_cost is null or actual_cost >= 0),
  target_date date,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text check (resolution_notes is null or length(resolution_notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade,
  foreign key (property_id, unit_id) references public.property_units (property_id, id) on delete cascade,
  foreign key (organization_id, assigned_to) references public.organization_members (organization_id, user_id) on delete set null (assigned_to),
  unique (organization_id, id)
);
create index maintenance_requests_org_status_idx on public.maintenance_requests (organization_id, status, priority);
create index maintenance_requests_property_idx on public.maintenance_requests (property_id, reported_at);
create index maintenance_requests_assignee_idx on public.maintenance_requests (assigned_to);
create trigger maintenance_requests_updated_at before update on public.maintenance_requests
  for each row execute function app.set_updated_at();
create trigger maintenance_requests_stamp_actor before insert on public.maintenance_requests
  for each row execute function app.stamp_actor('reported_by');

alter table public.expenses
  add constraint expenses_maintenance_fk foreign key (organization_id, maintenance_request_id)
  references public.maintenance_requests (organization_id, id);
create index expenses_maintenance_idx on public.expenses (maintenance_request_id);
alter table public.property_blocks
  add constraint property_blocks_maintenance_fk foreign key (organization_id, maintenance_request_id)
  references public.maintenance_requests (organization_id, id) on delete set null (maintenance_request_id);

create table public.maintenance_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  storage_path text not null unique,
  caption text check (caption is null or length(caption) <= 200),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, request_id) references public.maintenance_requests (organization_id, id) on delete cascade
);
create index maintenance_attachments_request_idx on public.maintenance_attachments (request_id);
create trigger maintenance_attachments_stamp_actor before insert on public.maintenance_attachments
  for each row execute function app.stamp_actor('uploaded_by');

create or replace function app.maintenance_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  is_manager boolean := uid is null or app.has_perm(new.organization_id, 'maintenance.manage');
begin
  if tg_op = 'INSERT' then
    if not is_manager then
      -- Reporters cannot pre-assign, cost or resolve.
      new.status := 'reported';
      new.assigned_to := null;
      new.estimated_cost := null;
      new.actual_cost := null;
    elsif new.assigned_to is not null and new.status = 'reported' then
      new.status := 'assigned';
    end if;
    if new.status in ('resolved', 'closed') then
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
    return new;
  end if;

  if new.organization_id <> old.organization_id or new.property_id <> old.property_id
     or new.reported_by is distinct from old.reported_by or new.reported_at <> old.reported_at then
    raise exception 'Request business, property and reporter cannot be changed.' using errcode = '42501';
  end if;

  if not is_manager then
    -- The assignee may progress the work and add resolution notes only.
    if new.title <> old.title or new.description is distinct from old.description
       or new.category <> old.category or new.priority <> old.priority
       or new.assigned_to is distinct from old.assigned_to or new.unit_id is distinct from old.unit_id
       or new.estimated_cost is distinct from old.estimated_cost or new.actual_cost is distinct from old.actual_cost
       or new.target_date is distinct from old.target_date
       or new.technician_name is distinct from old.technician_name
       or new.technician_phone is distinct from old.technician_phone then
      raise exception 'Only a manager can change request details.' using errcode = '42501';
    end if;
    if new.status <> old.status and new.status not in ('in_progress', 'waiting_for_parts', 'resolved') then
      raise exception 'Only a manager can set this status.' using errcode = '42501';
    end if;
  end if;

  if old.status = 'closed' and new.status = 'closed' and (
       new.actual_cost is distinct from old.actual_cost or new.title <> old.title) then
    raise exception 'Reopen the request before editing it.' using errcode = '23514';
  end if;

  if new.assigned_to is not null and old.assigned_to is null and new.status = 'reported' then
    new.status := 'assigned';
  end if;
  if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then
    new.resolved_at := now();
  elsif new.status not in ('resolved', 'closed') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

create trigger maintenance_before_write
  before insert or update on public.maintenance_requests
  for each row execute function app.maintenance_before_write();

alter table public.maintenance_requests enable row level security;
alter table public.maintenance_attachments enable row level security;

create policy maintenance_select on public.maintenance_requests for select to authenticated
  using (app.has_perm(organization_id, 'maintenance.view') and app.can_access_property(organization_id, property_id));
create policy maintenance_insert on public.maintenance_requests for insert to authenticated
  with check (app.has_perm(organization_id, 'maintenance.report') and app.can_access_property(organization_id, property_id));
create policy maintenance_update on public.maintenance_requests for update to authenticated
  using (app.can_access_property(organization_id, property_id)
         and (app.has_perm(organization_id, 'maintenance.manage')
              or (app.has_perm(organization_id, 'maintenance.view') and assigned_to = (select auth.uid()))))
  with check (app.can_access_property(organization_id, property_id));

create or replace function app.can_view_maintenance(org uuid, req uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.maintenance_requests r
    where r.id = req and r.organization_id = org
      and app.has_perm(org, 'maintenance.view')
      and app.can_access_property(org, r.property_id)
  );
$$;

create policy maintenance_attachments_select on public.maintenance_attachments for select to authenticated
  using (app.can_view_maintenance(organization_id, request_id));
create policy maintenance_attachments_insert on public.maintenance_attachments for insert to authenticated
  with check (app.can_view_maintenance(organization_id, request_id) and app.has_perm(organization_id, 'maintenance.report'));
create policy maintenance_attachments_delete on public.maintenance_attachments for delete to authenticated
  using (app.has_perm(organization_id, 'maintenance.manage') and app.can_view_maintenance(organization_id, request_id)
         or uploaded_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- null = shared stock (e.g. central store)
  property_id uuid,
  name text not null check (length(trim(name)) between 2 and 120),
  category text not null default 'general' check (category in (
    'toiletries', 'cleaning', 'linen', 'kitchen', 'beverages', 'maintenance', 'general'
  )),
  unit_of_measure text not null default 'pcs' check (length(trim(unit_of_measure)) between 1 and 20),
  -- Maintained by inventory_movements; never edited directly.
  quantity_on_hand numeric(12, 2) not null default 0 check (quantity_on_hand >= 0),
  minimum_quantity numeric(12, 2) not null default 0 check (minimum_quantity >= 0),
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade,
  unique (organization_id, id)
);
create index inventory_items_org_idx on public.inventory_items (organization_id, property_id);
create unique index inventory_items_name_idx
  on public.inventory_items (organization_id, coalesce(property_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create trigger inventory_items_updated_at before update on public.inventory_items
  for each row execute function app.set_updated_at();

-- quantity is a signed delta: receipt/return/transfer_in > 0; consumption/transfer_out < 0;
-- adjustment either sign. 'return' = items returned to stock.
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  inventory_item_id uuid not null,
  movement_type public.inventory_movement_type not null,
  quantity numeric(12, 2) not null check (quantity <> 0),
  balance_after numeric(12, 2) not null default 0,
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  reference text check (reference is null or length(reference) <= 120),
  notes text check (notes is null or length(notes) <= 1000),
  housekeeping_task_id uuid,
  performed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, inventory_item_id) references public.inventory_items (organization_id, id) on delete cascade,
  foreign key (organization_id, housekeeping_task_id) references public.housekeeping_tasks (organization_id, id),
  check (
    (movement_type in ('receipt', 'return', 'transfer_in') and quantity > 0)
    or (movement_type in ('consumption', 'transfer_out') and quantity < 0)
    or movement_type = 'adjustment'
  )
);
create index inventory_movements_item_idx on public.inventory_movements (inventory_item_id, created_at);
create index inventory_movements_org_date_idx on public.inventory_movements (organization_id, created_at);
create trigger inventory_movements_stamp_actor before insert on public.inventory_movements
  for each row execute function app.stamp_actor('performed_by');

create or replace function app.inventory_movements_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_qty numeric(12, 2);
  item_cost numeric(12, 2);
begin
  -- Row lock serializes concurrent movements on the same item.
  select quantity_on_hand, unit_cost into current_qty, item_cost
  from public.inventory_items
  where id = new.inventory_item_id and organization_id = new.organization_id
  for update;

  if current_qty + new.quantity < 0 then
    raise exception 'Not enough stock: % on hand.', current_qty using errcode = '23514', hint = 'insufficient_stock';
  end if;
  new.balance_after := current_qty + new.quantity;
  if new.unit_cost is null and new.movement_type = 'receipt' then
    new.unit_cost := item_cost;
  end if;

  perform set_config('coaststay.inventory_sync', 'on', true);
  update public.inventory_items
    set quantity_on_hand = new.balance_after,
        unit_cost = case when new.movement_type = 'receipt' and new.unit_cost is not null then new.unit_cost else unit_cost end
    where id = new.inventory_item_id;
  perform set_config('coaststay.inventory_sync', 'off', true);
  return new;
end;
$$;

create trigger inventory_movements_before_insert
  before insert on public.inventory_movements
  for each row execute function app.inventory_movements_before_insert();

create or replace function app.inventory_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.quantity_on_hand := 0;
    return new;
  end if;
  if new.quantity_on_hand <> old.quantity_on_hand
     and coalesce(current_setting('coaststay.inventory_sync', true), '') <> 'on' then
    raise exception 'Stock levels change only through stock movements.' using errcode = '42501';
  end if;
  if new.organization_id <> old.organization_id or new.property_id is distinct from old.property_id then
    raise exception 'Item location cannot be changed; record a transfer instead.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger inventory_items_guard
  before insert or update on public.inventory_items
  for each row execute function app.inventory_items_guard();

-- Reconciliation: maintained balance vs. sum of movements (should always match).
create or replace view public.inventory_reconciliation
with (security_invoker = true)
as
select
  i.id as inventory_item_id,
  i.organization_id,
  i.property_id,
  i.name,
  i.quantity_on_hand,
  coalesce(sum(m.quantity), 0)::numeric(12, 2) as ledger_quantity,
  i.quantity_on_hand - coalesce(sum(m.quantity), 0) as difference
from public.inventory_items i
left join public.inventory_movements m on m.inventory_item_id = i.id
group by i.id;

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

create policy inventory_items_select on public.inventory_items for select to authenticated
  using (app.has_perm(organization_id, 'inventory.view')
         and (property_id is null or app.can_access_property(organization_id, property_id)));
create policy inventory_items_insert on public.inventory_items for insert to authenticated
  with check (app.has_perm(organization_id, 'inventory.manage')
              and app.can_access_optional_property(organization_id, property_id));
create policy inventory_items_update on public.inventory_items for update to authenticated
  using (app.has_perm(organization_id, 'inventory.manage')
         and app.can_access_optional_property(organization_id, property_id))
  with check (app.has_perm(organization_id, 'inventory.manage')
              and app.can_access_optional_property(organization_id, property_id));

create or replace function app.can_view_inventory_item(org uuid, item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.inventory_items i
    where i.id = item and i.organization_id = org
      and app.has_perm(org, 'inventory.view')
      and (i.property_id is null or app.can_access_property(org, i.property_id))
  );
$$;

create policy inventory_movements_select on public.inventory_movements for select to authenticated
  using (app.can_view_inventory_item(organization_id, inventory_item_id));
create policy inventory_movements_insert on public.inventory_movements for insert to authenticated
  with check (
    app.can_view_inventory_item(organization_id, inventory_item_id)
    and case movement_type
      when 'consumption' then app.has_perm(organization_id, 'inventory.consume')
      when 'return' then app.has_perm(organization_id, 'inventory.consume')
      when 'adjustment' then app.has_perm(organization_id, 'inventory.adjust')
      else app.has_perm(organization_id, 'inventory.manage')
    end
  );
-- Movements are an immutable ledger: no update or delete policies.
