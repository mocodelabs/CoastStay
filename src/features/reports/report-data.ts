import { useQuery } from '@tanstack/react-query'
import type { BookingOverview } from '@/features/bookings/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { sumCents, toCents } from '@/lib/currency'
import { supabase } from '@/lib/supabase'

export interface ReportFilter {
  from: string
  to: string
  property: string
}

const MAX = 5000

/** Bookings whose check-in falls in the period (booking summary definition). */
export function useBookingsInPeriod(f: ReportFilter) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['reports', orgId, 'bookings', f],
    queryFn: async () => {
      let q = supabase
        .from('bookings_overview')
        .select('*')
        .eq('organization_id', orgId)
        .gte('check_in_date', f.from)
        .lte('check_in_date', f.to)
      if (f.property) q = q.eq('property_id', f.property)
      const { data, error } = await q.range(0, MAX - 1)
      if (error) throw error
      return data as BookingOverview[]
    },
  })
}

export function summarizeBookings(rows: BookingOverview[]) {
  const real = rows.filter((b) => b.status !== 'inquiry')
  const kept = real.filter((b) => !['cancelled'].includes(b.status))
  const group = <K extends string>(key: (b: BookingOverview) => K) => {
    const map = new Map<K, { count: number; nights: number; value: number }>()
    for (const b of real) {
      const k = key(b)
      const cur = map.get(k) ?? { count: 0, nights: 0, value: 0 }
      cur.count += 1
      if (b.status !== 'cancelled') {
        cur.nights += b.nights
        cur.value += toCents(b.total_amount)
      }
      map.set(k, cur)
    }
    return [...map.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.count - a.count)
  }
  return {
    inquiries: rows.length - real.length,
    bookings: real.length,
    kept: kept.length,
    cancelled: real.length - kept.length,
    nights: kept.reduce((n, b) => n + b.nights, 0),
    valueCents: sumCents(kept.map((b) => b.total_amount)),
    bySource: group((b) => b.booking_source),
    byStatus: group((b) => b.status),
    avgStay: kept.length ? kept.reduce((n, b) => n + b.nights, 0) / kept.length : 0,
  }
}

export function useCancellations(f: ReportFilter) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['reports', orgId, 'cancellations', f],
    queryFn: async () => {
      // Cancelled in the period (by cancellation time; day boundaries in the viewer's time zone).
      const start = new Date(`${f.from}T00:00:00`).toISOString()
      const end = new Date(new Date(`${f.to}T00:00:00`).getTime() + 86_400_000).toISOString()
      let q = supabase
        .from('bookings')
        .select('id, booking_reference, booking_source, check_in_date, total_amount, cancellation_fee, cancellation_reason, cancelled_at, property_id, guest:guests(full_name), property:properties(name)')
        .eq('organization_id', orgId)
        .eq('status', 'cancelled')
        .gte('cancelled_at', start)
        .lt('cancelled_at', end)
      if (f.property) q = q.eq('property_id', f.property)
      const cancelled = await q.order('cancelled_at', { ascending: false }).range(0, MAX - 1)
      if (cancelled.error) throw cancelled.error
      return cancelled.data
    },
  })
}

export function useExpensesByCategory(f: ReportFilter) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['reports', orgId, 'expense-categories', f],
    queryFn: async () => {
      let q = supabase
        .from('expenses')
        .select('category, amount, property_id')
        .eq('organization_id', orgId)
        .eq('status', 'recorded')
        .gte('expense_date', f.from)
        .lte('expense_date', f.to)
      if (f.property) q = q.eq('property_id', f.property)
      const [exp, cats] = await Promise.all([
        q.range(0, MAX - 1),
        supabase.from('expense_categories').select('code, name, include_in_operating_income').eq('organization_id', orgId),
      ])
      if (exp.error) throw exp.error
      if (cats.error) throw cats.error
      const totals = new Map<string, { cents: number; count: number }>()
      for (const e of exp.data) {
        const cur = totals.get(e.category) ?? { cents: 0, count: 0 }
        cur.cents += toCents(e.amount)
        cur.count += 1
        totals.set(e.category, cur)
      }
      return [...totals.entries()]
        .map(([code, v]) => {
          const c = cats.data.find((x) => x.code === code)
          return { code, name: c?.name ?? code, operating: c?.include_in_operating_income ?? true, ...v }
        })
        .sort((a, b) => b.cents - a.cents)
    },
  })
}

