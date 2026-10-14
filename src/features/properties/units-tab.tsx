import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, MoreVertical, Pencil, Plus, Power } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Field, FormError } from '@/components/forms/field'
import { Money } from '@/components/money'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/menu'
import { Badge, Card } from '@/components/ui/primitives'
import { toUserMessage } from '@/lib/errors'
import { unitSchema, unitToForm, type UnitFormValues } from '@/schemas/property'
import { useSaveUnit, type PropertyDetail, type Unit } from './api'

function UnitDialog({
  property,
  unit,
  open,
  onOpenChange,
}: {
  property: PropertyDetail
  unit: Unit | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const save = useSaveUnit(property.id)
  const form = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
    values: unit ? unitToForm(unit) : { name: '', max_guests: '', nightly_rate_override: '' },
  })
  const { errors } = form.formState
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{unit ? 'Edit unit' : 'Add a rentable unit'}</DialogTitle>
          <DialogDescription>Units are booked independently, e.g. separate cottages or rooms.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((values) =>
            save.mutate(
              { id: unit?.id, values },
              {
                onSuccess: () => {
                  toast.success(unit ? 'Unit saved.' : 'Unit added.')
                  onOpenChange(false)
                },
              },
            ),
          )}
        >
          <FormError message={save.isError ? toUserMessage(save.error) : null} />
          <Field label="Unit name" error={errors.name?.message} required>
            <Input placeholder="e.g. Garden Cottage, Room 2" {...form.register('name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Maximum guests" hint={`Empty = property maximum (${property.max_guests})`} error={errors.max_guests?.message}>
              <Input type="number" inputMode="numeric" min={1} {...form.register('max_guests')} />
            </Field>
            <Field label="Nightly rate (KES)" hint="Empty = property standard rate" error={errors.nightly_rate_override?.message}>
              <Input inputMode="decimal" {...form.register('nightly_rate_override')} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {unit ? 'Save unit' : 'Add unit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UnitsTab({ property, editable }: { property: PropertyDetail; editable: boolean }) {
  const save = useSaveUnit(property.id)
  const [editing, setEditing] = useState<Unit | null>(null)
  const [open, setOpen] = useState(false)
  const activeUnits = property.units.filter((u) => u.status === 'active')
  const defaultActive = activeUnits.some((u) => u.is_default)
  const showOverlapWarning = defaultActive && activeUnits.length > 1

  return (
    <div className="space-y-4">
      {showOverlapWarning && (
        <div className="flex gap-3 rounded-lg border border-warning/20 bg-warning-soft p-3 text-sm text-warning" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            “Entire property” and individual units are both bookable. If the units are parts of the same home, booking the whole
            property and a unit for the same night would double-book. Deactivate whichever option you don’t rent out.
          </p>
        </div>
      )}
      <Card className="divide-y">
        {property.units.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                {u.name}
                {u.is_default && <Badge tone="muted">Default</Badge>}
                {u.status === 'inactive' && <Badge tone="danger">Inactive</Badge>}
              </p>
              <p className="text-sm text-muted-foreground">
                Sleeps {u.max_guests ?? property.max_guests} ·{' '}
                <Money value={u.nightly_rate_override ?? property.standard_nightly_rate} compact /> / night
                {u.nightly_rate_override === null && ' (standard rate)'}
              </p>
            </div>
            {editable && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}>
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditing(u)
                      setOpen(true)
                    }}
                  >
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      save.mutate(
                        { id: u.id, status: u.status === 'active' ? 'inactive' : 'active' },
                        {
                          onSuccess: () => toast.success(u.status === 'active' ? 'Unit deactivated — existing bookings are kept.' : 'Unit reactivated.'),
                          onError: (e) => toast.error(toUserMessage(e)),
                        },
                      )
                    }
                  >
                    <Power /> {u.status === 'active' ? 'Deactivate' : 'Reactivate'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </Card>
      {editable && (
        <Button
          variant="outline"
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
        >
          <Plus /> Add unit
        </Button>
      )}
      <UnitDialog property={property} unit={editing} open={open} onOpenChange={setOpen} />
    </div>
  )
}
