# CoastStay — Reporting definitions

Every figure on the dashboard and in Reports comes from live database records through the functions
in `supabase/migrations/20261014000011_finance_summary.sql` and `…015_reports.sql`. All of them run
with the **caller’s permissions** (RLS), so a manager only ever sees figures for assigned properties.

## Cash figures (by date money moved)

| Metric | Definition |
|---|---|
| Payments received | Σ recorded/verified deposits, balances and payments with `payment_date` in the period − Σ reversals of those entries dated in the period |
| Refunds | Σ recorded/verified refunds dated in the period − their reversals |
| Net collected / Revenue collected | Payments received − refunds |
| Operating expenses | Σ non-void expenses with `expense_date` in the period, in categories marked “counts towards operating income” |
| Estimated operating income | Net collected − operating expenses. A management indicator, **not** accounting or tax profit |
| Outstanding balances | Σ positive `balance_due` across all non-inquiry bookings (current position, any date) |
| Credits owed to guests | Σ of negative balances (refunds still to send) |

Business-wide expenses (no property) are included in organisation totals but not in per-property
figures. Pending/failed transactions and void expenses never count.

## Stay figures (by night)

A stay contributes one **unit-night** for each date `d` with `check_in_date ≤ d < check_out_date`.
Money is spread evenly over the stay’s nights, so a stay crossing a month boundary is split between
the months and never double counted.

| Metric | Definition |
|---|---|
| Value per night | `total_amount ÷ nights` |
| Accommodation revenue per night | `max(accommodation_amount − discount_amount, 0) ÷ nights` (excludes cleaning and other fees) |
| Occupied unit-nights | Nights of **confirmed, checked-in and checked-out** stays |
| Reservation value | Value per night summed over nights in the period for pending, confirmed, checked-in, checked-out and no-show bookings (cancelled and inquiries excluded) |
| Available unit-nights | Active units of active properties × nights in the period, counted from the unit’s creation date, **minus blocked nights** (owner use, maintenance, external calendar) |
| Occupancy rate | Occupied unit-nights ÷ available unit-nights × 100 |
| ADR (average daily rate) | Accommodation revenue for occupied nights ÷ occupied unit-nights |
| RevPAR (revenue per available unit-night) | Accommodation revenue for occupied nights ÷ available unit-nights |

Portfolio totals add nights first and then divide (they are not averages of per-property percentages).

Known simplifications: an early check-out keeps the booked check-out date, so the remaining nights
still count as occupied unless the booking dates are edited before check-out; units deactivated during
a period drop out of available nights for the whole period.

## Booking summary & cancellations

- Bookings are counted by **check-in date** within the period; inquiries are reported separately.
- Nights and reservation value in the summary exclude cancelled bookings.
- Cancellation rate = bookings with check-in in the period that are now cancelled ÷ all non-inquiry
  bookings with check-in in the period.
- The cancellation list shows bookings **cancelled** in the period (by cancellation time), with
  value lost = booking total − cancellation fee kept.

## Operations

- **Housekeeping completion**: tasks scheduled in the period (cancelled excluded). Completion rate =
  completed ÷ scheduled; on time = completed at or before `due_at`.
- **Maintenance costs**: actual costs on requests resolved in the period, by category; average time
  to resolve = resolved_at − reported_at. Record repair payments as expenses for them to affect
  finances.
- **Inventory consumption**: “used” stock movements in the period; estimated cost = quantity × the
  item’s current unit cost.

Day boundaries for timestamp-based reports (cancellations, tasks, maintenance, stock) use the viewer’s
browser time zone; calendar-date figures (stays, payments, expenses) use the stored dates.

## Dashboard

- Occupied/available tonight: active units with a confirmed or checked-in stay covering today (business
  time zone) / units neither occupied nor blocked.
- Arrivals today: pending/confirmed/checked-in bookings with check-in today. Departures today:
  confirmed/checked-in/checked-out bookings with check-out today.
- Overdue payments: bookings with a positive balance whose check-in is within the configured “balance
  due N days before arrival” window.
