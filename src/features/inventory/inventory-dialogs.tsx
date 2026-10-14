import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ListSkeleton, QueryState } from '@/components/feedback/states'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Checkbox, Label } from '@/components/ui/primitives'
import { usePropertyOptions } from '@/features/properties/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useRequestId } from '@/hooks/use-url-state'
import { centsToDecimal, toCents } from '@/lib/currency'
import { formatDateTime } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { INVENTORY_CATEGORY, MOVEMENT_TYPE, type MovementType } from '@/lib/labels'
import { FULL_SCOPE_ROLES } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { optionalMoney } from '@/schemas/common'
import { useMovements, useRecordMovement, useSaveItem, type InventoryItem } from './api'

const qty = (label: string, allowZero = false) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d{1,8}(\.\d{1,2})?$/.test(v) && (allowZero || Number(v) > 0), { message: `${label} must be a positive number.` })

const itemSchema = z.object({
  property_id: z.string(),
  name: z.string().trim().min(2, 'Enter the item name.').max(120),
  category: z.string(),
  unit_of_measure: z.string().trim().min(1, 'e.g. pcs, rolls, litres').max(20),
  minimum_quantity: qty('Minimum', true),
  unit_cost: optionalMoney,
  opening_stock: z.string().trim().refine((v) => v === '' || /^\d{1,8}(\.\d{1,2})?$/.test(v), 'Enter a number.'),
  is_active: z.boolean(),
})
type ItemValues = z.infer<typeof itemSchema>

