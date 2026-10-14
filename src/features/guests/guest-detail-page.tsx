import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, Mail, MessageCircle, MoreVertical, Pencil, Phone, ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { ErrorState } from '@/components/feedback/states'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/menu'
import { Avatar, Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives'
import { BookingTable } from '@/features/bookings/booking-table'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatCents, sumCents } from '@/lib/currency'
import { formatDateTime } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { formatPhone, whatsappLink } from '@/lib/phone'
import { supabase } from '@/lib/supabase'
import { useAnonymizeGuest, useGuest } from './api'
import { GuestDialog } from './guest-form'

function useGuestSummary(guestId: string) {
  return useQuery({
    queryKey: ['guest-summary', guestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings_overview')
        .select('status, total_amount, amount_paid, amount_refunded, balance_due, nights')
        .eq('guest_id', guestId)
      if (error) throw error
      const real = data.filter((b) => b.status !== 'inquiry')
      const stays = real.filter((b) => ['confirmed', 'checked_in', 'checked_out', 'pending'].includes(b.status ?? ''))
      return {
        stays: stays.length,
        nights: stays.reduce((n, b) => n + (b.nights ?? 0), 0),
        value: sumCents(stays.map((b) => b.total_amount)),
        received: sumCents(real.map((b) => b.amount_paid)) - sumCents(real.map((b) => b.amount_refunded)),
        outstanding: sumCents(real.filter((b) => (b.balance_due ?? 0) > 0).map((b) => b.balance_due)),
        cancellations: data.filter((b) => b.status === 'cancelled').length,
      }
    },
  })
}

export function GuestDetailPage() {
  const { id = '' } = useParams()
  const { can, role, currency } = useOrg()
  const guest = useGuest(id)
  const summary = useGuestSummary(id)
  const anonymize = useAnonymizeGuest()
  const [editing, setEditing] = useState(false)
  const [confirmAnon, setConfirmAnon] = useState(false)

  if (guest.isPending) return <PageSkeleton />
  if (guest.isError) return <ErrorState error={guest.error} onRetry={() => void guest.refetch()} />
  const g = guest.data
  const s = summary.data

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={g.full_name} className="size-14 text-lg" />
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              <Link to="/guests" className="hover:underline">
                Guests
              </Link>
            </p>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
              {g.full_name}
              {g.anonymized_at && <Badge tone="muted">Anonymized</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground">{g.country ?? ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {g.phone && (
            <Button asChild variant="outline">
              <a href={whatsappLink(g.phone)} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          )}
          {can('booking.manage') && !g.anonymized_at && (
            <Button asChild>
              <Link to={`/bookings/new?guest=${g.id}`}>
                <CalendarPlus /> New booking
              </Link>
            </Button>
          )}
          {can('guest.manage') && !g.anonymized_at && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )}
          {role === 'owner' && !g.anonymized_at && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem destructive onSelect={() => setConfirmAnon(true)}>
                  <ShieldOff /> Remove personal data
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-center gap-2">
                <Phone className="size-4 text-muted-foreground" aria-hidden />
                {g.phone ? <a href={`tel:${g.phone}`} className="hover:underline">{formatPhone(g.phone)}</a> : '—'}
              </p>
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" aria-hidden />
                {g.email ? <a href={`mailto:${g.email}`} className="break-all hover:underline">{g.email}</a> : '—'}
              </p>
              <p className="text-xs text-muted-foreground">Guest since {formatDateTime(g.created_at, undefined, { dateOnly: true })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Preferences & notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Preferences</p>
                <p className="whitespace-pre-line">{g.preferences || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Internal notes</p>
                <p className="whitespace-pre-line">{g.notes || '—'}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {s ? (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Stays</dt>
                    <dd className="font-semibold">{s.stays}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Nights</dt>
                    <dd className="font-semibold">{s.nights}</dd>
                  </div>
                  {can('finance.view') && (
                    <>
                      <div>
                        <dt className="text-muted-foreground">Reservation value</dt>
                        <dd className="font-semibold tabular">{formatCents(s.value, currency, { compact: true })}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Net received</dt>
                        <dd className="font-semibold tabular">{formatCents(s.received, currency, { compact: true })}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Outstanding</dt>
                        <dd className={s.outstanding > 0 ? 'font-semibold text-warning' : 'font-semibold'}>
                          {formatCents(s.outstanding, currency, { compact: true })}
                        </dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt className="text-muted-foreground">Cancellations</dt>
                    <dd className="font-semibold">{s.cancellations}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold">Bookings</h2>
          <BookingTable guestId={g.id} />
        </div>
      </div>

      <GuestDialog guest={g} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={confirmAnon}
        onOpenChange={setConfirmAnon}
        title="Remove this guest’s personal data?"
        description="Name, phone, email, country, preferences and notes are erased permanently. Bookings and payments stay for your records under “Anonymized guest”. This cannot be undone."
        confirmLabel="Remove personal data"
        destructive
        onConfirm={async () => {
          try {
            await anonymize.mutateAsync(g.id)
            toast.success('Personal data removed.')
          } catch (e) {
            toast.error(toUserMessage(e))
            throw e
          }
        }}
      />
    </>
  )
}
