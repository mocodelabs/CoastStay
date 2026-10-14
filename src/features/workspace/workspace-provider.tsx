import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type * as React from 'react'
import { useAuth } from '@/features/auth/auth-provider'
import { permissionsFor, type Permission, type Role } from '@/lib/permissions'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export type Organization = Tables<'organizations'>
export type OrganizationSettings = Tables<'organization_settings'>

export interface Membership {
  id: string
  role: Role
  can_view_finances: boolean
  organization: Organization
}

interface WorkspaceState {
  memberships: Membership[]
  membership: Membership | null
  org: Organization | null
  settings: OrganizationSettings | null
  role: Role | null
  can: (perm: Permission) => boolean
  canAny: (...perms: Permission[]) => boolean
  switchOrg: (orgId: string) => void
  loading: boolean
  error: unknown
  refetch: () => Promise<unknown>
}

const STORAGE_KEY = 'coaststay.currentOrg'
const WorkspaceContext = createContext<WorkspaceState | null>(null)

export const workspaceKeys = {
  memberships: (userId: string) => ['memberships', userId] as const,
  settings: (orgId: string) => ['org-settings', orgId] as const,
}

function readStoredOrg(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(readStoredOrg)

  const membershipsQuery = useQuery({
    queryKey: workspaceKeys.memberships(user?.id ?? 'anon'),
    enabled: Boolean(user),
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from('organization_members')
        .select('id, role, can_view_finances, organization:organizations(*)')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .order('created_at')
      if (error) throw error
      return (data ?? [])
        .filter((m) => m.organization)
        .map((m) => ({ id: m.id, role: m.role, can_view_finances: m.can_view_finances, organization: m.organization! }))
    },
  })

  const memberships = useMemo(() => membershipsQuery.data ?? [], [membershipsQuery.data])
  const membership = memberships.find((m) => m.organization.id === currentOrgId) ?? memberships[0] ?? null
  const orgId = membership?.organization.id ?? null

  const settingsQuery = useQuery({
    queryKey: workspaceKeys.settings(orgId ?? 'none'),
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase.from('organization_settings').select('*').eq('organization_id', orgId!).single()
      if (error) throw error
      return data
    },
  })

  const perms = useMemo(
    () => (membership ? permissionsFor(membership.role, membership.can_view_finances) : new Set<Permission>()),
    [membership],
  )

  const switchOrg = useCallback((id: string) => {
    setCurrentOrgId(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* storage unavailable — selection lasts for this session only */
    }
  }, [])

  const value = useMemo<WorkspaceState>(
    () => ({
      memberships,
      membership,
      org: membership?.organization ?? null,
      settings: settingsQuery.data ?? null,
      role: membership?.role ?? null,
      can: (p) => perms.has(p),
      canAny: (...ps) => ps.some((p) => perms.has(p)),
      switchOrg,
      loading: membershipsQuery.isPending || (Boolean(orgId) && settingsQuery.isPending),
      error: membershipsQuery.error ?? settingsQuery.error,
      // invalidate (not refetch) so disabled queries — e.g. settings before an org exists — stay idle
      refetch: () =>
        Promise.all([
          membershipsQuery.refetch(),
          queryClient.invalidateQueries({ queryKey: ['org-settings'] }),
        ]),
    }),
    [memberships, membership, settingsQuery, perms, switchOrg, membershipsQuery, orgId, queryClient],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}

/** For screens that render only inside an organization (guaranteed by <RequireOrg>). */
export function useOrg() {
  const ws = useWorkspace()
  if (!ws.org || !ws.role) throw new Error('useOrg used outside an organization')
  return { ...ws, org: ws.org, role: ws.role, orgId: ws.org.id, currency: ws.org.currency, timezone: ws.org.timezone }
}
