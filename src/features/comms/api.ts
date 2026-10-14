import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '@/features/workspace/workspace-provider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Template = Database['public']['Tables']['communication_templates']['Row']

export const commsKeys = {
  templates: (orgId: string) => ['comms', orgId, 'templates'] as const,
  logs: (bookingId: string) => ['comms', 'logs', bookingId] as const,
}

export function useTemplates() {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: commsKeys.templates(orgId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_templates')
        .select('*')
        .eq('organization_id', orgId)
        .order('is_system', { ascending: false })
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useMessageLogs(bookingId: string) {
  return useQuery({
    queryKey: commsKeys.logs(bookingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_logs')
        .select('id, template_key, channel, status, created_at, sender:profiles(full_name)')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data
    },
  })
}

export function useLogMessage() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      bookingId?: string
      guestId?: string
      templateKey?: string
      channel: 'whatsapp' | 'email' | 'sms'
      recipient: string
      body: string
      status: 'prepared' | 'opened'
    }) => {
      const { error } = await supabase.from('communication_logs').insert({
        organization_id: orgId,
        booking_id: v.bookingId ?? null,
        guest_id: v.guestId ?? null,
        template_key: v.templateKey ?? null,
        channel: v.channel,
        recipient: v.recipient,
        body: v.body,
        status: v.status,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      if (v.bookingId) void qc.invalidateQueries({ queryKey: commsKeys.logs(v.bookingId) })
    },
  })
}

export function useSaveTemplate() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id?: string; name: string; body: string; subject?: string | null; is_active?: boolean; template_key?: string }) => {
      if (v.id) {
        const { error } = await supabase
          .from('communication_templates')
          .update({ name: v.name, body: v.body, subject: v.subject ?? null, is_active: v.is_active ?? true })
          .eq('id', v.id)
        if (error) throw error
      } else {
        const key = v.template_key ?? `custom_${Date.now().toString(36)}`
        const { error } = await supabase
          .from('communication_templates')
          .insert({ organization_id: orgId, template_key: key, name: v.name, body: v.body, subject: v.subject ?? null })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commsKeys.templates(orgId) }),
  })
}

export function useDeleteTemplate() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('communication_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commsKeys.templates(orgId) }),
  })
}
