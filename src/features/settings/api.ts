import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-provider'
import { useOrg, workspaceKeys } from '@/features/workspace/workspace-provider'
import { normalizePhone } from '@/lib/phone'
import type { Role } from '@/lib/permissions'
import { supabase } from '@/lib/supabase'
import type { BookingDefaultsValues, BusinessValues, InviteValues, ProfileValues } from '@/schemas/settings'

export const settingsKeys = {
  staff: (orgId: string) => ['staff', orgId] as const,
  invitations: (orgId: string) => ['invitations', orgId] as const,
  propertyOptions: (orgId: string) => ['property-options', orgId] as const,
  profile: (userId: string) => ['profile', userId] as const,
}

function e164OrNull(v: string | undefined): string | null {
  if (!v) return null
  const r = normalizePhone(v)
  return r.ok ? r.e164 : null
}

export function useUpdateBusiness() {
  const { orgId } = useOrg()
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: BusinessValues) => {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: v.name,
          contact_email: v.contact_email || null,
          contact_phone: e164OrNull(v.contact_phone),
          address: v.address || null,
          currency: v.currency,
          timezone: v.timezone,
        })
        .eq('id', orgId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.memberships(user!.id) }),
  })
}

export function useUploadLogo() {
  const { orgId } = useOrg()
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File | null) => {
      let url: string | null = null
      if (file) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
          throw new Error('Use a PNG, JPG, WebP or SVG image.')
        }
        if (file.size > 2 * 1024 * 1024) throw new Error('The logo must be 2 MB or smaller.')
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
        const path = `${orgId}/logo-${Date.now()}.${ext}`
        const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: false, contentType: file.type })
        if (error) throw error
        url = supabase.storage.from('branding').getPublicUrl(path).data.publicUrl
      }
      const { error } = await supabase.from('organizations').update({ logo_url: url }).eq('id', orgId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.memberships(user!.id) }),
  })
}

export function useUpdateBookingDefaults() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: BookingDefaultsValues) => {
      const { error } = await supabase
        .from('organization_settings')
        .update({ ...v, default_deposit_percent: v.default_deposit_percent })
        .eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.settings(orgId) }),
  })
}

export interface StaffMember {
  id: string
  user_id: string
  role: Role
  status: 'active' | 'suspended'
  can_view_finances: boolean
  created_at: string
  profile: { full_name: string; email: string | null; phone: string | null } | null
  property_ids: string[]
}

export function useStaff() {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: settingsKeys.staff(orgId),
    queryFn: async (): Promise<StaffMember[]> => {
      const [members, assignments] = await Promise.all([
        supabase
          .from('organization_members')
          .select('id, user_id, role, status, can_view_finances, created_at, profile:profiles(full_name, email, phone)')
          .eq('organization_id', orgId)
          .order('created_at'),
        supabase.from('staff_property_assignments').select('user_id, property_id').eq('organization_id', orgId),
      ])
      if (members.error) throw members.error
      if (assignments.error) throw assignments.error
      return members.data.map((m) => ({
        ...m,
        property_ids: assignments.data.filter((a) => a.user_id === m.user_id).map((a) => a.property_id),
      }))
    },
  })
}

export function usePropertyOptions() {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: settingsKeys.propertyOptions(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, name, status')
        .eq('organization_id', orgId)
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useUpdateMember() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; role?: Role; status?: 'active' | 'suspended'; can_view_finances?: boolean }) => {
      const { id, ...patch } = v
      if (patch.role && patch.role !== 'manager') patch.can_view_finances = false
      const { error } = await supabase.from('organization_members').update(patch).eq('id', id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.staff(orgId) }),
  })
}

export function useRemoveMember() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('organization_members').delete().eq('id', id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.staff(orgId) }),
  })
}

/** Replaces a staff member's property assignments with `propertyIds`. */
export function useSetAssignments() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, current, next }: { userId: string; current: string[]; next: string[] }) => {
      const toAdd = next.filter((p) => !current.includes(p))
      const toRemove = current.filter((p) => !next.includes(p))
      if (toAdd.length) {
        const { error } = await supabase
          .from('staff_property_assignments')
          .insert(toAdd.map((property_id) => ({ organization_id: orgId, property_id, user_id: userId })))
        if (error) throw error
      }
      if (toRemove.length) {
        const { error } = await supabase
          .from('staff_property_assignments')
          .delete()
          .eq('organization_id', orgId)
          .eq('user_id', userId)
          .in('property_id', toRemove)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.staff(orgId) }),
  })
}

export function useInvitations() {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: settingsKeys.invitations(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_invitations')
        .select('id, email, full_name, role, can_view_finances, property_ids, expires_at, accepted_at, revoked_at, created_at')
        .eq('organization_id', orgId)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreateInvitation() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: InviteValues) => {
      const { data, error } = await supabase.rpc('create_invitation', {
        org: orgId,
        invite_email: v.email,
        invite_role: v.role,
        invite_full_name: v.full_name || undefined,
        invite_can_view_finances: v.can_view_finances,
        invite_property_ids: v.property_ids,
      })
      if (error) throw error
      const row = data?.[0]
      if (!row) throw new Error('The invitation could not be created.')
      return row
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.invitations(orgId) }),
  })
}

export function useRevokeInvitation() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('organization_invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.invitations(orgId) }),
  })
}

export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: settingsKeys.profile(user?.id ?? 'anon'),
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateProfile() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: ProfileValues) => {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: v.full_name, phone: e164OrNull(v.phone) })
        .eq('id', user!.id)
      if (error) throw error
      await supabase.auth.updateUser({ data: { full_name: v.full_name } })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKeys.profile(user!.id) })
      void qc.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}
