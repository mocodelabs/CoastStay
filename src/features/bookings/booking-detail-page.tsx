import { CalendarCheck, Ban, DoorClosed, DoorOpen, MessageCircle, MoreVertical, Pencil, Printer, UserX } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { ErrorState } from '@/components/feedback/states'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Money } from '@/components/money'
import { BookingStatusBadge, PaymentStateBadge } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu'
import { Avatar, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives'
import { MessageComposer } from '@/features/comms/message-composer'
import { useOrg } from '@/features/workspace/workspace-provider'
import { paymentState } from '@/lib/booking-calc'
import { formatCents, toCents } from '@/lib/currency'
import { formatDate, formatDateShort, formatTime, todayISO } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { BOOKING_SOURCE, type BookingStatus } from '@/lib/labels'
import { formatPhone, whatsappLink } from '@/lib/phone'
import { useBooking, useSetBookingStatus, type BookingDetail } from './api'
import { BookingHistory } from './booking-history'
import { PaymentsPanel } from './payments-panel'
import { CancelBookingDialog } from './status-dialogs'

type Action = { to: BookingStatus; title: string; description: string; confirm: string; destructive?: boolean }

function transitionCopy(b: BookingDetail, to: BookingStatus, today: string, currency: string): Action {
  const balance = toCents(b.balance_due)
  const owing = balance > 0 ? ` The guest still owes ${formatCents(balance, currency)}.` : ''
  switch (to) {
    case 'confirmed':
      return { to, title: 'Confirm this booking?', description: 'The dates are reserved and a turnover clean is scheduled for check-out day.', confirm: 'Confirm booking' }
    case 'pending':
      return { to, title: 'Mark as pending?', description: 'The dates stay reserved while you wait for the deposit.', confirm: 'Mark pending' }
    case 'checked_in':
      return {
        to,
        title: `Check in ${b.guest.full_name}?`,
        description:
          (b.check_in_date > today ? `Arrival is scheduled for ${formatDate(b.check_in_date)} — this is an early check-in.` : '') + owing,
        confirm: 'Check in',
      }
    case 'checked_out':
      return {
        to,
        title: `Check out ${b.guest.full_name}?`,
        description: `Housekeeping will see the unit as ready to clean.${owing}`,
        confirm: 'Check out',
      }
    case 'no_show':
      return { to, title: 'Mark as no-show?', description: 'The dates are released. Charges stay as booked unless you add an adjustment.', confirm: 'Mark no-show', destructive: true }
    default:
      return { to, title: 'Update status?', description: '', confirm: 'Update' }
  }
}

export function BookingDetailPage() {
  const { id = '' } = useParams()
  const { can, currency, timezone, settings } = useOrg()
  const booking = useBooking(id)
  const setStatus = useSetBookingStatus(id)
  const [pending, setPending] = useState<Action | null>(null)
  const [cancelling, setCancelling] = useState(false)

  if (booking.isPending) return <PageSkeleton />
  if (booking.isError) return <ErrorState error={booking.error} onRetry={() => void booking.refetch()} />
  const b = booking.data
  const today = todayISO(timezone)
  const manage = can('booking.manage')
  const finance = can('finance.view')
  const stayName = b.unit.is_default ? b.property.name : `${b.property.name} · ${b.unit.name}`
  const state = paymentState({
    status: b.status,
    total: toCents(b.total_amount),
    cancellationFee: toCents(b.cancellation_fee),
    paid: toCents(b.amount_paid),
    refunded: toCents(b.amount_refunded),
    adjustments: toCents(b.adjustment_total),
  })

  const primary: BookingStatus | null =
    b.status === 'inquiry' || b.status === 'pending'
      ? 'confirmed'
      : b.status === 'confirmed'
        ? 'checked_in'
        : b.status === 'checked_in'
          ? 'checked_out'
          : null
  const primaryIcon = primary === 'checked_in' ? DoorOpen : primary === 'checked_out' ? DoorClosed : CalendarCheck
  const PrimaryIcon = primaryIcon
  const editable = manage && ['inquiry', 'pending', 'confirmed', 'checked_in'].includes(b.status)

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">
            <Link to="/bookings" className="hover:underline">
              Bookings
            </Link>{' '}
            / {BOOKING_SOURCE[b.booking_source]}
            {b.external_reference && ` · ${b.external_reference}`}
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {b.booking_reference}
            <BookingStatusBadge status={b.status} />
            {finance && <PaymentStateBadge state={state} />}
          </h1>
          <p className="text-sm text-muted-foreground">
            {stayName} · {formatDateShort(b.check_in_date)} → {formatDateShort(b.check_out_date)} · {b.nights} night{b.nights === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manage && primary && (
            <Button onClick={() => setPending(transitionCopy(b, primary, today, currency))}>
              <PrimaryIcon />
              {primary === 'confirmed' ? 'Confirm' : primary === 'checked_in' ? 'Check in' : 'Check out'}
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to={`/bookings/${b.id}/print`}>
              <Printer /> Confirmation
            </Link>
          </Button>
          {manage && (editable || b.status === 'confirmed') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {editable && (
                  <DropdownMenuItem asChild>
                    <Link to={`/bookings/${b.id}/edit`}>
                      <Pencil /> Edit booking
                    </Link>
                  </DropdownMenuItem>
                )}
                {b.status === 'inquiry' && (
                  <DropdownMenuItem onSelect={() => setPending(transitionCopy(b, 'pending', today, currency))}>
                    <CalendarCheck /> Mark pending (hold dates)
                  </DropdownMenuItem>
                )}
                {b.status === 'confirmed' && (
                  <DropdownMenuItem onSelect={() => setPending(transitionCopy(b, 'no_show', today, currency))}>
                    <UserX /> Mark no-show
                  </DropdownMenuItem>
                )}
                {['inquiry', 'pending', 'confirmed'].includes(b.status) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => setCancelling(true)}>
                      <Ban /> Cancel booking
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Stay</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Check-in</p>
                <p className="font-medium">{formatDate(b.check_in_date)}</p>
                <p className="text-xs text-muted-foreground">from {formatTime(b.property.check_in_time ?? settings?.default_check_in_time)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Check-out</p>
                <p className="font-medium">{formatDate(b.check_out_date)}</p>
                <p className="text-xs text-muted-foreground">by {formatTime(b.property.check_out_time ?? settings?.default_check_out_time)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Guests</p>
                <p className="font-medium">
                  {b.adults} adult{b.adults === 1 ? '' : 's'}
                  {b.children > 0 && `, ${b.children} child${b.children === 1 ? '' : 'ren'}`}
                  {b.infants > 0 && `, ${b.infants} infant${b.infants === 1 ? '' : 's'}`}
                </p>
              </div>
              <div className="sm:col-span-3">
                <p className="text-muted-foreground">Property</p>
                <Link to={`/properties/${b.property_id}`} className="font-medium hover:underline">
                  {stayName}
                </Link>
              </div>
              {b.guest_requests && (
                <div className="sm:col-span-3">
                  <p className="text-muted-foreground">Guest requests</p>
                  <p className="whitespace-pre-line">{b.guest_requests}</p>
                </div>
              )}
              {b.internal_notes && (
                <div className="sm:col-span-3">
                  <p className="text-muted-foreground">Internal notes</p>
                  <p className="whitespace-pre-line">{b.internal_notes}</p>
                </div>
              )}
              {b.status === 'cancelled' && (
                <div className="rounded-md bg-danger-soft p-3 text-danger sm:col-span-3">
                  Cancelled {b.cancelled_at ? formatDate(b.cancelled_at) : ''}
                  {b.cancellation_reason && ` — ${b.cancellation_reason}`}
                </div>
              )}
            </CardContent>
          </Card>

          {finance && (
            <Card>
              <CardHeader>
                <CardTitle>Price</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      <Money value={b.nightly_rate} currency={currency} /> × {b.nights} night{b.nights === 1 ? '' : 's'}
                    </dt>
                    <dd>
                      <Money value={b.accommodation_amount} currency={currency} />
                    </dd>
                  </div>
                  {b.cleaning_fee > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Cleaning fee</dt>
                      <dd>
                        <Money value={b.cleaning_fee} currency={currency} />
                      </dd>
                    </div>
                  )}
                  {b.additional_fees > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Additional fees</dt>
                      <dd>
                        <Money value={b.additional_fees} currency={currency} />
                      </dd>
                    </div>
                  )}
                  {b.discount_amount > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Discount</dt>
                      <dd>
                        − <Money value={b.discount_amount} currency={currency} />
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 text-base font-semibold">
                    <dt>Total</dt>
                    <dd>
                      <Money value={b.total_amount} currency={currency} />
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}

          {finance && <PaymentsPanel booking={b} />}
          <BookingHistory bookingId={b.id} />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Guest</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <Avatar name={b.guest.full_name} />
                <div className="min-w-0">
                  <Link to={`/guests/${b.guest_id}`} className="font-medium hover:underline">
                    {b.guest.full_name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{b.guest.email ?? ''}</p>
                </div>
              </div>
              {b.guest.phone && (
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${b.guest.phone}`}>{formatPhone(b.guest.phone)}</a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={whatsappLink(b.guest.phone)} target="_blank" rel="noreferrer">
                      <MessageCircle /> WhatsApp
                    </a>
                  </Button>
                </div>
              )}
              {b.guest.preferences && <p className="text-muted-foreground">Prefers: {b.guest.preferences}</p>}
            </CardContent>
          </Card>
          {can('comms.send') && <MessageComposer booking={b} />}
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.title ?? ''}
        description={pending?.description || undefined}
        confirmLabel={pending?.confirm}
        destructive={pending?.destructive}
        onConfirm={async () => {
          try {
            await setStatus.mutateAsync(pending!.to)
            toast.success('Booking updated.')
          } catch (e) {
            toast.error(toUserMessage(e))
            throw e
          }
        }}
      />
      {cancelling && <CancelBookingDialog booking={b} open={cancelling} onOpenChange={setCancelling} />}
    </>
  )
}
