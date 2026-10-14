import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pageRange } from '@/components/tables/pagination'
import { useOrg } from '@/features/workspace/workspace-provider'
import type { MaintenanceStatus, Priority } from '@/lib/labels'
import { removeFile, uploadFile } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type MaintenanceRequest = Database['public']['Tables']['maintenance_requests']['Row']

export const mxKeys = {
  all: (orgId: string) => ['maintenance', orgId] as const,
  list: (orgId: string, f: object) => ['maintenance', orgId, 'list', f] as const,
  detail: (id: string) => ['maintenance', 'detail', id] as const,
}

const LIST_SELECT =
  '*, property:properties(name), unit:property_units(name, is_default), assignee:profiles!maintenance_requests_assignee_profile_fk(full_name)'

export type MaintenanceListItem = MaintenanceRequest & {
  property: { name: string } | null
  unit: { name: string; is_default: boolean } | null
  assignee: { full_name: string } | null
}

export function useMaintenanceList(f: { property?: string; status?: string; priority?: string; page: number; pageSize?: number }) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: mxKeys.list(orgId, f),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase.from('maintenance_requests').select(LIST_SELECT, { count: 'exact' }).eq('organization_id', orgId)
      if (f.property) q = q.eq('property_id', f.property)
      if (f.status === 'open' || !f.status) q = q.in('status', ['reported', 'assigned', 'in_progress', 'waiting_for_parts'])
      else if (f.status !== 'all') q = q.eq('status', f.status as MaintenanceStatus)
      if (f.priority) q = q.eq('priority', f.priority as Priority)
      const [from, to] = pageRange(f.page, f.pageSize)
      const { data, error, count } = await q.order('reported_at', { ascending: false }).range(from, to)
      if (error) throw error
      const order: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
      const rows = (data as MaintenanceListItem[]).sort(
        (a, b) => order[a.priority] - order[b.priority] || b.reported_at.localeCompare(a.reported_at),
      )
      return { rows, total: count ?? 0 }
    },
  })
}

export type MaintenanceDetail = MaintenanceListItem & {
  reporter: { full_name: string } | null
  attachments: Array<{ id: string; storage_path: string; caption: string | null; uploaded_by: string | null; created_at: string }>
  blocks: Array<{ id: string; start_date: string; end_date: string }>
  expenses: Array<{ id: string; amount: number; status: string; expense_date: string }>
}

export function useMaintenance(id: string | undefined) {
  const { can } = useOrg()
  return useQuery({
    queryKey: mxKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<MaintenanceDetail> => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select(
          `${LIST_SELECT}, reporter:profiles!maintenance_requests_reported_by_fkey(full_name), attachments:maintenance_attachments(id, storage_path, caption, uploaded_by, created_at), blocks:property_blocks(id, start_date, end_date)`,
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      let expenses: MaintenanceDetail['expenses'] = []
      if (can('finance.view')) {
        const r = await supabase.from('expenses').select('id, amount, status, expense_date').eq('maintenance_request_id', id!)
        if (r.error) throw r.error
        expenses = r.data
      }
      return { ...(data as unknown as MaintenanceDetail), expenses }
    },
  })
}

function useInvalidate() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: mxKeys.all(orgId) })
    if (id) void qc.invalidateQueries({ queryKey: mxKeys.detail(id) })
  }
}

export interface MaintenanceInput {
  property_id: string
  unit_id: string | null
  title: string
  description: string | null
  category: string
  priority: Priority
  assigned_to?: string | null
  technician_name?: string | null
  technician_phone?: string | null
  estimated_cost?: number | null
  target_date?: string | null
}

export function useCreateMaintenance() {
  const { orgId } = useOrg()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ input, files }: { input: MaintenanceInput; files: File[] }) => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .insert({ ...input, organization_id: orgId })
        .select('id')
        .single()
      if (error) throw error
      const failures: string[] = []
      for (const f of files) {
        try {
          const path = await uploadFile('maintenance-attachments', orgId, data.id, f)
          const r = await supabase.from('maintenance_attachments').insert({ organization_id: orgId, request_id: data.id, storage_path: path })
          if (r.error) throw r.error
        } catch (e) {
          failures.push(`${f.name}: ${e instanceof Error ? e.message : 'upload failed'}`)
        }
      }
      return { id: data.id, failures }
    },
    onSuccess: () => invalidate(),
  })
}

export function useUpdateMaintenance(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (patch: Partial<MaintenanceInput> & { status?: MaintenanceStatus; actual_cost?: number | null; resolution_notes?: string | null }) => {
      const { error } = await supabase.from('maintenance_requests').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(id),
  })
}

export function useAddAttachments(id: string) {
  const { orgId } = useOrg()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (files: File[]) => {
      const failures: string[] = []
      for (const f of files) {
        try {
          const path = await uploadFile('maintenance-attachments', orgId, id, f)
          const r = await supabase.from('maintenance_attachments').insert({ organization_id: orgId, request_id: id, storage_path: path })
          if (r.error) {
            await removeFile('maintenance-attachments', path).catch(() => undefined)
            throw r.error
          }
        } catch (e) {
          failures.push(`${f.name}: ${e instanceof Error ? e.message : 'upload failed'}`)
        }
      }
      return failures
    },
    onSettled: () => invalidate(id),
  })
}
