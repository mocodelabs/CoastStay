import { z } from 'zod'
import { toCents } from '@/lib/currency'
import { nightsBetween } from '@/lib/date-utils'
import { BOOKING_SOURCES } from '@/lib/labels'
import { emailField, intString, isoDate, money, optionalMoney, optionalText, phoneField, positiveMoney } from './common'

export const PAYMENT_METHODS = ['mpesa', 'bank_transfer', 'cash', 'card', 'platform_payout', 'other'] as const
export const ENTRY_TYPES = ['deposit', 'balance', 'payment', 'refund', 'adjustment_credit', 'adjustment_debit'] as const

const mpesaRef = /^[A-Z0-9]{8,12}$/

const paymentFields = {
  amount: positiveMoney('Amount'),
  payment_method: z.enum(PAYMENT_METHODS),
  transaction_reference: z.string().trim().max(60).transform((v) => v.toUpperCase()),
  payment_date: isoDate('Choose the payment date.'),
  notes: optionalText(2000),
}

function checkReference(
  v: { payment_method: string; transaction_reference: string },
  ctx: z.RefinementCtx,
  path = 'transaction_reference',
) {
  if (v.payment_method === 'mpesa' && v.transaction_reference && !mpesaRef.test(v.transaction_reference)) {
    ctx.addIssue({
      code: 'custom',
      path: [path],
      message: 'M-Pesa codes are 8–12 letters and numbers, e.g. SJK4H7XQ2P.',
    })
  }
  if (v.transaction_reference && v.transaction_reference.length < 3) {
    ctx.addIssue({ code: 'custom', path: [path], message: 'Too short.' })
  }
}

export const paymentSchema = z
  .object({ payment_type: z.enum(ENTRY_TYPES), ...paymentFields })
  .superRefine(checkReference)
export type PaymentFormValues = z.infer<typeof paymentSchema>

export const bookingSchema = z
  .object({
    guest_mode: z.enum(['existing', 'new']),
    guest_id: z.string(),
    new_guest_name: z.string().trim().max(120),
    new_guest_phone: phoneField,
    new_guest_email: emailField,
    property_id: z.string().min(1, 'Choose a property.'),
    unit_id: z.string().min(1, 'Choose a unit.'),
    check_in_date: isoDate('Choose the check-in date.'),
    check_out_date: isoDate('Choose the check-out date.'),
    adults: intString(1, 100, 'Adults'),
    children: intString(0, 100, 'Children'),
    infants: intString(0, 20, 'Infants'),
    nightly_rate: money('Nightly rate'),
    cleaning_fee: optionalMoney,
    additional_fees: optionalMoney,
    discount_amount: optionalMoney,
    booking_source: z.enum(BOOKING_SOURCES as [string, ...string[]]),
    external_reference: z.string().trim().max(100),
    status: z.enum(['inquiry', 'pending', 'confirmed']),
    guest_requests: optionalText(2000),
    internal_notes: optionalText(5000),
    record_payment: z.boolean(),
    payment_amount: optionalMoney,
    payment_method: z.enum(PAYMENT_METHODS),
    payment_reference: z.string().trim().max(60).transform((v) => v.toUpperCase()),
    payment_date: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.guest_mode === 'existing' && !v.guest_id) {
      ctx.addIssue({ code: 'custom', path: ['guest_id'], message: 'Search for and select a guest, or add a new one.' })
    }
    if (v.guest_mode === 'new' && v.new_guest_name.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['new_guest_name'], message: 'Enter the guest’s full name.' })
    }
    if (v.check_in_date && v.check_out_date) {
      try {
        const n = nightsBetween(v.check_in_date, v.check_out_date)
        if (n <= 0) ctx.addIssue({ code: 'custom', path: ['check_out_date'], message: 'Check-out must be after check-in.' })
        if (n > 365) ctx.addIssue({ code: 'custom', path: ['check_out_date'], message: 'Stays are limited to 365 nights.' })
        if (n > 0 && /^\d/.test(v.nightly_rate)) {
          const subtotal = toCents(v.nightly_rate) * n + toCents(v.cleaning_fee || '0') + toCents(v.additional_fees || '0')
          if (toCents(v.discount_amount || '0') > subtotal) {
            ctx.addIssue({ code: 'custom', path: ['discount_amount'], message: 'The discount cannot exceed the booking total.' })
          }
        }
      } catch {
        /* date validity reported by the field schemas */
      }
    }
    if (v.record_payment) {
      if (!v.payment_amount || Number(v.payment_amount) <= 0) {
        ctx.addIssue({ code: 'custom', path: ['payment_amount'], message: 'Enter the amount received.' })
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.payment_date)) {
        ctx.addIssue({ code: 'custom', path: ['payment_date'], message: 'Choose the payment date.' })
      }
      checkReference({ payment_method: v.payment_method, transaction_reference: v.payment_reference }, ctx, 'payment_reference')
    }
  })
export type BookingFormValues = z.infer<typeof bookingSchema>

export const cancelSchema = z.object({
  cancellation_fee: optionalMoney,
  cancellation_reason: z.string().trim().min(3, 'Give a short reason.').max(1000),
})
export type CancelFormValues = z.infer<typeof cancelSchema>

export const blockSchema = z
  .object({
    property_id: z.string().min(1, 'Choose a property.'),
    unit_id: z.string().min(1, 'Choose a unit.'),
    start_date: isoDate('Choose the first blocked night.'),
    end_date: isoDate('Choose when the unit is available again.'),
    reason: z.enum(['maintenance', 'owner_use', 'other']),
    notes: optionalText(2000),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date > v.start_date, {
    path: ['end_date'],
    message: 'Must be after the first blocked night.',
  })
export type BlockFormValues = z.infer<typeof blockSchema>
