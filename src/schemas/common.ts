import { z } from 'zod'
import { isISODate } from '@/lib/date-utils'
import { normalizePhone } from '@/lib/phone'

const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/

/** Money entered as text ("12500" or "12,500.50") → normalized decimal string. */
export const money = (label = 'Amount') =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ''))
    .refine((v) => v !== '', { message: `Enter ${label.toLowerCase()}.` })
    .refine((v) => v === '' || MONEY_RE.test(v), { message: 'Use a number with up to 2 decimals.' })

export const optionalMoney = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ''))
  .refine((v) => v === '' || MONEY_RE.test(v), { message: 'Use a number with up to 2 decimals.' })

export const positiveMoney = (label = 'Amount') =>
  money(label).refine((v) => Number(v) > 0, { message: `${label} must be more than zero.` })

export const isoDate = (message = 'Choose a date.') => z.string().refine(isISODate, { message })

export const optionalIsoDate = z.string().refine((v) => v === '' || isISODate(v), { message: 'Choose a valid date.' })

export const intString = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, {
      message: `${label} must be between ${min} and ${max}.`,
    })

export const phoneField = z
  .string()
  .trim()
  .refine((v) => v === '' || normalizePhone(v).ok, {
    message: 'Enter a valid number, e.g. 0712 345 678 or +44 7700 900123.',
  })

export const emailField = z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')])

export const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`)

/** '' → null, for optional DB columns. */
export const orNull = <T extends string>(v: T | undefined | null): T | null => (v === undefined || v === null || v === '' ? null : v)

export function phoneOrNull(v: string | undefined | null): string | null {
  if (!v) return null
  const r = normalizePhone(v)
  return r.ok ? r.e164 : null
}
