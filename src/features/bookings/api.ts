import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pageRange } from '@/components/tables/pagination'
import { useOrg } from '@/features/workspace/workspace-provider'
import type { BookingStatus, PaymentState } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { BlockFormValues, BookingFormValues, CancelFormValues, PaymentFormValues } from '@/schemas/booking'
import { orNull, phoneOrNull } from '@/schemas/common'
import type { Database, Json } from '@/types/database'

type OvRow = Database['public']['Views']['bookings_overview']['Row']
export type BookingOverview = {
  [K in keyof OvRow]: K extends 'external_reference' | 'guest_phone' ? OvRow[K] : NonNullable<OvRow[K]>
} & { payment_state: PaymentState }
type BookingRow = Database['public']['Tables']['bookings']['Row']
/** Generated columns are typed nullable by the generator but are always computed. */
export type Booking = Omit<BookingRow, 'nights' | 'accommodation_amount' | 'total_amount' | 'balance_due'> & {
  nights: number
  accommodation_amount: number
  total_amount: number
  balance_due: number
}
export type Payment = Database['public']['Tables']['booking_payments']['Row']

export const bookingKeys = {
  all: ['bookings'] as const,
  list: (orgId: string, f: object) => ['bookings', orgId, 'list', f] as const,
  detail: (id: string) => ['bookings', 'detail', id] as const,
  payments: (id: string) => ['bookings', 'payments', id] as const,
  history: (id: string) => ['bookings', 'history', id] as const,
  conflicts: (unit: string, from: string, to: string, ignore?: string) => ['bookings', 'conflicts', unit, from, to, ignore] as const,
}

export interface BookingFilters {
  q?: string
  status?: string
  source?: string
  payment?: string
  property?: string
  guest?: string
  from?: string
  to?: string
  page: number
  pageSize?: number
}

export function useBookings(f: BookingFilters) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: bookingKeys.list(orgId, f),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase.from('bookings_overview').select('*', { count: 'exact' }).eq('organization_id', orgId)
      if (f.q) q = q.ilike('search_text', `%${f.q.toLowerCase().replace(/[%_]/g, '')}%`)
      if (f.status === 'active') q = q.in('status', ['pending', 'confirmed', 'checked_in'])
      else if (f.status) q = q.eq('status', f.status as BookingStatus)
      if (f.source) q = q.eq('booking_source', f.source as Booking['booking_source'])
      if (f.payment) q = q.eq('payment_state', f.payment)
      if (f.property) q = q.eq('property_id', f.property)
      if (f.guest) q = q.eq('guest_id', f.guest)
      // Stays overlapping the chosen window (check-out exclusive)
      if (f.from) q = q.gt('check_out_date', f.from)
      if (f.to) q = q.lte('check_in_date', f.to)
      const [from, to] = pageRange(f.page, f.pageSize)
      const { data, error, count } = await q.order('check_in_date', { ascending: false }).order('created_at').range(from, to)
      if (error) throw error
      return { rows: data as BookingOverview[], total: count ?? 0 }
    },
  })
}

export interface BookingDetail extends Booking {
  guest: Database['public']['Tables']['guests']['Row']
  property: Pick<
    Database['public']['Tables']['properties']['Row'],
    | 'id'
    | 'name'
    | 'address'
    | 'location_name'
    | 'county'
    | 'check_in_time'
    | 'check_out_time'
    | 'check_in_instructions'
    | 'check_out_instructions'
    | 'directions'
    | 'wifi_name'
    | 'wifi_password'
    | 'max_guests'
    | 'house_rules'
  >
  unit: Pick<Database['public']['Tables']['property_units']['Row'], 'id' | 'name' | 'is_default' | 'max_guests'>
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<BookingDetail> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          '*, guest:guests(*), property:properties(id, name, address, location_name, county, check_in_time, check_out_time, check_in_instructions, check_out_instructions, directions, wifi_name, wifi_password, max_guests, house_rules), unit:property_units(id, name, is_default, max_guests)',
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as BookingDetail
    },
  })
}

