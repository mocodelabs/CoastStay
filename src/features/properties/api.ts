import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pageRange } from '@/components/tables/pagination'
import { useOrg } from '@/features/workspace/workspace-provider'
import { removeFile, uploadFile } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import type { PropertyFormValues, UnitFormValues } from '@/schemas/property'
import { formToProperty } from '@/schemas/property'
import type { Database } from '@/types/database'

export type Property = Database['public']['Tables']['properties']['Row']
export type Unit = Database['public']['Tables']['property_units']['Row']
export type PropertyPhoto = Database['public']['Tables']['property_photos']['Row']

export const propertyKeys = {
  all: (orgId: string) => ['properties', orgId] as const,
  list: (orgId: string, filters: object) => ['properties', orgId, 'list', filters] as const,
  detail: (id: string) => ['property', id] as const,
  options: (orgId: string) => ['properties', orgId, 'options'] as const,
}

export interface PropertyListItem extends Property {
  photos: Pick<PropertyPhoto, 'storage_path' | 'sort_order'>[]
  units: Pick<Unit, 'id' | 'status'>[]
}

export function useProperties(filters: { search: string; status: string; type: string; page: number }) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: propertyKeys.list(orgId, filters),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase
        .from('properties')
        .select('*, photos:property_photos(storage_path, sort_order), units:property_units(id, status)', { count: 'exact' })
        .eq('organization_id', orgId)
        .order('status')
        .order('name')
      if (filters.status) q = q.eq('status', filters.status as Property['status'])
      if (filters.type) q = q.eq('property_type', filters.type as Property['property_type'])
      if (filters.search) {
        const s = filters.search.replace(/[%,()]/g, ' ')
        q = q.or(`name.ilike.%${s}%,location_name.ilike.%${s}%,county.ilike.%${s}%`)
      }
      const [from, to] = pageRange(filters.page, 24)
      const { data, error, count } = await q.range(from, to)
      if (error) throw error
      return { rows: data as PropertyListItem[], total: count ?? 0 }
    },
  })
}

export interface PropertyDetail extends Property {
  units: Unit[]
  photos: PropertyPhoto[]
  caretaker: { full_name: string; phone: string | null } | null
}

export function useProperty(id: string | undefined) {
  return useQuery({
    queryKey: propertyKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<PropertyDetail> => {
      const { data, error } = await supabase
        .from('properties')
        .select('*, units:property_units(*), photos:property_photos(*), caretaker:profiles(full_name, phone)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return {
        ...data,
        units: [...data.units].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)),
        photos: [...data.photos].sort((a, b) => a.sort_order - b.sort_order),
      }
    },
  })
}

export interface PropertyOption {
  id: string
  name: string
  status: Property['status']
  standard_nightly_rate: number
  cleaning_fee: number
  max_guests: number
  units: Pick<Unit, 'id' | 'name' | 'status' | 'is_default' | 'max_guests' | 'nightly_rate_override'>[]
}

/** Properties with their units, for pickers across the app. */
export function usePropertyOptions() {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: propertyKeys.options(orgId),
    staleTime: 60_000,
    queryFn: async (): Promise<PropertyOption[]> => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, name, status, standard_nightly_rate, cleaning_fee, max_guests, units:property_units(id, name, status, is_default, max_guests, nightly_rate_override)')
        .eq('organization_id', orgId)
        .order('name')
      if (error) throw error
      return data.map((p) => ({
        ...p,
        units: [...p.units].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)),
      }))
    },
  })
}

function useInvalidateProperties() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: propertyKeys.all(orgId) })
    if (id) void qc.invalidateQueries({ queryKey: propertyKeys.detail(id) })
    void qc.invalidateQueries({ queryKey: ['setup-status', orgId] })
  }
}

export function useCreateProperty() {
  const { orgId } = useOrg()
  const invalidate = useInvalidateProperties()
  return useMutation({
    mutationFn: async (v: PropertyFormValues) => {
      const { data, error } = await supabase
        .from('properties')
        .insert({ ...formToProperty(v), organization_id: orgId })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => invalidate(),
  })
}

export function useUpdateProperty(id: string) {
  const invalidate = useInvalidateProperties()
  return useMutation({
    mutationFn: async (patch: Partial<ReturnType<typeof formToProperty>> & { status?: Property['status'] }) => {
      const { error } = await supabase.from('properties').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(id),
  })
}

export function useSaveUnit(propertyId: string) {
  const { orgId } = useOrg()
  const invalidate = useInvalidateProperties()
  return useMutation({
    mutationFn: async ({ id, values, status }: { id?: string; values?: UnitFormValues; status?: Unit['status'] }) => {
      const patch = {
        ...(values && {
          name: values.name.trim(),
          max_guests: values.max_guests ? Number(values.max_guests) : null,
          nightly_rate_override: values.nightly_rate_override ? Number(values.nightly_rate_override) : null,
        }),
        ...(status && { status }),
      }
      if (id) {
        const { error } = await supabase.from('property_units').update(patch).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('property_units')
          .insert({ ...patch, name: patch.name ?? 'Unit', organization_id: orgId, property_id: propertyId })
        if (error) throw error
      }
    },
    onSuccess: () => invalidate(propertyId),
  })
}

export function useUploadPhotos(propertyId: string) {
  const { orgId } = useOrg()
  const invalidate = useInvalidateProperties()
  return useMutation({
    mutationFn: async ({ files, startOrder }: { files: File[]; startOrder: number }) => {
      const failures: string[] = []
      let order = startOrder
      for (const file of files) {
        try {
          const path = await uploadFile('property-photos', orgId, propertyId, file)
          const { error } = await supabase
            .from('property_photos')
            .insert({ organization_id: orgId, property_id: propertyId, storage_path: path, sort_order: order++ })
          if (error) {
            await removeFile('property-photos', path).catch(() => undefined)
            throw error
          }
        } catch (e) {
          failures.push(`${file.name}: ${e instanceof Error ? e.message : 'upload failed'}`)
        }
      }
      return failures
    },
    onSettled: () => invalidate(propertyId),
  })
}

export function useDeletePhoto(propertyId: string) {
  const invalidate = useInvalidateProperties()
  return useMutation({
    mutationFn: async (photo: PropertyPhoto) => {
      const { error } = await supabase.from('property_photos').delete().eq('id', photo.id)
      if (error) throw error
      await removeFile('property-photos', photo.storage_path).catch(() => undefined)
    },
    onSuccess: () => invalidate(propertyId),
  })
}

export function useReorderPhotos(propertyId: string) {
  const invalidate = useInvalidateProperties()
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const results = await Promise.all(
        orderedIds.map((id, index) => supabase.from('property_photos').update({ sort_order: index }).eq('id', id)),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSettled: () => invalidate(propertyId),
  })
}

export function useUpdatePhotoCaption(propertyId: string) {
  const invalidate = useInvalidateProperties()
  return useMutation({
    mutationFn: async ({ id, caption }: { id: string; caption: string }) => {
      const { error } = await supabase.from('property_photos').update({ caption: caption.trim() || null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(propertyId),
  })
}
