import { AlertTriangle, Package, Plus } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ListSkeleton, QueryState } from '@/components/feedback/states'
import { SearchInput } from '@/components/forms/search-input'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { Checkbox, Label } from '@/components/ui/primitives'
import { usePropertyOptions } from '@/features/properties/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useUrlFilters } from '@/hooks/use-url-state'
import { INVENTORY_CATEGORY } from '@/lib/labels'
import { useInventory } from './api'
import { ItemDialog } from './inventory-dialogs'
import { InventoryRows } from './inventory-table'

const FILTERS = ['q', 'property', 'category', 'low', 'inactive'] as const

export function InventoryPage() {
  const { can } = useOrg()
  const { values, set, active, clear } = useUrlFilters(FILTERS)
  const properties = usePropertyOptions()
  const items = useInventory({
    search: values.q,
    property: values.property,
    category: values.category,
    low: values.low === '1',
    includeInactive: values.inactive === '1',
  })
  const lowCount = items.data?.filter((i) => i.is_low_stock).length ?? 0
  const [adding, setAdding] = useState(false)

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Supplies per property or in a shared store. Every change is recorded as a stock movement."
        actions={
          can('inventory.manage') && (
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add item
            </Button>
          )
        }
      />
      {lowCount > 0 && values.low !== '1' && (
        <button
          type="button"
          onClick={() => set({ low: '1' })}
          className="mb-4 flex w-full items-center gap-2 rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-left text-sm text-danger"
        >
          <AlertTriangle className="size-4" aria-hidden /> {lowCount} item{lowCount === 1 ? ' is' : 's are'} at or below the alert level — show only low stock
        </button>
      )}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={values.q} onChange={(q) => set({ q })} placeholder="Search items" className="sm:max-w-xs sm:flex-1" />
        <NativeSelect aria-label="Location" value={values.property} onChange={(e) => set({ property: e.target.value })} className="sm:w-48">
          <option value="">All locations</option>
          <option value="shared">Shared store</option>
          {properties.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Category" value={values.category} onChange={(e) => set({ category: e.target.value })} className="sm:w-40">
          <option value="">All categories</option>
          {Object.entries(INVENTORY_CATEGORY).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </NativeSelect>
        <div className="flex items-center gap-2">
          <Checkbox id="low-only" checked={values.low === '1'} onCheckedChange={(c) => set({ low: c === true ? '1' : '' })} />
          <Label htmlFor="low-only" className="font-normal">
            Low stock only
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="inactive" checked={values.inactive === '1'} onCheckedChange={(c) => set({ inactive: c === true ? '1' : '' })} />
          <Label htmlFor="inactive" className="font-normal">
            Show inactive
          </Label>
        </div>
      </div>
      <QueryState
        query={items}
        loading={<ListSkeleton />}
        empty={
          <EmptyState
            icon={Package}
            title={active ? 'No items match' : 'No stock items yet'}
            description={active ? undefined : 'Track toiletries, cleaning supplies, linen and drinking water.'}
            action={active ? <Button variant="outline" onClick={clear}>Clear filters</Button> : undefined}
          />
        }
      >
        {(rows) => <InventoryRows items={rows} />}
      </QueryState>
      {adding && <ItemDialog open onOpenChange={setAdding} propertyId={values.property && values.property !== 'shared' ? values.property : undefined} />}
    </>
  )
}
