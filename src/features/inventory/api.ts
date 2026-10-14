import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '@/features/workspace/workspace-provider'
import type { MovementType } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type InventoryItem = Database['public']['Tables']['inventory_items']['Row'] & { property?: { name: string } | null }
export type Movement = Database['public']['Tables']['inventory_movements']['Row']

export const invKeys = {
  all: (orgId: string) => ['inventory', orgId] as const,
  list: (orgId: string, f: object) => ['inventory', orgId, 'list', f] as const,
  movements: (itemId: string) => ['inventory', 'movements', itemId] as const,
}

export function useInventory(f: { property?: string; category?: string; low?: boolean; search?: string; includeInactive?: boolean }) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: invKeys.list(orgId, f),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase.from('inventory_items').select('*, property:properties(name)').eq('organization_id', orgId)
      if (f.property === 'shared') q = q.is('property_id', null)
      else if (f.property) q = q.eq('property_id', f.property)
      if (f.category) q = q.eq('category', f.category)
      if (f.low) q = q.eq('is_low_stock', true)
      if (!f.includeInactive) q = q.eq('is_active', true)
      if (f.search) q = q.ilike('name', `%${f.search.replace(/[%_]/g, '')}%`)
      const { data, error } = await q.order('is_low_stock', { ascending: false }).order('name').limit(500)
      if (error) throw error
      return data as InventoryItem[]
    },
  })
}

export function useMovements(itemId: string | undefined) {
  return useQuery({
    queryKey: invKeys.movements(itemId ?? ''),
    enabled: Boolean(itemId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*, actor:profiles(full_name)')
        .eq('inventory_item_id', itemId!)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data
    },
  })
}

function useInvalidate() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return (itemId?: string) => {
    void qc.invalidateQueries({ queryKey: invKeys.all(orgId) })
    if (itemId) void qc.invalidateQueries({ queryKey: invKeys.movements(itemId) })
  }
}

export interface ItemInput {
  property_id: string | null
  name: string
  category: string
  unit_of_measure: string
  minimum_quantity: number
  unit_cost: number | null
  is_active?: boolean
}

export function useSaveItem() {
  const { orgId } = useOrg()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, input, openingStock }: { id?: string; input: ItemInput; openingStock?: number }) => {
      if (id) {
        const { property_id: _ignored, ...patch } = input
        void _ignored
        const { error } = await supabase.from('inventory_items').update(patch).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase.from('inventory_items').insert({ ...input, organization_id: orgId }).select('id').single()
      if (error) throw error
      if (openingStock && openingStock > 0) {
        const r = await supabase.from('inventory_movements').insert({
          organization_id: orgId,
          inventory_item_id: data.id,
          movement_type: 'receipt',
          quantity: openingStock,
          unit_cost: input.unit_cost,
          reference: 'Opening stock',
        })
        if (r.error) throw r.error
      }
      return data.id
    },
    onSuccess: (id) => invalidate(id),
  })
}

export function useRecordMovement(itemId: string) {
  const { orgId } = useOrg()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: {
      movement_type: MovementType
      quantity: number
      unit_cost?: number | null
      reference?: string | null
      notes?: string | null
      requestId: string
    }) => {
      const { error } = await supabase.from('inventory_movements').upsert(
        {
          organization_id: orgId,
          inventory_item_id: itemId,
          movement_type: v.movement_type,
          quantity: v.quantity,
          unit_cost: v.unit_cost ?? null,
          reference: v.reference ?? null,
          notes: v.notes ?? null,
          client_request_id: v.requestId,
        },
        { onConflict: 'organization_id,client_request_id', ignoreDuplicates: true },
      )
      if (error) throw error
    },
    onSuccess: () => invalidate(itemId),
  })
}
