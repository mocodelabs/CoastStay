import { AlertTriangle, Package, Pencil } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ListSkeleton, QueryState } from '@/components/feedback/states'
import { Money } from '@/components/money'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/primitives'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useOrg } from '@/features/workspace/workspace-provider'
import { INVENTORY_CATEGORY } from '@/lib/labels'
import { useInventory, type InventoryItem } from './api'
import { ItemDialog, MovementDialog } from './inventory-dialogs'

export function InventoryRows({ items, showLocation = true }: { items: InventoryItem[]; showLocation?: boolean }) {
  const { can, currency } = useOrg()
  const [moving, setMoving] = useState<InventoryItem | null>(null)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const costs = can('finance.view') || can('inventory.manage')
  return (
    <>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Item</TH>
              {showLocation && <TH className="hidden md:table-cell">Location</TH>}
              <TH className="text-right">On hand</TH>
              <TH className="hidden text-right sm:table-cell">Alert at</TH>
              {costs && <TH className="hidden text-right lg:table-cell">Value</TH>}
              <TH className="w-28">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {items.map((i) => (
              <TR key={i.id}>
                <TD>
                  <button type="button" className="text-left font-medium hover:underline" onClick={() => setMoving(i)}>
                    {i.name}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {INVENTORY_CATEGORY[i.category] ?? i.category}
                    {!i.is_active && ' · inactive'}
                  </p>
                </TD>
                {showLocation && <TD className="hidden text-sm md:table-cell">{i.property?.name ?? 'Shared store'}</TD>}
                <TD className="text-right">
                  <span className="tabular font-medium">{i.quantity_on_hand}</span> <span className="text-xs text-muted-foreground">{i.unit_of_measure}</span>
                  {i.is_low_stock && (
                    <Badge tone="danger" className="ml-2">
                      <AlertTriangle className="size-3" /> Low
                    </Badge>
                  )}
                </TD>
                <TD className="hidden text-right text-sm text-muted-foreground sm:table-cell">{i.minimum_quantity > 0 ? i.minimum_quantity : '—'}</TD>
                {costs && (
                  <TD className="hidden text-right text-sm lg:table-cell">
                    {i.unit_cost !== null ? <Money value={Math.round(i.unit_cost * i.quantity_on_hand * 100) / 100} currency={currency} compact /> : '—'}
                  </TD>
                )}
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setMoving(i)}>
                      Stock
                    </Button>
                    {can('inventory.manage') && (
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${i.name}`} onClick={() => setEditing(i)}>
                        <Pencil />
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <MovementDialog item={moving ? (items.find((x) => x.id === moving.id) ?? moving) : null} onClose={() => setMoving(null)} />
      {editing && <ItemDialog open item={editing} onOpenChange={(o) => !o && setEditing(null)} />}
    </>
  )
}

/** Property-specific stock (property page tab). */
export function InventoryTable({ propertyId }: { propertyId: string }) {
  const { can } = useOrg()
  const items = useInventory({ property: propertyId })
  const [adding, setAdding] = useState(false)
  return (
    <>
      {can('inventory.manage') && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Package /> Add item
          </Button>
        </div>
      )}
      <QueryState query={items} loading={<ListSkeleton rows={3} />} empty={<EmptyState icon={Package} title="No stock tracked for this property" />}>
        {(rows) => <InventoryRows items={rows} showLocation={false} />}
      </QueryState>
      {adding && <ItemDialog open onOpenChange={setAdding} propertyId={propertyId} />}
    </>
  )
}
