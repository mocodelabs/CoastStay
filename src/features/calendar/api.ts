import { useQuery } from '@tanstack/react-query'
import type { BookingOverview } from '@/features/bookings/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Block = Database['public']['Tables']['property_blocks']['Row']

/** Bookings and blocks overlapping [start, end) (end exclusive). */
export function useCalendarData(start: string, end: string, propertyId: string, includeCancelled: boolean) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['calendar', orgId, start, end, propertyId, includeCancelled],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let bq = supabase
        .from('bookings_overview')
        .select('*')
        .eq('organization_id', orgId)
        .lt('check_in_date', end)
        .gt('check_out_date', start)
        .neq('status', 'no_show')
      if (!includeCancelled) bq = bq.neq('status', 'cancelled')
      if (propertyId) bq = bq.eq('property_id', propertyId)
      let kq = supabase.from('property_blocks').select('*').eq('organization_id', orgId).lt('start_date', end).gt('end_date', start)
      if (propertyId) kq = kq.eq('property_id', propertyId)
      const [bookings, blocks] = await Promise.all([bq, kq])
      if (bookings.error) throw bookings.error
      if (blocks.error) throw blocks.error
      return { bookings: bookings.data as BookingOverview[], blocks: blocks.data }
    },
  })
}
