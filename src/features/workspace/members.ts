import { useQuery } from '@tanstack/react-query'
import type { Role } from '@/lib/permissions'
import { supabase } from '@/lib/supabase'
import { useOrg } from './workspace-provider'

export interface MemberOption {
  user_id: string
  name: string
  role: Role
}

/** Active staff of the current organization (for assignee / caretaker pickers). */
export function useMemberOptions(roles?: Role[]) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['member-options', orgId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MemberOption[]> => {
      const { data, error } = await supabase
        .from('organization_members')
        .select('user_id, role, profile:profiles(full_name, email)')
        .eq('organization_id', orgId)
        .eq('status', 'active')
      if (error) throw error
      return data
        .map((m) => ({ user_id: m.user_id, role: m.role, name: m.profile?.full_name || m.profile?.email || 'Staff member' }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    select: (list) => (roles ? list.filter((m) => roles.includes(m.role)) : list),
  })
}
