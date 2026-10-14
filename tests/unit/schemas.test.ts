import { describe, expect, it } from 'vitest'
import { bookingSchema, cancelSchema, paymentSchema } from '@/schemas/booking'
import { money } from '@/schemas/common'

const validBooking = {
  guest_mode: 'new',
  guest_id: '',
  new_guest_name: 'Amina Hassan',
  new_guest_phone: '0712 345 678',
  new_guest_email: '',
  property_id: 'p',
  unit_id: 'u',
  check_in_date: '2026-10-20',
  check_out_date: '2026-10-24',
  adults: '2',
  children: '0',
  infants: '0',
  nightly_rate: '15000.00',
  cleaning_fee: '3500.00',
  additional_fees: '',
  discount_amount: '',
  booking_source: 'direct',
  external_reference: '',
  status: 'confirmed',
  guest_requests: '',
  internal_notes: '',
  record_payment: false,
  payment_amount: '',
  payment_method: 'mpesa',
  payment_reference: '',
  payment_date: '2026-10-13',
}

const issuePaths = (r: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.path.join('.'))

describe('booking form schema', () => {
  it('accepts a valid booking', () => {
    expect(bookingSchema.safeParse(validBooking).success).toBe(true)
  })

  // Regression: the M-Pesa check must attach its error to a field the form actually renders.
  it('reports an invalid deposit M-Pesa code on payment_reference', () => {
    const r = bookingSchema.safeParse({ ...validBooking, record_payment: true, payment_amount: '19050', payment_reference: 'abc12' })
    expect(issuePaths(r)).toEqual(['payment_reference'])
  })

  it('rejects check-out on or before check-in, and discounts above the total', () => {
    expect(issuePaths(bookingSchema.safeParse({ ...validBooking, check_out_date: '2026-10-20' }))).toEqual(['check_out_date'])
    expect(issuePaths(bookingSchema.safeParse({ ...validBooking, discount_amount: '999999' }))).toEqual(['discount_amount'])
  })

  it('requires a guest', () => {
    expect(issuePaths(bookingSchema.safeParse({ ...validBooking, guest_mode: 'existing' }))).toEqual(['guest_id'])
    expect(issuePaths(bookingSchema.safeParse({ ...validBooking, new_guest_name: 'A' }))).toEqual(['new_guest_name'])
  })
})

describe('payment and cancellation schemas', () => {
  const base = { payment_type: 'deposit', amount: '1000', payment_method: 'mpesa', transaction_reference: '', payment_date: '2026-10-13', notes: '' }

  it('upper-cases and validates M-Pesa codes', () => {
    const ok = paymentSchema.safeParse({ ...base, transaction_reference: 'sjk4h7xq2p' })
    expect(ok.success && ok.data.transaction_reference).toBe('SJK4H7XQ2P')
    expect(issuePaths(paymentSchema.safeParse({ ...base, transaction_reference: 'abc' }))).toEqual(['transaction_reference'])
    // Bank references are free-form
    expect(paymentSchema.safeParse({ ...base, payment_method: 'bank_transfer', transaction_reference: 'FT-26/10/13-0042' }).success).toBe(true)
  })

  it('rejects zero or malformed amounts', () => {
    expect(issuePaths(paymentSchema.safeParse({ ...base, amount: '0' }))).toEqual(['amount'])
    expect(issuePaths(paymentSchema.safeParse({ ...base, amount: '12.345' }))).toEqual(['amount'])
    expect(money().parse('12,500.50')).toBe('12500.50')
  })

  it('requires a cancellation reason', () => {
    expect(issuePaths(cancelSchema.safeParse({ cancellation_fee: '', cancellation_reason: '' }))).toEqual(['cancellation_reason'])
  })
})
