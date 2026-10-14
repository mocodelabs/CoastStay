import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-provider'
import { useOrg } from '@/features/workspace/workspace-provider'
import type { Priority, TaskStatus, TaskType } from '@/lib/labels'
import { removeFile, uploadFile } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Task = Database['public']['Tables']['housekeeping_tasks']['Row']
export type ChecklistItem = Database['public']['Tables']['housekeeping_checklist_items']['Row']
export type ChecklistTemplate = Database['public']['Tables']['checklist_templates']['Row']

export const hkKeys = {
  all: (orgId: string) => ['housekeeping', orgId] as const,
  list: (orgId: string, f: object) => ['housekeeping', orgId, 'list', f] as const,
  detail: (id: string) => ['housekeeping', 'task', id] as const,
  schedule: (orgId: string, from: string, to: string) => ['housekeeping', orgId, 'schedule', from, to] as const,
  templates: (orgId: string) => ['housekeeping', orgId, 'templates'] as const,
}

const LIST_SELECT =
  '*, property:properties(name), unit:property_units(name, is_default), assignee:profiles!housekeeping_tasks_assignee_profile_fk(full_name), items:housekeeping_checklist_items(is_completed)'

export type TaskListItem = Task & {
  property: { name: string } | null
  unit: { name: string; is_default: boolean } | null
  assignee: { full_name: string } | null
  items: { is_completed: boolean }[]
}

/** Active tasks (any date) plus tasks finished in the last `recentDays` days. */
export function useTasks(f: { property?: string; assignee?: string; recentDays?: number }) {
  const { orgId } = useOrg()
  const { user } = useAuth()
  return useQuery({
    queryKey: hkKeys.list(orgId, f),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const since = new Date(Date.now() - (f.recentDays ?? 7) * 86_400_000).toISOString()
      const build = () => {
        let q = supabase.from('housekeeping_tasks').select(LIST_SELECT).eq('organization_id', orgId)
        if (f.property) q = q.eq('property_id', f.property)
        if (f.assignee === 'me') q = q.eq('assigned_to', user!.id)
        else if (f.assignee === 'unassigned') q = q.is('assigned_to', null)
        else if (f.assignee && f.assignee !== 'all') q = q.eq('assigned_to', f.assignee)
        return q
      }
      const [active, done] = await Promise.all([
        build().in('status', ['pending', 'in_progress', 'awaiting_inspection']).order('scheduled_at').limit(500),
        build().in('status', ['completed', 'cancelled']).gte('updated_at', since).order('updated_at', { ascending: false }).limit(100),
      ])
      if (active.error) throw active.error
      if (done.error) throw done.error
      return { active: active.data as TaskListItem[], done: done.data as TaskListItem[] }
    },
  })
}

export type TaskDetail = Task & {
  property: { id: string; name: string; check_in_time: string | null; wifi_name: string | null } | null
  unit: { name: string; is_default: boolean } | null
  assignee: { full_name: string } | null
  inspector: { full_name: string } | null
  items: ChecklistItem[]
  comments: Array<{ id: string; body: string; created_at: string; author: { full_name: string } | null }>
  photos: Array<{ id: string; storage_path: string; caption: string | null; uploaded_by: string | null; created_at: string }>
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: hkKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<TaskDetail> => {
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select(
          '*, property:properties(id, name, check_in_time, wifi_name), unit:property_units(name, is_default), assignee:profiles!housekeeping_tasks_assignee_profile_fk(full_name), inspector:profiles!housekeeping_tasks_inspected_by_fkey(full_name), items:housekeeping_checklist_items(*), comments:housekeeping_task_comments(id, body, created_at, author:profiles(full_name)), photos:housekeeping_task_photos(id, storage_path, caption, uploaded_by, created_at)',
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      const d = data as unknown as TaskDetail
      return {
        ...d,
        items: [...d.items].sort((a, b) => a.sort_order - b.sort_order),
        comments: [...d.comments].sort((a, b) => a.created_at.localeCompare(b.created_at)),
        photos: [...d.photos].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }
    },
  })
}

export function useHousekeepingSchedule(from: string, to: string) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: hkKeys.schedule(orgId, from, to),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('housekeeping_schedule', { org: orgId, from_date: from, to_date: to })
      if (error) throw error
      return data
    },
  })
}

export function useChecklistTemplates() {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: hkKeys.templates(orgId),
    queryFn: async () => {
      const { data, error } = await supabase.from('checklist_templates').select('*').eq('organization_id', orgId).order('name')
      if (error) throw error
      return data
    },
  })
}

function useInvalidate() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return (taskId?: string) => {
    void qc.invalidateQueries({ queryKey: hkKeys.all(orgId) })
    if (taskId) void qc.invalidateQueries({ queryKey: hkKeys.detail(taskId) })
  }
}

export interface NewTaskInput {
  property_id: string
  unit_id: string
  task_type: TaskType
  title: string
  description: string
  scheduled_at: string
  due_at: string | null
  priority: Priority
  assigned_to: string | null
  inspection_required: boolean
  template_id: string
}