export function ItemDialog({ open, onOpenChange, item, propertyId }: { open: boolean; onOpenChange: (o: boolean) => void; item?: InventoryItem | null; propertyId?: string }) {
  const { role, currency } = useOrg()
  const properties = usePropertyOptions()
  const save = useSaveItem()
  const canShared = FULL_SCOPE_ROLES.includes(role)
  const form = useForm<ItemValues>({
    resolver: zodResolver(itemSchema),
    values: item
      ? {
          property_id: item.property_id ?? '',
          name: item.name,
          category: item.category,
          unit_of_measure: item.unit_of_measure,
          minimum_quantity: String(item.minimum_quantity),
          unit_cost: item.unit_cost === null ? '' : centsToDecimal(toCents(item.unit_cost)),
          opening_stock: '',
          is_active: item.is_active,
        }
      : {
          property_id: propertyId ?? (canShared ? '' : (properties.data?.[0]?.id ?? '')),
          name: '',
          category: 'toiletries',
          unit_of_measure: 'pcs',
          minimum_quantity: '0',
          unit_cost: '',
          opening_stock: '',
          is_active: true,
        },
  })
  const active = useWatch({ control: form.control, name: 'is_active' })
  const { errors } = form.formState
  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Edit item' : 'Add stock item'}</DialogTitle>
          <DialogDescription>Stock levels change only through recorded movements.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((v) =>
            save.mutate(
              {
                id: item?.id,
                input: {
                  property_id: v.property_id || null,
                  name: v.name,
                  category: v.category,
                  unit_of_measure: v.unit_of_measure,
                  minimum_quantity: Number(v.minimum_quantity),
                  unit_cost: v.unit_cost ? Number(v.unit_cost) : null,
                  is_active: v.is_active,
                },
                openingStock: v.opening_stock ? Number(v.opening_stock) : undefined,
              },
              {
                onSuccess: () => {
                  toast.success(item ? 'Item saved.' : 'Item added.')
                  onOpenChange(false)
                },
              },
            ),
          )}
        >
          <FormError message={save.isError ? toUserMessage(save.error) : null} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Item" error={errors.name?.message} required className="sm:col-span-2">
              <Input placeholder="e.g. Toilet rolls, bath soap, drinking water 20L" {...form.register('name')} />
            </Field>
            <Field label="Location" hint={item ? 'Use transfers to move stock.' : undefined} error={errors.property_id?.message}>
              <NativeSelect {...form.register('property_id')} disabled={Boolean(item)}>
                {canShared && <option value="">Shared store</option>}
                {properties.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Category" error={errors.category?.message}>
              <NativeSelect {...form.register('category')}>
                {Object.entries(INVENTORY_CATEGORY).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Unit of measure" error={errors.unit_of_measure?.message} required>
              <Input {...form.register('unit_of_measure')} />
            </Field>
            <Field label="Low-stock alert at" hint="Alert when stock falls to this level (0 = no alert)." error={errors.minimum_quantity?.message}>
              <Input inputMode="decimal" {...form.register('minimum_quantity')} />
            </Field>
            <Field label={`Unit cost (${currency})`} error={errors.unit_cost?.message}>
              <Input inputMode="decimal" {...form.register('unit_cost')} />
            </Field>
            {!item && (
              <Field label="Opening stock" hint="Recorded as a stock receipt." error={errors.opening_stock?.message}>
                <Input inputMode="decimal" {...form.register('opening_stock')} />
              </Field>
            )}
          </div>
          {item && (
            <div className="flex items-center gap-2.5">
              <Checkbox id="item-active" checked={active} onCheckedChange={(c) => form.setValue('is_active', c === true, { shouldDirty: true })} />
              <Label htmlFor="item-active" className="font-normal">
                Active (inactive items are hidden from the list)
              </Label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {item ? 'Save item' : 'Add item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function MovementDialog({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const { can, currency } = useOrg()
  const record = useRecordMovement(item?.id ?? '')
  const requestId = useRequestId()
  const types = (Object.keys(MOVEMENT_TYPE) as MovementType[]).filter((t) =>
    t === 'consumption' || t === 'return'
      ? can('inventory.consume')
      : t === 'adjustment'
        ? can('inventory.adjust')
        : t === 'receipt'
          ? can('inventory.manage')
          : false,
  )
  const [type, setType] = useState<MovementType>(types.includes('consumption') ? 'consumption' : (types[0] ?? 'consumption'))
  const [direction, setDirection] = useState<1 | -1>(-1)
  const [amount, setAmount] = useState('')
  const [cost, setCost] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const movements = useMovements(item?.id)

  function submit() {
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return setErr('Enter a quantity greater than zero.')
    if (type === 'adjustment' && notes.trim().length < 3) return setErr('Explain the reason for the adjustment.')
    const sign = MOVEMENT_TYPE[type].sign || direction
    record.mutate(
      {
        movement_type: type,
        quantity: sign * Number(amount),
        unit_cost: type === 'receipt' && cost ? Number(cost) : null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        requestId: requestId.get(),
      },
      {
        onSuccess: () => {
          requestId.renew()
          toast.success('Stock updated.')
          setAmount('')
          setNotes('')
          setReference('')
          setErr(null)
        },
        onError: (e) => setErr(toUserMessage(e)),
      },
    )
  }

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && !record.isPending && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle>{item.name}</DialogTitle>
              <DialogDescription>
                On hand: <strong>{item.quantity_on_hand}</strong> {item.unit_of_measure} · {item.property?.name ?? 'Shared store'}
              </DialogDescription>
            </DialogHeader>
            {types.length > 0 && (
              <div className="space-y-3 rounded-lg border bg-sand-50/60 p-3">
                <FormError message={err} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Movement">
                    <NativeSelect value={type} onChange={(e) => setType(e.target.value as MovementType)}>
                      {types.map((t) => (
                        <option key={t} value={t}>
                          {MOVEMENT_TYPE[t].label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label={`Quantity (${item.unit_of_measure})`}>
                    <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </Field>
                  {type === 'adjustment' && (
                    <Field label="Direction">
                      <NativeSelect value={direction} onChange={(e) => setDirection(Number(e.target.value) as 1 | -1)}>
                        <option value={-1}>Remove from stock (loss, damage, count correction)</option>
                        <option value={1}>Add to stock (count correction)</option>
                      </NativeSelect>
                    </Field>
                  )}
                  {type === 'receipt' && (
                    <Field label={`Unit cost (${currency})`}>
                      <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={item.unit_cost?.toString() ?? ''} />
                    </Field>
                  )}
                  <Field label="Reference" hint="e.g. supplier invoice, booking ref">
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
                  </Field>
                  <Field label={type === 'adjustment' ? 'Reason' : 'Notes'} required={type === 'adjustment'} className="sm:col-span-2">
                    <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <Button loading={record.isPending} onClick={submit}>
                    Record movement
                  </Button>
                </div>
              </div>
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold">History</h3>
              <QueryState query={movements} loading={<ListSkeleton rows={2} />} empty={<p className="text-sm text-muted-foreground">No movements yet.</p>}>
                {(rows) => (
                  <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-sm">
                    {rows.map((m) => (
                      <li key={m.id} className="flex items-start justify-between gap-3 p-2.5">
                        <div className="min-w-0">
                          <p className="font-medium">{MOVEMENT_TYPE[m.movement_type].label}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(m.created_at)}
                            {m.actor?.full_name && ` · ${m.actor.full_name}`}
                            {m.reference && ` · ${m.reference}`}
                          </p>
                          {m.notes && <p className="text-xs text-muted-foreground">{m.notes}</p>}
                        </div>
                        <div className="text-right">
                          <p className={cn('tabular font-medium', m.quantity < 0 ? 'text-danger' : 'text-success')}>
                            {m.quantity > 0 ? '+' : ''}
                            {m.quantity}
                          </p>
                          <p className="text-xs text-muted-foreground">→ {m.balance_after}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </QueryState>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