export function useHousekeepingStats(f: ReportFilter) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['reports', orgId, 'housekeeping', f],
    queryFn: async () => {
      let q = supabase
        .from('housekeeping_tasks')
        .select('id, status, task_type, scheduled_at, due_at, completed_at, assigned_to, assignee:profiles!housekeeping_tasks_assignee_profile_fk(full_name)')
        .eq('organization_id', orgId)
        .gte('scheduled_at', new Date(`${f.from}T00:00:00`).toISOString())
        .lt('scheduled_at', new Date(new Date(`${f.to}T00:00:00`).getTime() + 86_400_000).toISOString())
      if (f.property) q = q.eq('property_id', f.property)
      const { data, error } = await q.range(0, MAX - 1)
      if (error) throw error
      const now = Date.now()
      const live = data.filter((t) => t.status !== 'cancelled')
      const done = live.filter((t) => t.status === 'completed')
      const onTime = done.filter((t) => !t.due_at || (t.completed_at && t.completed_at <= t.due_at))
      const overdueOpen = live.filter((t) => t.status !== 'completed' && t.due_at && new Date(t.due_at).getTime() < now)
      const hours = done
        .filter((t) => t.completed_at)
        .map((t) => (new Date(t.completed_at!).getTime() - new Date(t.scheduled_at).getTime()) / 3_600_000)
        .filter((h) => h >= 0)
      const byPerson = new Map<string, { name: string; total: number; done: number }>()
      for (const t of live) {
        const k = t.assigned_to ?? 'unassigned'
        const cur = byPerson.get(k) ?? { name: t.assignee?.full_name ?? 'Unassigned', total: 0, done: 0 }
        cur.total += 1
        if (t.status === 'completed') cur.done += 1
        byPerson.set(k, cur)
      }
      return {
        total: live.length,
        completed: done.length,
        onTime: onTime.length,
        overdueOpen: overdueOpen.length,
        cancelled: data.length - live.length,
        avgHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
        byPerson: [...byPerson.values()].sort((a, b) => b.total - a.total),
      }
    },
  })
}

export function useMaintenanceStats(f: ReportFilter) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['reports', orgId, 'maintenance', f],
    queryFn: async () => {
      const startIso = new Date(`${f.from}T00:00:00`).toISOString()
      const endIso = new Date(new Date(`${f.to}T00:00:00`).getTime() + 86_400_000).toISOString()
      let q = supabase
        .from('maintenance_requests')
        .select('id, category, status, priority, reported_at, resolved_at, estimated_cost, actual_cost, property:properties(name)')
        .eq('organization_id', orgId)
        .or(`and(reported_at.gte.${startIso},reported_at.lt.${endIso}),and(resolved_at.gte.${startIso},resolved_at.lt.${endIso})`)
      if (f.property) q = q.eq('property_id', f.property)
      const { data, error } = await q.range(0, MAX - 1)
      if (error) throw error
      const inPeriod = (iso: string | null) => Boolean(iso && iso >= startIso && iso < endIso)
      const reported = data.filter((r) => inPeriod(r.reported_at))
      const resolved = data.filter((r) => inPeriod(r.resolved_at))
      const byCategory = new Map<string, { count: number; cents: number }>()
      for (const r of resolved) {
        const cur = byCategory.get(r.category) ?? { count: 0, cents: 0 }
        cur.count += 1
        cur.cents += toCents(r.actual_cost ?? 0)
        byCategory.set(r.category, cur)
      }
      const days = resolved
        .filter((r) => r.resolved_at)
        .map((r) => (new Date(r.resolved_at!).getTime() - new Date(r.reported_at).getTime()) / 86_400_000)
      return {
        reported: reported.length,
        resolved: resolved.length,
        urgent: reported.filter((r) => r.priority === 'urgent').length,
        costCents: sumCents(resolved.map((r) => r.actual_cost ?? 0)),
        estimateCents: sumCents(resolved.map((r) => r.estimated_cost ?? 0)),
        avgDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null,
        byCategory: [...byCategory.entries()].map(([k, v]) => ({ category: k, ...v })).sort((a, b) => b.cents - a.cents),
      }
    },
  })
}

export function useInventoryConsumption(f: ReportFilter) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['reports', orgId, 'inventory', f],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('quantity, unit_cost, created_at, item:inventory_items(id, name, unit_of_measure, unit_cost, property_id, property:properties(name))')
        .eq('organization_id', orgId)
        .eq('movement_type', 'consumption')
        .gte('created_at', new Date(`${f.from}T00:00:00`).toISOString())
        .lt('created_at', new Date(new Date(`${f.to}T00:00:00`).getTime() + 86_400_000).toISOString())
        .range(0, MAX - 1)
      if (error) throw error
      const map = new Map<string, { name: string; location: string; unit: string; qty: number; cents: number }>()
      for (const m of data) {
        if (!m.item) continue
        if (f.property && m.item.property_id !== f.property) continue
        const cur = map.get(m.item.id) ?? { name: m.item.name, location: m.item.property?.name ?? 'Shared store', unit: m.item.unit_of_measure, qty: 0, cents: 0 }
        const used = Math.abs(m.quantity)
        cur.qty += used
        cur.cents += Math.round(used * toCents(m.item.unit_cost ?? 0))
        map.set(m.item.id, cur)
      }
      return [...map.values()].sort((a, b) => b.cents - a.cents || b.qty - a.qty)
    },
  })
}