export function useBookingPayments(bookingId: string, enabled = true) {
  return useQuery({
    queryKey: bookingKeys.payments(bookingId),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_payments')
        .select('*, recorder:profiles(full_name)')
        .eq('booking_id', bookingId)
        .order('payment_date')
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useBookingHistory(bookingId: string) {
  return useQuery({
    queryKey: bookingKeys.history(bookingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, entity_type, action, changes, created_at, actor:profiles(full_name)')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data
    },
  })
}

/** Existing stays/blocks that overlap a proposed range on a unit (live availability check). */
export function useUnitConflicts(unitId: string, from: string, to: string, ignoreBooking?: string) {
  const valid = Boolean(unitId && from && to && to > from)
  return useQuery({
    queryKey: bookingKeys.conflicts(unitId, from, to, ignoreBooking),
    enabled: valid,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('unit_conflicts', {
        target_unit: unitId,
        from_date: from,
        to_date: to,
        ignore_booking: ignoreBooking,
      })
      if (error) throw error
      return data
    },
  })
}

function useInvalidateBookings() {
  const qc = useQueryClient()
  const { orgId } = useOrg()
  return (bookingId?: string) => {
    void qc.invalidateQueries({ queryKey: bookingKeys.all })
    void qc.invalidateQueries({ queryKey: ['calendar', orgId] })
    void qc.invalidateQueries({ queryKey: ['housekeeping', orgId] })
    void qc.invalidateQueries({ queryKey: ['guest-summary'] })
    void qc.invalidateQueries({ queryKey: ['finances', orgId] })
    if (bookingId) void qc.invalidateQueries({ queryKey: bookingKeys.detail(bookingId) })
  }
}

export function useCreateBooking() {
  const { orgId } = useOrg()
  const invalidate = useInvalidateBookings()
  return useMutation({
    mutationFn: async ({ values, requestId }: { values: BookingFormValues; requestId: string }) => {
      const payload: Record<string, Json> = {
        organization_id: orgId,
        client_request_id: requestId,
        guest_id: values.guest_mode === 'existing' ? values.guest_id : null,
        new_guest:
          values.guest_mode === 'new'
            ? {
                full_name: values.new_guest_name,
                phone: phoneOrNull(values.new_guest_phone),
                email: orNull(values.new_guest_email),
              }
            : null,
        property_id: values.property_id,
        unit_id: values.unit_id,
        check_in_date: values.check_in_date,
        check_out_date: values.check_out_date,
        adults: Number(values.adults),
        children: Number(values.children),
        infants: Number(values.infants),
        nightly_rate: values.nightly_rate,
        cleaning_fee: values.cleaning_fee || '0',
        additional_fees: values.additional_fees || '0',
        discount_amount: values.discount_amount || '0',
        booking_source: values.booking_source,
        external_reference: values.external_reference,
        status: values.status,
        guest_requests: values.guest_requests,
        internal_notes: values.internal_notes,
        initial_payment: values.record_payment
          ? {
              amount: values.payment_amount,
              payment_type: 'deposit',
              payment_method: values.payment_method,
              transaction_reference: values.payment_reference,
              payment_date: values.payment_date,
            }
          : null,
      }
      const { data, error } = await supabase.rpc('create_booking', { payload })
      if (error) throw error
      return data
    },
    onSuccess: () => invalidate(),
  })
}

export function useUpdateBooking(id: string) {
  const invalidate = useInvalidateBookings()
  return useMutation({
    mutationFn: async (values: BookingFormValues) => {
      const { error } = await supabase
        .from('bookings')
        .update({
          guest_id: values.guest_id,
          property_id: values.property_id,
          unit_id: values.unit_id,
          check_in_date: values.check_in_date,
          check_out_date: values.check_out_date,
          adults: Number(values.adults),
          children: Number(values.children),
          infants: Number(values.infants),
          nightly_rate: Number(values.nightly_rate),
          cleaning_fee: Number(values.cleaning_fee || 0),
          additional_fees: Number(values.additional_fees || 0),
          discount_amount: Number(values.discount_amount || 0),
          booking_source: values.booking_source as Booking['booking_source'],
          external_reference: orNull(values.external_reference),
          guest_requests: orNull(values.guest_requests),
          internal_notes: orNull(values.internal_notes),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(id),
  })
}

export function useSetBookingStatus(id: string) {
  const invalidate = useInvalidateBookings()
  return useMutation({
    mutationFn: async (status: BookingStatus) => {
      const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(id),
  })
}

export function useCancelBooking(id: string) {
  const invalidate = useInvalidateBookings()
  return useMutation({
    mutationFn: async (v: CancelFormValues) => {
      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancellation_fee: Number(v.cancellation_fee || 0),
          cancellation_reason: v.cancellation_reason,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(id),
  })
}

export function useRecordPayment(bookingId: string) {
  const { orgId } = useOrg()
  const invalidate = useInvalidateBookings()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ values, requestId }: { values: PaymentFormValues; requestId: string }) => {
      const { error } = await supabase.from('booking_payments').upsert(
        {
          organization_id: orgId,
          booking_id: bookingId,
          amount: Number(values.amount),
          payment_type: values.payment_type,
          payment_method: values.payment_method,
          transaction_reference: orNull(values.transaction_reference),
          payment_date: values.payment_date,
          notes: orNull(values.notes),
          client_request_id: requestId,
        },
        { onConflict: 'organization_id,client_request_id', ignoreDuplicates: true },
      )
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(bookingId)
      void qc.invalidateQueries({ queryKey: bookingKeys.payments(bookingId) })
    },
  })
}

export function useReversePayment(bookingId: string) {
  const { orgId } = useOrg()
  const invalidate = useInvalidateBookings()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ payment, reason, date }: { payment: Payment; reason: string; date: string }) => {
      const { error } = await supabase.from('booking_payments').insert({
        organization_id: orgId,
        booking_id: bookingId,
        amount: payment.amount,
        payment_type: 'reversal',
        payment_method: payment.payment_method,
        payment_date: date,
        reverses_payment_id: payment.id,
        notes: reason,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(bookingId)
      void qc.invalidateQueries({ queryKey: bookingKeys.payments(bookingId) })
    },
  })
}

export function useCreateBlock() {
  const { orgId } = useOrg()
  const invalidate = useInvalidateBookings()
  return useMutation({
    mutationFn: async ({ values, maintenanceRequestId }: { values: BlockFormValues; maintenanceRequestId?: string }) => {
      const { error } = await supabase.from('property_blocks').insert({
        organization_id: orgId,
        property_id: values.property_id,
        unit_id: values.unit_id,
        start_date: values.start_date,
        end_date: values.end_date,
        reason: values.reason,
        notes: orNull(values.notes),
        maintenance_request_id: maintenanceRequestId ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

export function useDeleteBlock() {
  const invalidate = useInvalidateBookings()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('property_blocks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}
