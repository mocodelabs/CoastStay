import { formatCents, toCents } from '@/lib/currency'
import { formatDate, formatTime } from '@/lib/date-utils'
import { formatPhone } from '@/lib/phone'
import type { TemplateVars } from '@/lib/templates'

interface VarsInput {
  booking: {
    booking_reference: string
    check_in_date: string
    check_out_date: string
    total_amount: number
    balance_due: number
    currency: string
    guest: { full_name: string }
    property: {
      name: string
      address: string | null
      location_name: string | null
      check_in_time: string | null
      check_out_time: string | null
      check_in_instructions: string | null
      check_out_instructions: string | null
      directions: string | null
      wifi_name: string | null
      wifi_password: string | null
    }
  }
  org: { name: string; contact_phone: string | null }
  defaults?: { check_in: string | null | undefined; check_out: string | null | undefined }
  lastPaymentAmount?: number | null
}

/** Values for `{{placeholders}}` in guest message templates. */
export function buildTemplateVars({ booking: b, org, defaults, lastPaymentAmount }: VarsInput): TemplateVars {
  const balance = toCents(b.balance_due)
  return {
    guest_name: b.guest.full_name.split(' ')[0] || b.guest.full_name,
    property_name: b.property.name,
    property_address: [b.property.address, b.property.location_name].filter(Boolean).join(', ') || null,
    check_in_date: formatDate(b.check_in_date),
    check_out_date: formatDate(b.check_out_date),
    check_in_time: formatTime(b.property.check_in_time ?? defaults?.check_in),
    check_out_time: formatTime(b.property.check_out_time ?? defaults?.check_out),
    booking_reference: b.booking_reference,
    total_amount: formatCents(toCents(b.total_amount), b.currency),
    balance_due: formatCents(Math.max(0, balance), b.currency),
    last_payment_amount: lastPaymentAmount ? formatCents(toCents(lastPaymentAmount), b.currency) : null,
    check_in_instructions: b.property.check_in_instructions,
    check_out_instructions: b.property.check_out_instructions,
    directions: b.property.directions,
    wifi_name: b.property.wifi_name,
    wifi_password: b.property.wifi_password,
    business_name: org.name,
    business_phone: org.contact_phone ? formatPhone(org.contact_phone) : null,
  }
}
