import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pageRange } from '@/components/tables/pagination'
import { useOrg } from '@/features/workspace/workspace-provider'
import { supabase } from '@/lib/supabase'
import { formToGuest, type GuestFormValues } from '@/schemas/guest'
import type { Database } from '@/types/database'

export type Guest = Database['public']['Tables']['guests']['Row']

export const guestKeys = {
  all: (orgId: string) => ['guests', orgId] as const,
  list: (orgId: string, f: object) => ['guests', orgId, 'list', f] as const,
  search: (orgId: string, term: string) => ['guests', orgId, 'search', term] as const,
  detail: (id: string) => ['guest', id] as const,
}

/** Builds a PostgREST `or` filter over name/email/phone; phone matches on digits. */
function guestSearchFilter(term: string): string {
  const s = term.replace(/[%,()]/g, ' ').trim()
  const digits = s.replace(/\D/g, '').replace(/^0/, '')
  const parts = [`full_name.ilike.%${s}%`, `email.ilike.%${s}%`]
  if (digits.length >= 3) parts.push(`phone.ilike.%${digits}%`)
  return parts.join(',')
}

export function useGuests(f: { search: string; page: number }) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: guestKeys.list(orgId, f),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase
        .from('guests')
        .select('*, bookings(id, check_in_date, status)', { count: 'exact' })
        .eq('organization_id', orgId)
        .order('full_name')
      if (f.search) q = q.or(guestSearchFilter(f.search))
      const [from, to] = pageRange(f.page)
      const { data, error, count } = await q.range(from, to)
      if (error) throw error
      return { rows: data, total: count ?? 0 }
    },
  })
}

export function useGuestSearch(term: string) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: guestKeys.search(orgId, term),
    enabled: term.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('guests')
        .select('id, full_name, phone, email, country')
        .eq('organization_id', orgId)
        .is('anonymized_at', null)
        .or(guestSearchFilter(term))
        .order('full_name')
        .limit(8)
      if (error) throw error
      return data
    },
  })
}

export function useGuest(id: string | undefined) {
  return useQuery({
    queryKey: guestKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('guests').select('*').eq('id', id!).single()
      if (error) throw error
      return data
    },
  })
}

export function useSaveGuest() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: GuestFormValues }) => {
      const row = formToGuest(values)
      if (id) {
        const { error } = await supabase.from('guests').update(row).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase.from('guests').insert({ ...row, organization_id: orgId }).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: guestKeys.all(orgId) })
      void qc.invalidateQueries({ queryKey: guestKeys.detail(id) })
    },
  })
}

export function useAnonymizeGuest() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('anonymize_guest', { target: id })
      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: guestKeys.all(orgId) })
      void qc.invalidateQueries({ queryKey: guestKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}
