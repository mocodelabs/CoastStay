# CoastStay — Booking Finance Model

This document defines how money is stored and calculated. The database is authoritative
(`supabase/migrations/20261013000004_guests_bookings_payments.sql`); the UI mirrors the same rules in
`src/lib/booking-calc.ts` for live previews, and both are covered by tests.

## Storage

- All amounts are `numeric(12,2)` in the database. The frontend converts to integer cents
  (`src/lib/currency.ts`) before any arithmetic — no floating-point maths on money.
- A booking's currency is copied from the organization when the booking is created and never changes.

## Booking value (generated columns — cannot be edited directly)

| Column | Formula |
|---|---|
| `nights` | `check_out_date − check_in_date` (check-in inclusive, check-out exclusive) |
| `accommodation_amount` | `nightly_rate × nights` |
| `total_amount` | `accommodation_amount + cleaning_fee + additional_fees − discount_amount` (must be ≥ 0) |

## The ledger: `booking_payments`

Every movement of money (or non-cash credit) is a row. Amounts are always **positive**; the
`payment_type` decides the effect:

| Type | Meaning | Effect |
|---|---|---|
| `deposit` | First payment securing the booking | + paid |
| `balance` | Payment of the remaining balance | + paid |
| `payment` | Any other guest payment | + paid |
| `refund` | Money returned to the guest | + refunded |
| `adjustment_credit` | Non-cash credit to the guest (goodwill, compensation) | − adjustments |
| `adjustment_debit` | Non-cash charge to the guest (damage, extra service) | + adjustments |
| `reversal` | Cancels one earlier entry (data-entry error, bounced/reversed M-Pesa) | negates the original |

### Status

| Status | Counts in totals? | Who sets it |
|---|---|---|
| `pending` | no | staff (awaiting confirmation) |
| `recorded` | **yes** | staff — manual entry, **not verified** |
| `verified` | **yes** | only a trusted integration (no end-user JWT), e.g. an M-Pesa callback |
| `failed` | no | staff, from `pending` only |

Manually entered M-Pesa codes are `recorded`, never `verified`. The UI must not describe them as
confirmed by M-Pesa.

### Immutability

- Recorded rows cannot be edited (amount, type, method, date, reference, booking) or deleted — only
  `notes` can change, and `status` can move `pending → recorded | failed` (or to `verified` by an
  integration).
- Mistakes are corrected with a **reversal**: exactly one per original (unique index), mirroring the
  original amount and method automatically. A reversal of a reversal is rejected.
- A payment cannot be reversed if that would leave refunds larger than payments; reverse the refund
  first.
- Duplicate M-Pesa / bank references are rejected per business (case-insensitive).

## Maintained totals on `bookings`

Recomputed in the same transaction after every ledger insert/update
(`app.recompute_booking_financials`), with reversals applied to the type of the entry they cancel:

```
amount_paid      = Σ successful deposit/balance/payment − Σ their reversals
amount_refunded  = Σ successful refund − Σ their reversals
adjustment_total = Σ adjustment_debit − Σ adjustment_credit   (each net of reversals)
```

Clients cannot write these columns.

## Balance due (generated column)

```
chargeable  = cancellation_fee          if status = cancelled
            = total_amount              otherwise
balance_due = chargeable − (amount_paid − amount_refunded) + adjustment_total
```

- **Positive** → the guest owes this amount.
- **Zero** → settled.
- **Negative** → a credit/refund is owed **to** the guest (e.g. cancelled after paying more than the
  cancellation fee). Record a `refund` when the money is sent back.

Refunds can never exceed the net amount received (`amount_paid − amount_refunded`).

This is the master prompt's "booking total − successful payments + refunds" with two explicit
additions: cancellation fees replace the total for cancelled bookings, and non-cash adjustments are
separated from cash so that cash reports stay accurate.

## Cancellation

Cancelling keeps the booking and its full history. The owner/manager enters the
`cancellation_fee` the business keeps (0 = full refund owed). The resulting balance shows what is
owed either way; any refund is recorded separately as a ledger entry.

## Expenses

`expenses` rows are edited while `recorded` (every change is audited) and **voided** with a reason —
never deleted. Void expenses are excluded from all reports. Categories are configurable per business;
each category has `include_in_operating_income` to control whether it counts towards estimated
operating income.

## Reporting definitions (implemented in Phase D)

- **Revenue collected** — Σ successful incoming payments − Σ refunds, by `payment_date` (cash basis).
- **Reservation value** — Σ `total_amount` of non-cancelled, non-inquiry bookings, allocated per stay
  night to the reporting period so a stay spanning two months is split, not double counted.
- **Operating expenses** — Σ non-void expenses by `expense_date` in categories with
  `include_in_operating_income`.
- **Estimated operating income** — revenue collected − operating expenses. This is a management
  indicator, **not** accounting or tax profit.
