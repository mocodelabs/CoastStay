import { BedDouble, Plus, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, ListSkeleton, QueryState } from '@/components/feedback/states'
import { SearchInput } from '@/components/forms/search-input'
import { PageHeader } from '@/components/layout/page-header'
import { Pagination } from '@/components/tables/pagination'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Label } from '@/components/ui/primitives'
import { usePropertyOptions } from '@/features/properties/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useUrlFilters } from '@/hooks/use-url-state'
import { BOOKING_SOURCE, BOOKING_SOURCES, BOOKING_STATUS, BOOKING_STATUSES, PAYMENT_STATE } from '@/lib/labels'
import { useBookings } from './api'
import { BookingRows } from './booking-table'

const FILTERS = ['q', 'status', 'source', 'payment', 'property', 'from', 'to'] as const

export function BookingsPage() {
  const { can } = useOrg()
  const { values, page, set, clear, active } = useUrlFilters(FILTERS)
  const properties = usePropertyOptions()
  const [showFilters, setShowFilters] = useState(() => Boolean(values.source || values.payment || values.from || values.to))
  const query = useBookings({ ...values, page })

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Reservations across your properties."
        actions={
          can('booking.manage') && (
            <Button asChild>
              <Link to="/bookings/new">
                <Plus /> New booking
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput
            value={values.q}
            onChange={(q) => set({ q })}
            placeholder="Guest, phone, reference or property"
            className="sm:max-w-sm sm:flex-1"
          />
          <NativeSelect aria-label="Status" value={values.status} onChange={(e) => set({ status: e.target.value })} className="sm:w-44">
            <option value="">All statuses</option>
            <option value="active">Active (pending, confirmed, in house)</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {BOOKING_STATUS[s].label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Property" value={values.property} onChange={(e) => set({ property: e.target.value })} className="sm:w-48">
            <option value="">All properties</option>
            {properties.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
          <Button variant="outline" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <SlidersHorizontal /> More filters
          </Button>
        </div>
        {showFilters && (
          <div className="grid gap-3 rounded-lg border bg-sand-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="f-from">Staying from</Label>
              <Input id="f-from" type="date" value={values.from} onChange={(e) => set({ from: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="f-to">Staying until</Label>
              <Input id="f-to" type="date" value={values.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="f-source">Source</Label>
              <NativeSelect id="f-source" value={values.source} onChange={(e) => set({ source: e.target.value })}>
                <option value="">Any source</option>
                {BOOKING_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {BOOKING_SOURCE[s]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {can('finance.view') && (
              <div className="space-y-1">
                <Label htmlFor="f-payment">Payment</Label>
                <NativeSelect id="f-payment" value={values.payment} onChange={(e) => set({ payment: e.target.value })}>
                  <option value="">Any payment status</option>
                  {(['unpaid', 'partial', 'paid', 'overpaid'] as const).map((s) => (
                    <option key={s} value={s}>
                      {PAYMENT_STATE[s].label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
        )}
        {active && (
          <Button variant="link" size="sm" onClick={clear}>
            Clear all filters
          </Button>
        )}
      </div>
      <QueryState
        query={query}
        loading={<ListSkeleton />}
        isEmpty={(d) => d.rows.length === 0}
        empty={
          <EmptyState
            icon={BedDouble}
            title={active ? 'No bookings match these filters' : 'No bookings yet'}
            description={active ? undefined : 'Record Airbnb, Booking.com, WhatsApp and direct reservations here.'}
            action={
              active ? (
                <Button variant="outline" onClick={clear}>
                  Clear filters
                </Button>
              ) : (
                can('booking.manage') && (
                  <Button asChild>
                    <Link to="/bookings/new">
                      <Plus /> New booking
                    </Link>
                  </Button>
                )
              )
            }
          />
        }
      >
        {(d) => (
          <>
            <BookingRows rows={d.rows} />
            <Pagination page={page} total={d.total} onPage={(p) => set({ page: p })} />
          </>
        )}
      </QueryState>
    </>
  )
}
