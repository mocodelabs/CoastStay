-- Period finance summary (cash basis). SECURITY INVOKER: the caller's RLS limits what is summed,
-- so scoped staff only ever see figures for properties they can access.
--
-- Definitions (docs/FINANCE_MODEL.md):
--   payments_received   = successful deposit/balance/payment entries dated in the period,
--                         minus reversals of such entries dated in the period
--   refunds             = successful refunds dated in the period, minus their reversals
--   net_collected       = payments_received − refunds
--   expenses_operating  = non-void expenses dated in the period in categories counted in operating income
--   expenses_total      = all non-void expenses dated in the period
--   estimated_operating_income = net_collected − expenses_operating  (not accounting/tax profit)
--   outstanding_balance / credits_owed = current position across bookings (not period-bound)
create or replace function public.finance_summary(org uuid, from_date date, to_date date, prop uuid default null)
returns table (
  payments_received numeric,
  refunds numeric,
  net_collected numeric,
  expenses_operating numeric,
  expenses_total numeric,
  estimated_operating_income numeric,
  outstanding_balance numeric,
  credits_owed numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with eff as (
    select
      case when p.payment_type = 'reversal' then o.payment_type else p.payment_type end as kind,
      case when p.payment_type = 'reversal' then -p.amount else p.amount end as amt
    from public.booking_payments p
    left join public.booking_payments o on o.id = p.reverses_payment_id
    where p.organization_id = org
      and p.status in ('recorded', 'verified')
      and p.payment_date between from_date and to_date
      and (prop is null or p.property_id = prop)
  ),
  pay as (
    select
      coalesce(sum(amt) filter (where kind in ('deposit', 'balance', 'payment')), 0) as received,
      coalesce(sum(amt) filter (where kind = 'refund'), 0) as refunded
    from eff
  ),
  exp as (
    select
      coalesce(sum(e.amount) filter (where c.include_in_operating_income), 0) as operating,
      coalesce(sum(e.amount), 0) as total
    from public.expenses e
    join public.expense_categories c on c.organization_id = e.organization_id and c.code = e.category
    where e.organization_id = org
      and e.status = 'recorded'
      and e.expense_date between from_date and to_date
      and (prop is null or e.property_id = prop)
  ),
  bal as (
    select
      coalesce(sum(b.balance_due) filter (where b.balance_due > 0), 0) as outstanding,
      coalesce(sum(-b.balance_due) filter (where b.balance_due < 0), 0) as credits
    from public.bookings b
    where b.organization_id = org
      and b.status <> 'inquiry'
      and (prop is null or b.property_id = prop)
  )
  select pay.received, pay.refunded, pay.received - pay.refunded,
         exp.operating, exp.total, pay.received - pay.refunded - exp.operating,
         bal.outstanding, bal.credits
  from pay, exp, bal;
$$;

revoke execute on function public.finance_summary(uuid, date, date, uuid) from anon, public;
grant execute on function public.finance_summary(uuid, date, date, uuid) to authenticated;
