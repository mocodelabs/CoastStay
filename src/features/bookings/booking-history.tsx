import { History } from 'lucide-react'
import { ListSkeleton, QueryState } from '@/components/feedback/states'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives'
import { formatCents, toCents } from '@/lib/currency'
import { formatDateTime } from '@/lib/date-utils'
import { BOOKING_STATUS, PAYMENT_TYPE, type BookingStatus, type PaymentType } from '@/lib/labels'
import { useBookingHistory } from './api'

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  check_in_date: 'Check-in',
  check_out_date: 'Check-out',
  unit_id: 'Unit',
  property_id: 'Property',
  guest_id: 'Guest',
  nightly_rate: 'Nightly rate',
  cleaning_fee: 'Cleaning fee',
  additional_fees: 'Additional fees',
  discount_amount: 'Discount',
  adults: 'Adults',
  children: 'Children',
  infants: 'Infants',
  cancellation_fee: 'Cancellation fee',
  cancellation_reason: 'Cancellation reason',
  internal_notes: 'Internal notes',
  guest_requests: 'Guest requests',
  booking_source: 'Source',
  external_reference: 'Platform reference',
  notes: 'Notes',
}

// Derived/maintained columns are noise in a human-readable history.
const HIDDEN = new Set([
  'nights',
  'accommodation_amount',
  'total_amount',
  'balance_due',
  'amount_paid',
  'amount_refunded',
  'adjustment_total',
  'confirmed_at',
  'checked_in_at',
  'checked_out_at',
  'cancelled_at',
])

type Changes = Record<string, { old: unknown; new: unknown } | unknown>

function describe(entry: { entity_type: string; action: string; changes: unknown }): string[] {
  const c = (entry.changes ?? {}) as Changes
  if (entry.entity_type === 'booking_payments') {
    const t = (c as Record<string, unknown>).payment_type as PaymentType | undefined
    if (entry.action === 'insert') {
      const r = c as Record<string, unknown>
      const amount = formatCents(toCents(r.amount as number), (r.currency as string) ?? 'KES')
      return [`${t ? PAYMENT_TYPE[t] : 'Transaction'} of ${amount} recorded`]
    }
    return Object.keys(c).map((k) => `Transaction ${FIELD_LABELS[k]?.toLowerCase() ?? k} updated`)
  }
  if (entry.action === 'insert') return ['Booking created']
  return Object.entries(c)
    .filter(([k]) => !HIDDEN.has(k))
    .map(([k, v]) => {
      const change = v as { old: unknown; new: unknown }
      if (k === 'status') {
        const to = BOOKING_STATUS[change.new as BookingStatus]?.label ?? String(change.new)
        return `Status changed to ${to}`
      }
      const label = FIELD_LABELS[k] ?? k
      if (k.endsWith('_id')) return `${label} changed`
      return `${label}: ${change.old ?? '—'} → ${change.new ?? '—'}`
    })
}

export function BookingHistory({ bookingId }: { bookingId: string }) {
  const history = useBookingHistory(bookingId)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" aria-hidden /> History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <QueryState query={history} loading={<ListSkeleton rows={2} />} empty={<p className="text-sm text-muted-foreground">No history yet.</p>}>
          {(rows) => (
            <ol className="space-y-3 border-l pl-4">
              {rows.map((e) => {
                const lines = describe(e)
                if (!lines.length) return null
                return (
                  <li key={e.id} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-ocean-300" aria-hidden />
                    {lines.map((l, i) => (
                      <p key={i}>{l}</p>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(e.created_at)}
                      {e.actor?.full_name ? ` · ${e.actor.full_name}` : ' · system'}
                    </p>
                  </li>
                )
              })}
            </ol>
          )}
        </QueryState>
      </CardContent>
    </Card>
  )
}
