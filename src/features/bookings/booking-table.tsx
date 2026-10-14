import { BedDouble, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { EmptyState, ListSkeleton, QueryState } from '@/components/feedback/states'
import { Money } from '@/components/money'
import { BookingStatusBadge, PaymentStateBadge } from '@/components/status-badges'
import { Pagination } from '@/components/tables/pagination'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatDate } from '@/lib/date-utils'
import { BOOKING_SOURCE } from '@/lib/labels'
import { useBookings, type BookingFilters, type BookingOverview } from './api'

export function stayLabel(b: Pick<BookingOverview, 'property_name' | 'unit_name' | 'unit_is_default'>) {
  return b.unit_is_default ? b.property_name : `${b.property_name} · ${b.unit_name}`
}

export function BookingRows({
  rows,
  showGuest = true,
  showProperty = true,
}: {
  rows: BookingOverview[]
  showGuest?: boolean
  showProperty?: boolean
}) {
  const { can, currency } = useOrg()
  const navigate = useNavigate()
  const money = can('finance.view')
  return (
    <Card>
      <Table>
        <THead>
          <tr>
            <TH>Booking</TH>
            {showProperty && <TH className="hidden md:table-cell">Property</TH>}
            <TH>Stay</TH>
            <TH>Status</TH>
            {money && <TH className="hidden text-right sm:table-cell">Total</TH>}
            {money && <TH className="text-right">Balance</TH>}
          </tr>
        </THead>
        <TBody>
          {rows.map((b) => (
            <TR key={b.id} className="cursor-pointer" onClick={() => navigate(`/bookings/${b.id}`)}>
              <TD>
                <Link
                  to={`/bookings/${b.id}`}
                  className="font-medium hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {showGuest ? b.guest_name : b.booking_reference}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {showGuest && `${b.booking_reference} · `}
                  {BOOKING_SOURCE[b.booking_source]}
                </p>
                {showProperty && <p className="text-xs text-muted-foreground md:hidden">{stayLabel(b)}</p>}
              </TD>
              {showProperty && <TD className="hidden text-sm md:table-cell">{stayLabel(b)}</TD>}
              <TD className="text-sm whitespace-nowrap">
                {formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}
                <p className="text-xs text-muted-foreground">
                  {b.nights} night{b.nights === 1 ? '' : 's'} · {b.adults + b.children} guest{b.adults + b.children === 1 ? '' : 's'}
                </p>
              </TD>
              <TD>
                <div className="flex flex-col items-start gap-1">
                  <BookingStatusBadge status={b.status} />
                  {money && <PaymentStateBadge state={b.payment_state} />}
                </div>
              </TD>
              {money && (
                <TD className="hidden text-right sm:table-cell">
                  <Money value={b.total_amount} currency={currency} compact />
                </TD>
              )}
              {money && (
                <TD className="text-right">
                  <Money
                    value={b.status === 'inquiry' ? 0 : b.balance_due}
                    currency={currency}
                    compact
                    className={b.balance_due > 0 && b.status !== 'inquiry' ? 'font-medium text-warning' : 'text-muted-foreground'}
                  />
                </TD>
              )}
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  )
}

/** Self-contained list for embedding (property and guest pages). */
export function BookingTable({ propertyId, guestId }: { propertyId?: string; guestId?: string }) {
  const { can } = useOrg()
  const [page, setPage] = useState(1)
  const filters: BookingFilters = { property: propertyId, guest: guestId, page, pageSize: 10 }
  const query = useBookings(filters)
  const newLink = `/bookings/new?${propertyId ? `property=${propertyId}` : ''}${guestId ? `guest=${guestId}` : ''}`
  return (
    <QueryState
      query={query}
      loading={<ListSkeleton rows={3} />}
      isEmpty={(d) => d.rows.length === 0}
      empty={
        <EmptyState
          icon={BedDouble}
          title="No bookings yet"
          action={
            can('booking.manage') && (
              <Button asChild variant="outline">
                <Link to={newLink}>
                  <Plus /> New booking
                </Link>
              </Button>
            )
          }
        />
      }
    >
      {(d) => (
        <>
          <BookingRows rows={d.rows} showGuest={!guestId} showProperty={!propertyId} />
          <Pagination page={page} total={d.total} size={10} onPage={setPage} />
        </>
      )}
    </QueryState>
  )
}
