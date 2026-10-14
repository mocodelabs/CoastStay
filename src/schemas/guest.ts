import { z } from 'zod'
import { formatPhone } from '@/lib/phone'
import type { Database } from '@/types/database'
import { emailField, optionalText, orNull, phoneField, phoneOrNull } from './common'

type GuestRow = Database['public']['Tables']['guests']['Row']

export const guestSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter the guest’s full name.').max(120),
  phone: phoneField,
  email: emailField,
  country: optionalText(60),
  preferences: optionalText(2000),
  notes: optionalText(5000),
})
export type GuestFormValues = z.infer<typeof guestSchema>

export const emptyGuest: GuestFormValues = { full_name: '', phone: '', email: '', country: 'Kenya', preferences: '', notes: '' }

export function guestToForm(g: GuestRow): GuestFormValues {
  return {
    full_name: g.full_name,
    phone: g.phone ? formatPhone(g.phone) : '',
    email: g.email ?? '',
    country: g.country ?? '',
    preferences: g.preferences ?? '',
    notes: g.notes ?? '',
  }
}

export function formToGuest(v: GuestFormValues) {
  return {
    full_name: v.full_name.trim(),
    phone: phoneOrNull(v.phone),
    email: orNull(v.email.trim()),
    country: orNull(v.country.trim()),
    preferences: orNull(v.preferences.trim()),
    notes: orNull(v.notes.trim()),
  }
}
