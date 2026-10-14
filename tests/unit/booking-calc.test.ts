import { describe, expect, it } from 'vitest'
import { balanceDue, canTransition, computePricing, paymentState, summarizeLedger, type LedgerEntry } from '@/lib/booking-calc'

describe('computePricing', () => {
  it('calculates nights, accommodation, fees, discount and total in cents', () => {
    const p = computePricing({
      checkIn: '2026-12-20',
      checkOut: '2026-12-27',
      nightlyRate: '12500',
      cleaningFee: '3000',
      additionalFees: '1500.50',
      discount: '5000',
    })
    expect(p).toEqual({
      nights: 7,
      accommodation: 8750000,
      cleaningFee: 300000,
      additionalFees: 150050,
      discount: 500000,
      total: 8700050,
    })
  })

  it('rejects zero or negative stays', () => {
    expect(() => computePricing({ checkIn: '2026-12-20', checkOut: '2026-12-20', nightlyRate: 100 })).toThrow()
  })
})

const e = (id: string, amount: string, payment_type: LedgerEntry['payment_type'], extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id,
  amount,
  payment_type,
  status: 'recorded',
  ...extra,
})

describe('summarizeLedger', () => {
  it('sums deposits and balances, ignoring failed and pending entries', () => {
    const s = summarizeLedger([
      e('1', '30000', 'deposit'),
      e('2', '50000', 'balance'),
      e('3', '9999', 'payment', { status: 'failed' }),
      e('4', '5000', 'payment', { status: 'pending' }),
      e('5', '1000', 'payment', { status: 'verified' }),
    ])
    expect(s).toEqual({ paid: 8100000, refunded: 0, adjustments: 0, netReceived: 8100000 })
  })

  it('handles refunds separately from payments', () => {
    const s = summarizeLedger([e('1', '30000', 'deposit'), e('2', '10000', 'refund')])
    expect(s.paid).toBe(3000000)
    expect(s.refunded).toBe(1000000)
    expect(s.netReceived).toBe(2000000)
  })

  it('reversals cancel the original entry without double counting', () => {
    const s = summarizeLedger([
      e('1', '30000', 'deposit'),
      e('2', '30000', 'reversal', { reverses_payment_id: '1' }),
      e('3', '10000', 'refund'),
      e('4', '10000', 'reversal', { reverses_payment_id: '3' }),
    ])
    expect(s).toEqual({ paid: 0, refunded: 0, adjustments: 0, netReceived: 0 })
  })

  it('treats adjustments as non-cash debits/credits', () => {
    const s = summarizeLedger([e('1', '2000', 'adjustment_debit'), e('2', '500', 'adjustment_credit')])
    expect(s).toEqual({ paid: 0, refunded: 0, adjustments: 150000, netReceived: 0 })
  })
})

describe('balanceDue', () => {
  const base = { total: 10000000, cancellationFee: 0, paid: 0, refunded: 0, adjustments: 0 }

  it('is total minus net received for active bookings', () => {
    expect(balanceDue({ ...base, status: 'confirmed', paid: 3000000 })).toBe(7000000)
  })

  it('increases when money is refunded to the guest', () => {
    expect(balanceDue({ ...base, status: 'confirmed', paid: 10000000, refunded: 1000000 })).toBe(1000000)
  })

  it('uses the cancellation fee once cancelled; negative means credit owed to the guest', () => {
    expect(balanceDue({ ...base, status: 'cancelled', cancellationFee: 1000000, paid: 3000000 })).toBe(-2000000)
    expect(balanceDue({ ...base, status: 'cancelled', cancellationFee: 1000000, paid: 3000000, refunded: 2000000 })).toBe(0)
  })

  it('applies adjustments', () => {
    expect(balanceDue({ ...base, status: 'checked_out', paid: 10000000, adjustments: 250000 })).toBe(250000)
  })

  it('derives a payment state', () => {
    expect(paymentState({ ...base, status: 'confirmed' })).toBe('unpaid')
    expect(paymentState({ ...base, status: 'confirmed', paid: 1 })).toBe('partial')
    expect(paymentState({ ...base, status: 'confirmed', paid: 10000000 })).toBe('paid')
    expect(paymentState({ ...base, status: 'confirmed', paid: 10000001 })).toBe('overpaid')
    expect(paymentState({ ...base, status: 'inquiry' })).toBe('not_applicable')
  })
})

describe('status transitions', () => {
  it('mirrors the database transition rules', () => {
    expect(canTransition('inquiry', 'confirmed')).toBe(true)
    expect(canTransition('confirmed', 'checked_in')).toBe(true)
    expect(canTransition('checked_in', 'checked_out')).toBe(true)
    expect(canTransition('cancelled', 'checked_in')).toBe(false)
    expect(canTransition('checked_out', 'confirmed')).toBe(false)
    expect(canTransition('inquiry', 'checked_in')).toBe(false)
  })
})