export function useCreateTask() {
  const { orgId } = useOrg()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: NewTaskInput) => {
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .insert({
          organization_id: orgId,
          property_id: v.property_id,
          unit_id: v.unit_id,
          task_type: v.task_type,
          title: v.title,
          description: v.description || null,
          scheduled_at: v.scheduled_at,
          due_at: v.due_at,
          priority: v.priority,
          assigned_to: v.assigned_to,
          inspection_required: v.inspection_required,
        })
        .select('id')
        .single()
      if (error) throw error
      if (v.template_id) {
        const { data: tpl, error: tplError } = await supabase.from('checklist_templates').select('items').eq('id', v.template_id).single()
        if (tplError) throw tplError
        const items = (tpl.items as Array<{ label?: string; requires_photo?: boolean }>).filter((i) => i.label?.trim())
        if (items.length) {
          const { error: itemsError } = await supabase.from('housekeeping_checklist_items').insert(
            items.map((i, idx) => ({
              organization_id: orgId,
              task_id: data.id,
              label: i.label!.trim().slice(0, 160),
              requires_photo: Boolean(i.requires_photo),
              sort_order: idx + 1,
            })),
          )
          if (itemsError) throw itemsError
        }
      }
      return data.id
    },
    onSuccess: () => invalidate(),
  })
}

export function useUpdateTask(taskId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (patch: {
      status?: TaskStatus
      assigned_to?: string | null
      completion_notes?: string | null
      priority?: Priority
      scheduled_at?: string
      due_at?: string | null
      inspection_required?: boolean
      title?: string
    }) => {
      const { error } = await supabase.from('housekeeping_tasks').update(patch).eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => invalidate(taskId),
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error, count } = await supabase.from('housekeeping_tasks').delete({ count: 'exact' }).eq('id', taskId)
      if (error) throw error
      if (!count) throw new Error('Only manually created tasks that have not started can be deleted. Cancel it instead.')
    },
    onSuccess: () => invalidate(),
  })
}

export function useToggleItem(taskId: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from('housekeeping_checklist_items').update({ is_completed: done }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: hkKeys.detail(taskId) })
      const prev = qc.getQueryData<TaskDetail>(hkKeys.detail(taskId))
      if (prev) {
        qc.setQueryData<TaskDetail>(hkKeys.detail(taskId), {
          ...prev,
          items: prev.items.map((i) => (i.id === id ? { ...i, is_completed: done } : i)),
        })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(hkKeys.detail(taskId), ctx.prev)
    },
    onSettled: () => invalidate(taskId),
  })
}

export function useAddComment(taskId: string) {
  const { orgId } = useOrg()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from('housekeeping_task_comments').insert({ organization_id: orgId, task_id: taskId, body })
      if (error) throw error
    },
    onSuccess: () => invalidate(taskId),
  })
}

export function useUploadTaskPhotos(taskId: string) {
  const { orgId } = useOrg()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (files: File[]) => {
      const failures: string[] = []
      for (const file of files) {
        try {
          const path = await uploadFile('task-photos', orgId, taskId, file)
          const { error } = await supabase.from('housekeeping_task_photos').insert({ organization_id: orgId, task_id: taskId, storage_path: path })
          if (error) {
            await removeFile('task-photos', path).catch(() => undefined)
            throw error
          }
        } catch (e) {
          failures.push(`${file.name}: ${e instanceof Error ? e.message : 'upload failed'}`)
        }
      }
      return failures
    },
    onSettled: () => invalidate(taskId),
  })
}

export function useDeleteTaskPhoto(taskId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (photo: { id: string; storage_path: string }) => {
      const { error } = await supabase.from('housekeeping_task_photos').delete().eq('id', photo.id)
      if (error) throw error
      await removeFile('task-photos', photo.storage_path).catch(() => undefined)
    },
    onSuccess: () => invalidate(taskId),
  })
}

export function useSaveChecklistTemplate() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id?: string; name: string; task_type: TaskType; is_default: boolean; items: Array<{ label: string; requires_photo: boolean }> }) => {
      if (v.is_default) {
        // Only one default per task type.
        const { error } = await supabase
          .from('checklist_templates')
          .update({ is_default: false })
          .eq('organization_id', orgId)
          .eq('task_type', v.task_type)
          .neq('id', v.id ?? '00000000-0000-0000-0000-000000000000')
        if (error) throw error
      }
      const row = { name: v.name, task_type: v.task_type, is_default: v.is_default, items: v.items }
      const { error } = v.id
        ? await supabase.from('checklist_templates').update(row).eq('id', v.id)
        : await supabase.from('checklist_templates').insert({ ...row, organization_id: orgId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: hkKeys.templates(orgId) }),
  })
}

export function useDeleteChecklistTemplate() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('checklist_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: hkKeys.templates(orgId) }),
  })
}
