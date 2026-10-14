-- Phase C: retry-safe creation, list views and helper RPCs used by the operations screens.

-- ---------------------------------------------------------------------------
-- Idempotency keys (client-generated per form submission; a retried request returns the original)
-- ---------------------------------------------------------------------------
alter table public.bookings add column client_request_id uuid;
alter table public.bookings add constraint bookings_client_request_key unique (organization_id, client_request_id);

alter table public.booking_payments add column client_request_id uuid;
alter table public.booking_payments add constraint booking_payments_client_request_key unique (organization_id, client_request_id);

alter table public.expenses add column client_request_id uuid;
alter table public.expenses add constraint expenses_client_request_key unique (organization_id, client_request_id);

alter table public.inventory_movements add column client_request_id uuid;
alter table public.inventory_movements add constraint inventory_movements_client_request_key unique (organization_id, client_request_id);

-- Low stock flag for filtering (PostgREST cannot compare two columns).
alter table public.inventory_items
  add column is_low_stock boolean generated always as (minimum_quantity > 0 and quantity_on_hand <= minimum_quantity) stored;
create index inventory_items_low_idx on public.inventory_items (organization_id) where is_low_stock;

-- ---------------------------------------------------------------------------
-- Booking list view (security invoker: the caller's RLS on every joined table applies)
-- ---------------------------------------------------------------------------
create or replace view public.bookings_overview
with (security_invoker = true)
as
select
  b.id,
  b.organization_id,
  b.property_id,
  b.unit_id,
  b.guest_id,
  b.booking_reference,
  b.booking_source,
  b.external_reference,
  b.check_in_date,
  b.check_out_date,
  b.nights,
  b.adults,
  b.children,
  b.infants,
  b.nightly_rate,
  b.total_amount,
  b.amount_paid,
  b.amount_refunded,
  b.balance_due,
  b.currency,
  b.status,
  b.created_at,
  g.full_name as guest_name,
  g.phone as guest_phone,
  p.name as property_name,
  u.name as unit_name,
  u.is_default as unit_is_default,
  case
    when b.status = 'inquiry' then 'not_applicable'
    when b.balance_due < 0 then 'overpaid'
    when b.balance_due = 0 then 'paid'
    when b.amount_paid - b.amount_refunded > 0 then 'partial'
    else 'unpaid'
  end as payment_state,
  lower(b.booking_reference || ' ' || coalesce(b.external_reference, '') || ' ' || g.full_name || ' '
        || coalesce(g.phone, '') || ' ' || p.name) as search_text
from public.bookings b
join public.guests g on g.id = b.guest_id
join public.properties p on p.id = b.property_id
join public.property_units u on u.id = b.unit_id;

grant select on public.bookings_overview to authenticated;

-- ---------------------------------------------------------------------------
-- create_booking: optional new guest + booking + optional first payment in one transaction.
-- SECURITY INVOKER — every insert is checked by the caller's RLS policies.
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  org uuid := (payload ->> 'organization_id')::uuid;
  req uuid := nullif(payload ->> 'client_request_id', '')::uuid;
  existing uuid;
  g_id uuid := nullif(payload ->> 'guest_id', '')::uuid;
  b_id uuid;
  ng jsonb := payload -> 'new_guest';
  pay jsonb := payload -> 'initial_payment';
begin
  if req is not null then
    select id into existing from public.bookings where organization_id = org and client_request_id = req;
    if existing is not null then
      return existing; -- retried submission
    end if;
  end if;

  if g_id is null then
    if ng is null or coalesce(trim(ng ->> 'full_name'), '') = '' then
      raise exception 'Choose an existing guest or enter the new guest''s name.' using errcode = '22023';
    end if;
    insert into public.guests (organization_id, full_name, phone, email, country)
    values (org, trim(ng ->> 'full_name'), nullif(ng ->> 'phone', ''), nullif(ng ->> 'email', ''), nullif(ng ->> 'country', ''))
    returning id into g_id;
  end if;

  insert into public.bookings (
    organization_id, property_id, unit_id, guest_id, booking_source, external_reference,
    check_in_date, check_out_date, adults, children, infants,
    nightly_rate, cleaning_fee, additional_fees, discount_amount,
    status, guest_requests, internal_notes, client_request_id
  ) values (
    org,
    (payload ->> 'property_id')::uuid,
    (payload ->> 'unit_id')::uuid,
    g_id,
    coalesce(payload ->> 'booking_source', 'direct')::public.booking_source,
    nullif(payload ->> 'external_reference', ''),
    (payload ->> 'check_in_date')::date,
    (payload ->> 'check_out_date')::date,
    coalesce((payload ->> 'adults')::smallint, 1),
    coalesce((payload ->> 'children')::smallint, 0),
    coalesce((payload ->> 'infants')::smallint, 0),
    (payload ->> 'nightly_rate')::numeric,
    coalesce((payload ->> 'cleaning_fee')::numeric, 0),
    coalesce((payload ->> 'additional_fees')::numeric, 0),
    coalesce((payload ->> 'discount_amount')::numeric, 0),
    coalesce(payload ->> 'status', 'confirmed')::public.booking_status,
    nullif(payload ->> 'guest_requests', ''),
    nullif(payload ->> 'internal_notes', ''),
    req
  ) returning id into b_id;

  if pay is not null and coalesce((pay ->> 'amount')::numeric, 0) > 0 then
    insert into public.booking_payments (
      organization_id, booking_id, amount, payment_type, payment_method,
      transaction_reference, payment_date, notes, status
    ) values (
      org, b_id, (pay ->> 'amount')::numeric,
      coalesce(pay ->> 'payment_type', 'deposit')::public.payment_type,
      (pay ->> 'payment_method')::public.payment_method,
      nullif(pay ->> 'transaction_reference', ''),
      (pay ->> 'payment_date')::date,
      nullif(pay ->> 'notes', ''),
      'recorded'
    );
  end if;

  return b_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Availability check for forms (RLS applies; excludes the booking being edited)
-- ---------------------------------------------------------------------------
create or replace function public.unit_conflicts(
  target_unit uuid, from_date date, to_date date, ignore_booking uuid default null
)
returns table (source_type text, booking_id uuid, block_id uuid, start_date date, end_date date, label text)
language sql
stable
security definer
set search_path = ''
as $$
  -- Only for units the caller can see; exposes dates and a reference, never guest details.
  select o.source_type, o.booking_id, o.block_id, lower(o.during), upper(o.during),
         coalesce(b.booking_reference, 'Blocked: ' || pb.reason::text)
  from public.unit_occupancy o
  join public.property_units u on u.id = o.unit_id
  left join public.bookings b on b.id = o.booking_id
  left join public.property_blocks pb on pb.id = o.block_id
  where o.unit_id = target_unit
    and o.during && daterange(from_date, to_date, '[)')
    and (ignore_booking is null or o.booking_id is distinct from ignore_booking)
    and app.has_perm(u.organization_id, 'property.view')
    and app.can_access_property(u.organization_id, u.property_id);
$$;

-- ---------------------------------------------------------------------------
-- Housekeeping schedule: arrivals/departures for caretakers without guest/booking access.
-- Returns only operational fields (no contact details, no money).
-- ---------------------------------------------------------------------------
create or replace function public.housekeeping_schedule(org uuid, from_date date, to_date date)
returns table (
  booking_id uuid, booking_reference text, property_id uuid, property_name text, unit_id uuid, unit_name text,
  check_in_date date, check_out_date date, guest_first_name text, guest_count integer, status public.booking_status,
  guest_requests text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.booking_reference, p.id, p.name, u.id, u.name, b.check_in_date, b.check_out_date,
         split_part(g.full_name, ' ', 1), (b.adults + b.children + b.infants)::integer, b.status, b.guest_requests
  from public.bookings b
  join public.properties p on p.id = b.property_id
  join public.property_units u on u.id = b.unit_id
  join public.guests g on g.id = b.guest_id
  where b.organization_id = org
    and app.has_perm(org, 'housekeeping.view')
    and app.can_access_property(org, b.property_id)
    and b.status in ('pending', 'confirmed', 'checked_in', 'checked_out')
    and (b.check_in_date between from_date and to_date or b.check_out_date between from_date and to_date)
  order by least(b.check_in_date, b.check_out_date);
$$;

revoke execute on function public.create_booking(jsonb) from anon, public;
revoke execute on function public.unit_conflicts(uuid, date, date, uuid) from anon, public;
revoke execute on function public.housekeeping_schedule(uuid, date, date) from anon, public;
grant execute on function public.create_booking(jsonb) to authenticated;
grant execute on function public.unit_conflicts(uuid, date, date, uuid) to authenticated;
grant execute on function public.housekeeping_schedule(uuid, date, date) to authenticated;
