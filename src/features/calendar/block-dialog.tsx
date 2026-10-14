import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { useCreateBlock, useUnitConflicts } from '@/features/bookings/api'
import { usePropertyOptions } from '@/features/properties/api'
import { formatDate } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { blockSchema, type BlockFormValues } from '@/schemas/booking'

export function BlockDialog({
  open,
  onOpenChange,
  initial,
  maintenanceRequestId,
  title = 'Block dates',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: Partial<BlockFormValues>
  maintenanceRequestId?: string
  title?: string
}) {
  const properties = usePropertyOptions()
  const create = useCreateBlock()
  const form = useForm<BlockFormValues>({
    resolver: zodResolver(blockSchema),
    values: { property_id: '', unit_id: '', start_date: '', end_date: '', reason: 'owner_use', notes: '', ...initial },
  })
  const v = useWatch({ control: form.control }) as BlockFormValues
  const property = properties.data?.find((p) => p.id === v.property_id)
  const conflicts = useUnitConflicts(v.unit_id, v.start_date, v.end_date)
  const { errors } = form.formState
  const clash = (conflicts.data?.length ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Blocked dates can’t be booked. Use for maintenance, owner stays or closures.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => {
            if (clash) return
            create.mutate(
              { values, maintenanceRequestId },
              {
                onSuccess: () => {
                  toast.success('Dates blocked.')
                  onOpenChange(false)
                },
              },
            )
          })}
        >
          <FormError message={create.isError ? toUserMessage(create.error) : null} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Property" error={errors.property_id?.message} required>
              <NativeSelect
                {...form.register('property_id', {
                  onChange: (e) => {
                    const p = properties.data?.find((x) => x.id === e.target.value)
                    form.setValue('unit_id', p?.units.find((u) => u.status === 'active')?.id ?? '')
                  },
                })}
              >
                <option value="">Choose…</option>
                {properties.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Unit" error={errors.unit_id?.message} required>
              <NativeSelect {...form.register('unit_id')} disabled={!property}>
                <option value="">Choose…</option>
                {property?.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="First blocked night" error={errors.start_date?.message} required>
              <Input type="date" {...form.register('start_date')} />
            </Field>
            <Field label="Available again on" error={errors.end_date?.message} required>
              <Input type="date" min={v.start_date || undefined} {...form.register('end_date')} />
            </Field>
            <Field label="Reason" error={errors.reason?.message} className="sm:col-span-2">
              <NativeSelect {...form.register('reason')}>
                <option value="owner_use">Owner use</option>
                <option value="maintenance">Maintenance</option>
                <option value="other">Other</option>
              </NativeSelect>
            </Field>
            <Field label="Notes" error={errors.notes?.message} className="sm:col-span-2">
              <Textarea rows={2} {...form.register('notes')} />
            </Field>
          </div>
          {clash && (
            <div className="rounded-md bg-danger-soft p-3 text-sm text-danger" role="alert">
              These dates overlap:
              <ul className="mt-1 list-disc pl-5">
                {conflicts.data!.map((c, i) => (
                  <li key={i}>
                    {c.label} ({formatDate(c.start_date)} → {formatDate(c.end_date)})
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending} disabled={clash}>
              Block dates
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
