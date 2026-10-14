import { useQuery } from '@tanstack/react-query'
import { useOrg } from '@/features/workspace/workspace-provider'
import { supabase } from '@/lib/supabase'

export interface PropertyPerformance {
  property_id: string
  property_name: string
  unit_count: number
  available_nights: number
  blocked_nights: number
  occupied_nights: number
  accommodation_revenue: number
  reservation_value: number
  payments_collected: number
  operating_expenses: number
}

export interface MonthRow {
  month: string
  net_collected: number
  refunds: number
  operating_expenses: number
  estimated_operating_income: number
  reservation_value: number
  accommodation_revenue: number
  occupied_nights: number
  available_nights: number
}

/** Derived metrics with documented formulas (docs/REPORTS.md). Ratios are null when undefined. */
export function metrics(r: Pick<PropertyPerformance, 'available_nights' | 'occupied_nights' | 'accommodation_revenue'>) {
  return {
    occupancy: r.available_nights > 0 ? (r.occupied_nights / r.available_nights) * 100 : null,
    adr: r.occupied_nights > 0 ? r.accommodation_revenue / r.occupied_nights : null,
    revpar: r.available_nights > 0 ? r.accommodation_revenue / r.available_nights : null,
  }
}

export function sumPerformance(rows: PropertyPerformance[]) {
  return rows.reduce(
    (a, r) => ({
      available_nights: a.available_nights + r.available_nights,
      blocked_nights: a.blocked_nights + r.blocked_nights,
      occupied_nights: a.occupied_nights + r.occupied_nights,
      accommodation_revenue: a.accommodation_revenue + Number(r.accommodation_revenue),
      reservation_value: a.reservation_value + Number(r.reservation_value),
      payments_collected: a.payments_collected + Number(r.payments_collected),
      operating_expenses: a.operating_expenses + Number(r.operating_expenses),
    }),
    { available_nights: 0, blocked_nights: 0, occupied_nights: 0, accommodation_revenue: 0, reservation_value: 0, payments_collected: 0, operating_expenses: 0 },
  )
}

export function usePropertyPerformance(from: string, to: string, enabled = true) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['reports', orgId, 'performance', from, to],
    enabled,
    queryFn: async (): Promise<PropertyPerformance[]> => {
      const { data, error } = await supabase.rpc('report_property_performance', { org: orgId, from_date: from, to_date: to })
      if (error) throw error
      return data
    },
  })
}

export function useMonthly(firstMonth: string, months: number, enabled = true) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['reports', orgId, 'monthly', firstMonth, months],
    enabled,
    queryFn: async (): Promise<MonthRow[]> => {
      const { data, error } = await supabase.rpc('report_monthly', { org: orgId, first_month: firstMonth, months })
      if (error) throw error
      return data
    },
  })
}

export function useDashboardToday() {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['dashboard', orgId, 'today'],
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_today', { org: orgId })
      if (error) throw error
      const row = data[0]
      if (!row) throw new Error('No snapshot')
      return row
    },
  })
}
