-- Reporting functions. All are SECURITY INVOKER: the caller's RLS decides which properties,
-- bookings, payments and expenses are included. Definitions: docs/REPORTS.md.
--
-- Night allocation: a stay contributes one "unit-night" for every date d with
-- check_in_date <= d < check_out_date. Money is spread evenly across the stay's nights so a stay
-- spanning two periods is split, never double counted.
--   value per night         = total_amount / nights
--   accommodation per night = max(accommodation_amount − discount_amount, 0) / nights
-- Occupied statuses: confirmed, checked_in, checked_out (pending holds and no-shows don't occupy).
-- Reservation value statuses: pending, confirmed, checked_in, checked_out, no_show.

create or replace function public.report_property_performance(org uuid, from_date date, to_date date)
returns table (
  property_id uuid,
  property_name text,
  unit_count integer,
  available_nights integer,
  blocked_nights integer,
  occupied_nights integer,
  accommodation_revenue numeric,
  reservation_value numeric,
  payments_collected numeric,
  operating_expenses numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with days as (
    select d::date as night from generate_series(from_date::timestamp, to_date::timestamp, interval '1 day') d
  ),
  props as (
    select p.id, p.name, p.status from public.properties p where p.organization_id = org
  ),
  units as (
    select u.id, u.property_id,
           (u.created_at at time zone (select o.timezone from public.organizations o where o.id = org))::date as since
    from public.property_units u
    join props p on p.id = u.property_id
    where u.status = 'active' and p.status = 'active'
  ),
  unit_nights as (
    select u.property_id, u.id as unit_id, d.night from units u join days d on d.night >= u.since
  ),
  blocked as (
    select un.property_id, count(distinct (un.unit_id, un.night)) as n
    from unit_nights un
    join public.property_blocks k on k.unit_id = un.unit_id and un.night >= k.start_date and un.night < k.end_date
    group by un.property_id
  ),
  stays as (
    select b.property_id, b.status,
           greatest(b.accommodation_amount - b.discount_amount, 0) / b.nights as acc_night,
           b.total_amount / b.nights as value_night
    from public.bookings b
    join days d on d.night >= b.check_in_date and d.night < b.check_out_date
    where b.organization_id = org
      and b.status in ('pending', 'confirmed', 'checked_in', 'checked_out', 'no_show')
  ),
  stay_agg as (
    select property_id,
           count(*) filter (where status in ('confirmed', 'checked_in', 'checked_out')) as occupied,
           coalesce(sum(acc_night) filter (where status in ('confirmed', 'checked_in', 'checked_out')), 0) as acc,
           coalesce(sum(value_night), 0) as value
    from stays group by property_id
  ),
  eff as (
    select p.property_id,
           case when p.payment_type = 'reversal' then o.payment_type else p.payment_type end as kind,
           case when p.payment_type = 'reversal' then -p.amount else p.amount end as amt
    from public.booking_payments p
    left join public.booking_payments o on o.id = p.reverses_payment_id
    where p.organization_id = org and p.status in ('recorded', 'verified')
      and p.payment_date between from_date and to_date
  ),
  pay as (
    select property_id,
           coalesce(sum(amt) filter (where kind in ('deposit', 'balance', 'payment')), 0)
             - coalesce(sum(amt) filter (where kind = 'refund'), 0) as collected
    from eff group by property_id
  ),
  exp as (
    select e.property_id, coalesce(sum(e.amount), 0) as total
    from public.expenses e
    join public.expense_categories c on c.organization_id = e.organization_id and c.code = e.category
    where e.organization_id = org and e.status = 'recorded' and c.include_in_operating_income
      and e.expense_date between from_date and to_date and e.property_id is not null
    group by e.property_id
  ),
  avail as (
    select property_id, count(distinct unit_id)::integer as units, count(*)::integer as nights
    from unit_nights group by property_id
  )
  select
    p.id, p.name,
    coalesce(a.units, 0),
    greatest(coalesce(a.nights, 0) - coalesce(bl.n, 0), 0)::integer,
    coalesce(bl.n, 0)::integer,
    coalesce(s.occupied, 0)::integer,
    round(coalesce(s.acc, 0), 2),
    round(coalesce(s.value, 0), 2),
    coalesce(pay.collected, 0),
    coalesce(exp.total, 0)
  from props p
  left join avail a on a.property_id = p.id
  left join blocked bl on bl.property_id = p.id
  left join stay_agg s on s.property_id = p.id
  left join pay on pay.property_id = p.id
  left join exp on exp.property_id = p.id
  where p.status = 'active' or s.property_id is not null or pay.property_id is not null or exp.property_id is not null
  order by p.name;
$$;

-- Month-by-month series for charts and the monthly summary report.
create or replace function public.report_monthly(org uuid, first_month date, months integer)
returns table (
  month date,
  net_collected numeric,
  refunds numeric,
  operating_expenses numeric,
  estimated_operating_income numeric,
  reservation_value numeric,
  accommodation_revenue numeric,
  occupied_nights integer,
  available_nights integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m::date,
    fs.net_collected,
    fs.refunds,
    fs.expenses_operating,
    fs.estimated_operating_income,
    coalesce(pp.value, 0),
    coalesce(pp.acc, 0),
    coalesce(pp.occ, 0)::integer,
    coalesce(pp.avail, 0)::integer
  from generate_series(
         date_trunc('month', first_month)::timestamp,
         date_trunc('month', first_month)::timestamp + (least(greatest(months, 1), 24) - 1) * interval '1 month',
         interval '1 month') m
  cross join lateral public.finance_summary(org, m::date, (m + interval '1 month - 1 day')::date) fs
  cross join lateral (
    select sum(r.reservation_value) as value, sum(r.accommodation_revenue) as acc,
           sum(r.occupied_nights) as occ, sum(r.available_nights) as avail
    from public.report_property_performance(org, m::date, (m + interval '1 month - 1 day')::date) r
  ) pp
  order by 1;
$$;

-- Today's operational snapshot (business time zone).
create or replace function public.dashboard_today(org uuid)
returns table (
  today date,
  properties integer,
  active_units integer,
  occupied_units integer,
  blocked_units integer,
  available_units integer,
  arrivals integer,
  departures integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with t as (
    select (now() at time zone o.timezone)::date as d from public.organizations o where o.id = org
  ),
  units as (
    select u.id from public.property_units u
    join public.properties p on p.id = u.property_id
    where u.organization_id = org and u.status = 'active' and p.status = 'active'
  ),
  occ as (
    select distinct b.unit_id from public.bookings b, t
    where b.organization_id = org and b.status in ('confirmed', 'checked_in')
      and b.check_in_date <= t.d and b.check_out_date > t.d
  ),
  blk as (
    select distinct k.unit_id from public.property_blocks k, t
    where k.organization_id = org and k.start_date <= t.d and k.end_date > t.d
  )
  select
    t.d,
    (select count(*) from public.properties p where p.organization_id = org and p.status = 'active')::integer,
    (select count(*) from units)::integer,
    (select count(*) from units where id in (select unit_id from occ))::integer,
    (select count(*) from units where id in (select unit_id from blk) and id not in (select unit_id from occ))::integer,
    (select count(*) from units where id not in (select unit_id from occ) and id not in (select unit_id from blk))::integer,
    (select count(*) from public.bookings b where b.organization_id = org and b.check_in_date = t.d
       and b.status in ('pending', 'confirmed', 'checked_in'))::integer,
    (select count(*) from public.bookings b where b.organization_id = org and b.check_out_date = t.d
       and b.status in ('confirmed', 'checked_in', 'checked_out'))::integer
  from t;
$$;

revoke execute on function public.report_property_performance(uuid, date, date) from anon, public;
revoke execute on function public.report_monthly(uuid, date, integer) from anon, public;
revoke execute on function public.dashboard_today(uuid) from anon, public;
grant execute on function public.report_property_performance(uuid, date, date) to authenticated;
grant execute on function public.report_monthly(uuid, date, integer) to authenticated;
grant execute on function public.dashboard_today(uuid) to authenticated;
