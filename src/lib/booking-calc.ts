/**
 * Booking and ledger arithmetic, mirroring the database (generated columns on `bookings` and
 * app.recompute_booking_financials). The database is authoritative; these functions power live
 * form previews and are unit-tested against the same rules. See docs/FINANCE_MODEL.md.
 */
import { toCents, type Cents } from './currency'
import { nightsBetween } from './date-utils'

export type BookingStatus = 'inquiry' | 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
export type PaymentType =
  | 'deposit'
  | 'balance'
  | 'payment'
  | 'refund'
  | 'adjustment_credit'
  | 'adjustment_debit'
  | 'reversal'
export type PaymentStatus = 'pending' | 'recorded' | 'verified' | 'failed'

export const BLOCKING_STATUSES: readonly BookingStatus[] = ['pending', 'confirmed', 'checked_in']
export const INCOMING_TYPES: readonly PaymentType[] = ['deposit', 'balance', 'payment']

export interface PricingInput {
  checkIn: string
  checkOut: string
  nightlyRate: string | number
  cleaningFee?: string | number
  additionalFees?: string | number
  discount?: string | number
}

export interface PricingResult {
  nights: number
  accommodation: Cents
  cleaningFee: Cents
  additionalFees: Cents
  discount: Cents
  total: Cents
}

export function computePricing(input: PricingInput): PricingResult {
  const nights = nightsBetween(input.checkIn, input.checkOut)
  if (nights <= 0) throw new Error('Check-out must be after check-in.')
  const rate = toCents(input.nightlyRate)
  const accommodation = rate * nights
  const cleaningFee = toCents(input.cleaningFee ?? 0)
  const additionalFees = toCents(input.additionalFees ?? 0)
  const discount = toCents(input.discount ?? 0)
  return {
    nights,
    accommodation,
    cleaningFee,
    additionalFees,
    discount,
    total: accommodation + cleaningFee + additionalFees - discount,
  }
}

export interface LedgerEntry {
  id: string
  amount: string | number
  payment_type: PaymentType
  status: PaymentStatus
  reverses_payment_id?: string | null
}

export interface LedgerSummary {
  paid: Cents
  refunded: Cents
  /** debits minus credits */
  adjustments: Cents
  netReceived: Cents
}

export const isSuccessful = (s: PaymentStatus) => s === 'recorded' || s === 'verified'

/** Sums a booking's ledger: reversals cancel the effect of the entry they point to. */
export function summarizeLedger(entries: LedgerEntry[]): LedgerSummary {
  const byId = new Map(entries.map((e) => [e.id, e]))
  let paid = 0
  let refunded = 0
  let adjustments = 0
  for (const e of entries) {
    if (!isSuccessful(e.status)) continue
    let kind: PaymentType = e.payment_type
    let amount = toCents(e.amount)
    if (e.payment_type === 'reversal') {
      const original = e.reverses_payment_id ? byId.get(e.reverses_payment_id) : undefined
      if (!original) continue
      kind = original.payment_type
      amount = -amount
    }
    if (INCOMING_TYPES.includes(kind)) paid += amount
    else if (kind === 'refund') refunded += amount
    else if (kind === 'adjustment_debit') adjustments += amount
    else if (kind === 'adjustment_credit') adjustments -= amount
  }
  return { paid, refunded, adjustments, netReceived: paid - refunded }
}

export interface BalanceInput {
  status: BookingStatus
  total: Cents
  cancellationFee: Cents
  paid: Cents
  refunded: Cents
  adjustments: Cents
}

/**
 * Amount the guest still owes (negative = credit owed back to the guest):
 * chargeable − (paid − refunded) + adjustments, where chargeable is the cancellation fee for a
 * cancelled booking and the booking total otherwise.
 */
export function balanceDue(b: BalanceInput): Cents {
  const chargeable = b.status === 'cancelled' ? b.cancellationFee : b.total
  return chargeable - (b.paid - b.refunded) + b.adjustments
}

export type PaymentState = 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'not_applicable'

export function paymentState(b: BalanceInput): PaymentState {
  if (b.status === 'inquiry') return 'not_applicable'
  const chargeable = b.status === 'cancelled' ? b.cancellationFee : b.total
  const balance = balanceDue(b)
  if (balance < 0) return 'overpaid'
  if (balance === 0) return chargeable === 0 && b.paid === 0 ? 'not_applicable' : 'paid'
  return b.paid - b.refunded > 0 ? 'partial' : 'unpaid'
}

export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  inquiry: ['pending', 'confirmed', 'cancelled'],
  pending: ['confirmed', 'cancelled'],
  confirmed: ['pending', 'checked_in', 'cancelled', 'no_show'],
  checked_in: ['checked_out'],
  checked_out: [],
  cancelled: [],
  no_show: [],
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return from === to || BOOKING_TRANSITIONS[from].includes(to)
}
