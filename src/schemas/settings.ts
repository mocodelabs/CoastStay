import { z } from 'zod'
import { normalizePhone } from '@/lib/phone'

export const PAYMENT_METHODS = ['mpesa', 'bank_transfer', 'cash', 'card', 'platform_payout', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  mpesa: 'M-Pesa',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  platform_payout: 'Booking platform payout',
  other: 'Other',
}

export const CURRENCIES = ['KES', 'USD', 'EUR', 'GBP'] as const
export const TIMEZONES = ['Africa/Nairobi', 'Africa/Dar_es_Salaam', 'Africa/Kampala', 'UTC'] as const

/** Optional phone: empty, or normalizable to E.164. */
export const optionalPhone = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || normalizePhone(v).ok, { message: 'Enter a valid phone number, e.g. 0712 345 678.' })

export const optionalEmail = z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]).optional()

export const businessSchema = z.object({
  name: z.string().trim().min(2, 'Enter the business name.').max(120),
  contact_email: optionalEmail,
  contact_phone: optionalPhone,
  address: z.string().trim().max(500).optional(),
  currency: z.enum(CURRENCIES),
  timezone: z.enum(TIMEZONES),
})
export type BusinessValues = z.infer<typeof businessSchema>

const timeString = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM.')

export const bookingDefaultsSchema = z.object({
  default_check_in_time: timeString,
  default_check_out_time: timeString,
  booking_reference_prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,6}$/, 'Use 1–6 letters or numbers.'),
  default_deposit_percent: z.coerce.number().min(0, 'Between 0 and 100.').max(100, 'Between 0 and 100.'),
  balance_due_days_before_arrival: z.coerce.number().int().min(0).max(60),
  enabled_payment_methods: z.array(z.enum(PAYMENT_METHODS)).min(1, 'Enable at least one payment method.'),
})
export type BookingDefaultsInput = z.input<typeof bookingDefaultsSchema>
export type BookingDefaultsValues = z.output<typeof bookingDefaultsSchema>

export const ROLES = ['owner', 'manager', 'housekeeping', 'finance'] as const

export const inviteSchema = z.object({
  email: z.string().trim().min(1, 'Enter an email address.').email('Enter a valid email address.'),
  full_name: z.string().trim().max(120).optional(),
  role: z.enum(ROLES),
  can_view_finances: z.boolean(),
  property_ids: z.array(z.string().uuid()),
})
export type InviteValues = z.infer<typeof inviteSchema>

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name.').max(120),
  phone: optionalPhone,
})
export type ProfileValues = z.infer<typeof profileSchema>
