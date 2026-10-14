import { ArrowLeft, Printer } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorState } from '@/components/feedback/states'
import { BrandMark } from '@/components/layout/brand'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Button } from '@/components/ui/button'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatCents, toCents } from '@/lib/currency'
import { formatDate, formatDateTime, formatTime } from '@/lib/date-utils'
import { BOOKING_STATUS, PAYMENT_METHOD, PAYMENT_TYPE } from '@/lib/labels'
import { formatPhone } from '@/lib/phone'
import { useBooking, useBookingPayments } from './api'

export function BookingPrintPage() {
  const { id = '' } = useParams()
  const { org, settings, can, currency } = useOrg()
  const booking = useBooking(id)
  const finance = can('finance.view')
  const [issuedAt] = useState(() => new Date())
  const payments = useBookingPayments(id, finance)

  if (booking.isPending) return <PageSkeleton />
  if (booking.isError) return <ErrorState error={booking.error} onRetry={() => void booking.refetch()} />
  const b = booking.data
  const money = (v: number) => formatCents(toCents(v), currency)
  const reversed = new Set((payments.data ?? []).map((p) => p.reverses_payment_id).filter(Boolean))
  const received = (payments.data ?? []).filter(
    (p) => ['deposit', 'balance', 'payment', 'refund'].includes(p.payment_type) && ['recorded', 'verified'].includes(p.status) && !reversed.has(p.id),
  )

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <Link to={`/bookings/${b.id}`}>
            <ArrowLeft /> Back to booking
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer /> Print / save as PDF
        </Button>
      </div>

      <article className="rounded-lg border bg-white p-6 text-sm text-charcoal-900 sm:p-10 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
          <div className="flex items-center gap-3">
            {org.logo_url ? <img src={org.logo_url} alt="" className="size-14 object-contain" /> : <BrandMark className="size-12" />}
            <div>
              <p className="text-lg font-semibold">{org.name}</p>
              <p className="text-muted-foreground">
                {[org.contact_phone && formatPhone(org.contact_phone), org.contact_email].filter(Boolean).join(' · ')}
              </p>
              {org.address && <p className="text-muted-foreground">{org.address}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold">Booking confirmation</p>
            <p className="font-mono text-base">{b.booking_reference}</p>
            <p className="text-muted-foreground">Status: {BOOKING_STATUS[b.status].label}</p>
          </div>
        </header>

        <section className="grid gap-6 border-b py-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Guest</h2>
            <p className="font-medium">{b.guest.full_name}</p>
            {b.guest.phone && <p>{formatPhone(b.guest.phone)}</p>}
            {b.guest.email && <p>{b.guest.email}</p>}
            <p>
              {b.adults} adult{b.adults === 1 ? '' : 's'}
              {b.children > 0 && `, ${b.children} child${b.children === 1 ? '' : 'ren'}`}
              {b.infants > 0 && `, ${b.infants} infant${b.infants === 1 ? '' : 's'}`}
            </p>
          </div>
          <div>
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Accommodation</h2>
            <p className="font-medium">{b.unit.is_default ? b.property.name : `${b.property.name} — ${b.unit.name}`}</p>
            {(b.property.address || b.property.location_name) && <p>{[b.property.address, b.property.location_name].filter(Boolean).join(', ')}</p>}
            <p>
              Check-in: <strong>{formatDate(b.check_in_date)}</strong> from {formatTime(b.property.check_in_time ?? settings?.default_check_in_time)}
            </p>
            <p>
              Check-out: <strong>{formatDate(b.check_out_date)}</strong> by {formatTime(b.property.check_out_time ?? settings?.default_check_out_time)}
            </p>
            <p>
              {b.nights} night{b.nights === 1 ? '' : 's'}
            </p>
          </div>
        </section>

        {finance && (
          <section className="border-b py-6">
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Charges</h2>
            <table className="w-full">
              <tbody className="[&_td]:py-1">
                <tr>
                  <td>
                    Accommodation ({money(b.nightly_rate)} × {b.nights})
                  </td>
                  <td className="text-right tabular">{money(b.accommodation_amount)}</td>
                </tr>
                {b.cleaning_fee > 0 && (
                  <tr>
                    <td>Cleaning fee</td>
                    <td className="text-right tabular">{money(b.cleaning_fee)}</td>
                  </tr>
                )}
                {b.additional_fees > 0 && (
                  <tr>
                    <td>Additional fees</td>
                    <td className="text-right tabular">{money(b.additional_fees)}</td>
                  </tr>
                )}
                {b.discount_amount > 0 && (
                  <tr>
                    <td>Discount</td>
                    <td className="text-right tabular">− {money(b.discount_amount)}</td>
                  </tr>
                )}
                <tr className="border-t font-semibold">
                  <td className="pt-2">Total</td>
                  <td className="pt-2 text-right tabular">{money(b.total_amount)}</td>
                </tr>
              </tbody>
            </table>

            {received.length > 0 && (
              <>
                <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Payments</h3>
                <table className="w-full">
                  <tbody className="[&_td]:py-1">
                    {received.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {formatDate(p.payment_date)} · {PAYMENT_TYPE[p.payment_type]} · {PAYMENT_METHOD[p.payment_method]}
                          {p.transaction_reference && ` (${p.transaction_reference})`}
                        </td>
                        <td className="text-right tabular">
                          {p.payment_type === 'refund' ? '− ' : ''}
                          {money(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className="mt-4 flex justify-between border-t pt-3 text-base font-semibold">
              <span>{b.balance_due < 0 ? 'Credit due to guest' : 'Balance due'}</span>
              <span className="tabular">{money(Math.abs(b.balance_due))}</span>
            </p>
          </section>
        )}

        {(b.property.check_in_instructions || b.property.house_rules || b.guest_requests) && (
          <section className="space-y-3 border-b py-6">
            {b.property.check_in_instructions && (
              <div>
                <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Check-in instructions</h2>
                <p className="whitespace-pre-line">{b.property.check_in_instructions}</p>
              </div>
            )}
            {b.property.house_rules && (
              <div>
                <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">House rules</h2>
                <p className="whitespace-pre-line">{b.property.house_rules}</p>
              </div>
            )}
            {b.guest_requests && (
              <div>
                <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Your requests</h2>
                <p className="whitespace-pre-line">{b.guest_requests}</p>
              </div>
            )}
          </section>
        )}

        <footer className="pt-6 text-xs text-muted-foreground">
          Issued {formatDateTime(issuedAt)}. Thank you for choosing {org.name} — karibu!
        </footer>
      </article>
    </div>
  )
}
