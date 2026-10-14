-- Operating expenses with configurable categories. Expenses are voided, never deleted.

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 2 and 60),
  -- Whether expenses in this category count toward "estimated operating income".
  include_in_operating_income boolean not null default true,
  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create trigger expense_categories_updated_at before update on public.expense_categories
  for each row execute function app.set_updated_at();

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- null = business-wide (shared) expense
  property_id uuid,
  booking_id uuid,
  maintenance_request_id uuid,
  category text not null,
  description text not null check (length(trim(description)) between 2 and 300),
  amount numeric(12, 2) not null check (amount > 0),
  currency char(3) not null default 'KES',
  expense_date date not null,
  payment_method public.payment_method not null default 'cash',
  receipt_path text,
  supplier text check (supplier is null or length(supplier) <= 120),
  status public.expense_status not null default 'recorded',
  void_reason text check (void_reason is null or length(void_reason) <= 500),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, property_id) references public.properties (organization_id, id),
  foreign key (organization_id, booking_id) references public.bookings (organization_id, id),
  foreign key (organization_id, category) references public.expense_categories (organization_id, code) on update cascade,
  check ((status = 'void') = (voided_at is not null))
);
create index expenses_org_date_idx on public.expenses (organization_id, expense_date);
create index expenses_property_date_idx on public.expenses (property_id, expense_date);
create index expenses_org_category_idx on public.expenses (organization_id, category);
create index expenses_booking_idx on public.expenses (booking_id);
create trigger expenses_updated_at before update on public.expenses
  for each row execute function app.set_updated_at();
create trigger expenses_stamp_actor before insert on public.expenses
  for each row execute function app.stamp_actor('created_by');

create or replace function app.expenses_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.currency := (select o.currency from public.organizations o where o.id = new.organization_id);
    if new.status = 'void' then
      raise exception 'New expenses cannot be void.' using errcode = '23514';
    end if;
  else
    if new.organization_id <> old.organization_id or new.created_by is distinct from old.created_by
       or new.currency <> old.currency then
      raise exception 'Expense business, currency and creator cannot be changed.' using errcode = '42501';
    end if;
    if old.status = 'void' then
      raise exception 'A voided expense cannot be changed.' using errcode = '42501', hint = 'expense_void';
    end if;
    if new.status = 'void' then
      if coalesce(trim(new.void_reason), '') = '' then
        raise exception 'Give a reason for voiding this expense.' using errcode = '23514';
      end if;
      new.voided_at := now();
      new.voided_by := (select auth.uid());
    end if;
  end if;
  if new.booking_id is not null and new.property_id is not null and not exists (
    select 1 from public.bookings b where b.id = new.booking_id and b.property_id = new.property_id
  ) then
    raise exception 'The linked booking belongs to a different property.' using errcode = '23514';
  end if;
  if new.expense_date > (now() at time zone (
       select o.timezone from public.organizations o where o.id = new.organization_id))::date + 31 then
    raise exception 'Expense date is too far in the future.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger expenses_before_write
  before insert or update on public.expenses
  for each row execute function app.expenses_before_write();

-- Scope helper: shared (property-less) records are visible only to full-scope roles.
create or replace function app.can_access_optional_property(org uuid, prop uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when prop is null then app.has_full_property_scope(org)
              else app.can_access_property(org, prop) end;
$$;

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

create policy expense_categories_select on public.expense_categories for select to authenticated
  using (app.is_member(organization_id));
create policy expense_categories_insert on public.expense_categories for insert to authenticated
  with check (app.has_perm(organization_id, 'org.settings') and not is_system);
create policy expense_categories_update on public.expense_categories for update to authenticated
  using (app.has_perm(organization_id, 'org.settings'))
  with check (app.has_perm(organization_id, 'org.settings'));

create policy expenses_select on public.expenses for select to authenticated
  using (app.has_perm(organization_id, 'finance.view') and app.can_access_optional_property(organization_id, property_id));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (app.has_perm(organization_id, 'finance.record') and app.can_access_optional_property(organization_id, property_id));
create policy expenses_update on public.expenses for update to authenticated
  using (app.has_perm(organization_id, 'finance.record') and app.can_access_optional_property(organization_id, property_id))
  with check (app.has_perm(organization_id, 'finance.record') and app.can_access_optional_property(organization_id, property_id));
-- No delete policy: expenses are voided with a reason.

-- System categories keep their code (other modules and reports rely on it).
create or replace function app.expense_categories_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_system and (new.code <> old.code or not new.is_system) then
    raise exception 'Built-in categories can be renamed or hidden, but their code cannot change.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger expense_categories_guard
  before update on public.expense_categories
  for each row execute function app.expense_categories_guard();
