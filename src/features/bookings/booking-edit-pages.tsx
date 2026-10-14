import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { usePropertyOptions } from '@/features/properties/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useRequestId } from '@/hooks/use-url-state'
import { centsToDecimal, toCents } from '@/lib/currency'
import { addDaysISO, isISODate, todayISO } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import type { BookingFormValues } from '@/schemas/booking'
import { useBooking, useCreateBooking, useUpdateBooking, type BookingDetail } from './api'
import { BookingForm } from './booking-form'

const dec = (v: number | string) => centsToDecimal(toCents(v))

export function BookingNewPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { timezone, settings } = useOrg()
  const properties = usePropertyOptions()
  const create = useCreateBooking()
  const requestId = useRequestId()

  if (properties.isPending) return <PageSkeleton />
  if (properties.isError) return <ErrorState error={properties.error} onRetry={() => void properties.refetch()} />

  const today = todayISO(timezone)
  const active = properties.data.filter((p) => p.status === 'active')
  const property = active.find((p) => p.id === params.get('property')) ?? (active.length === 1 ? active[0] : undefined)
  const unit =
    property?.units.find((u) => u.id === params.get('unit') && u.status === 'active') ?? property?.units.find((u) => u.status === 'active')
  const checkIn = isISODate(params.get('check_in')) ? params.get('check_in')! : ''
  const checkOut = isISODate(params.get('check_out')) ? params.get('check_out')! : checkIn ? addDaysISO(checkIn, 1) : ''
  const guestId = params.get('guest') ?? ''

  const initial: BookingFormValues = {
    guest_mode: 'existing',
    guest_id: guestId,
    new_guest_name: '',
    new_guest_phone: '',
    new_guest_email: '',
    property_id: property?.id ?? '',
    unit_id: unit?.id ?? '',
    check_in_date: checkIn,
    check_out_date: checkOut,
    adults: '2',
    children: '0',
    infants: '0',
    nightly_rate: property ? dec(unit?.nightly_rate_override ?? property.standard_nightly_rate) : '',
    cleaning_fee: property ? dec(property.cleaning_fee) : '',
    additional_fees: '',
    discount_amount: '',
    booking_source: 'direct',
    external_reference: '',
    status: 'confirmed',
    guest_requests: '',
    internal_notes: '',
    record_payment: false,
    payment_amount: '',
    payment_method: settings?.enabled_payment_methods[0] ?? 'mpesa',
    payment_reference: '',
    payment_date: today,
  }

  return (
    <>
      <PageHeader title="New booking" description="Dates are checked against existing stays and blocks before saving." />
      <BookingForm
        mode="create"
        initial={initial}
        submitLabel="Create booking"
        saving={create.isPending}
        error={create.isError ? toUserMessage(create.error) : null}
        onCancel={() => navigate(-1)}
        onSubmit={(values) =>
          create.mutate(
            { values, requestId: requestId.get() },
            {
              onSuccess: (id) => {
                requestId.renew()
                toast.success('Booking created.')
                navigate(`/bookings/${id}`, { replace: true })
              },
            },
          )
        }
      />
    </>
  )
}

export function bookingToForm(b: BookingDetail): BookingFormValues {
  return {
    guest_mode: 'existing',
    guest_id: b.guest_id,
    new_guest_name: '',
    new_guest_phone: '',
    new_guest_email: '',
    property_id: b.property_id,
    unit_id: b.unit_id,
    check_in_date: b.check_in_date,
    check_out_date: b.check_out_date,
    adults: String(b.adults),
    children: String(b.children),
    infants: String(b.infants),
    nightly_rate: dec(b.nightly_rate),
    cleaning_fee: dec(b.cleaning_fee),
    additional_fees: dec(b.additional_fees),
    discount_amount: dec(b.discount_amount),
    booking_source: b.booking_source,
    external_reference: b.external_reference ?? '',
    status: b.status === 'inquiry' || b.status === 'pending' ? b.status : 'confirmed',
    guest_requests: b.guest_requests ?? '',
    internal_notes: b.internal_notes ?? '',
    record_payment: false,
    payment_amount: '',
    payment_method: 'mpesa',
    payment_reference: '',
    payment_date: '',
  }
}

export function BookingEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const booking = useBooking(id)
  const update = useUpdateBooking(id)

  if (booking.isPending) return <PageSkeleton />
  if (booking.isError) return <ErrorState error={booking.error} onRetry={() => void booking.refetch()} />
  const b = booking.data
  if (['checked_out', 'cancelled', 'no_show'].includes(b.status)) {
    return (
      <ErrorState
        error={`This booking is ${b.status.replace('_', ' ')} — its dates and pricing are locked. Use payments or adjustments to correct amounts.`}
      />
    )
  }

  return (
    <>
      <PageHeader title={`Edit ${b.booking_reference}`} description={b.guest.full_name} />
      <BookingForm
        mode="edit"
        bookingId={b.id}
        initial={bookingToForm(b)}
        submitLabel="Save changes"
        saving={update.isPending}
        error={update.isError ? toUserMessage(update.error) : null}
        onCancel={() => navigate(`/bookings/${id}`)}
        onSubmit={(values) =>
          update.mutate(values, {
            onSuccess: () => {
              toast.success('Booking updated.')
              navigate(`/bookings/${id}`)
            },
          })
        }
      />
    </>
  )
}
