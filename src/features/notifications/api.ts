import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-provider'
import { useOrg } from '@/features/workspace/workspace-provider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Notification = Database['public']['Tables']['notifications']['Row']

const key = (orgId: string, userId: string) => ['notifications', orgId, userId] as const

/** Latest notifications for the signed-in user; polled because Realtime is not required. */
export function useNotifications() {
  const { orgId } = useOrg()
  const { user } = useAuth()
  return useQuery({
    queryKey: key(orgId, user?.id ?? ''),
    enabled: Boolean(user),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('organization_id', orgId)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(40)
      if (error) throw error
      return data
    },
  })
}

export function useMarkRead() {
  const { orgId } = useOrg()
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[] | 'all') => {
      let q = supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('organization_id', orgId)
        .eq('user_id', user!.id)
        .is('read_at', null)
      if (ids !== 'all') q = q.in('id', ids)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgId, user!.id) }),
  })
}

export function notificationLink(n: Pick<Notification, 'related_entity_type' | 'related_entity_id'>): string | null {
  if (!n.related_entity_id) return null
  switch (n.related_entity_type) {
    case 'booking':
      return `/bookings/${n.related_entity_id}`
    case 'housekeeping_task':
      return `/housekeeping/${n.related_entity_id}`
    case 'maintenance_request':
      return `/maintenance/${n.related_entity_id}`
    case 'inventory_item':
      return '/inventory?low=1'
    default:
      return null
  }
}
