import { zodResolver } from '@hookform/resolvers/zod'
import { Paperclip, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { usePropertyOptions } from '@/features/properties/api'
import { useMemberOptions } from '@/features/workspace/members'
import { useOrg } from '@/features/workspace/workspace-provider'
import { centsToDecimal, toCents } from '@/lib/currency'
import { toUserMessage } from '@/lib/errors'
import { MAINTENANCE_CATEGORY, PRIORITIES, PRIORITY } from '@/lib/labels'
import { formatPhone } from '@/lib/phone'
import { validateFile } from '@/lib/storage'
import { optionalIsoDate, optionalMoney, orNull, phoneField, phoneOrNull } from '@/schemas/common'
import { useCreateMaintenance, useUpdateMaintenance, type MaintenanceDetail } from './api'

const schema = z.object({
  property_id: z.string().min(1, 'Choose a property.'),
  unit_id: z.string(),
  title: z.string().trim().min(2, 'Describe the problem briefly.').max(160),
  description: z.string().trim().max(5000),
  category: z.string().min(1),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  assigned_to: z.string(),
  technician_name: z.string().trim().max(120),
  technician_phone: phoneField,
  estimated_cost: optionalMoney,
  target_date: optionalIsoDate,
})
type Values = z.infer<typeof schema>

export function MaintenanceDialog({
  open,
  onOpenChange,
  request,
  propertyId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  request?: MaintenanceDetail | null
  propertyId?: string
}) {
  const navigate = useNavigate()
  const { can, currency } = useOrg()
  const manager = can('maintenance.manage')
  const properties = usePropertyOptions()
  const staff = useMemberOptions()
  const create = useCreateMaintenance()
  const update = useUpdateMaintenance(request?.id ?? '')
  const [files, setFiles] = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const single = properties.data?.length === 1 ? properties.data[0] : undefined
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: request
      ? {
          property_id: request.property_id,
          unit_id: request.unit_id ?? '',
          title: request.title,
          description: request.description ?? '',
          category: request.category,
          priority: request.priority,
          assigned_to: request.assigned_to ?? '',
          technician_name: request.technician_name ?? '',
          technician_phone: request.technician_phone ? formatPhone(request.technician_phone) : '',
          estimated_cost: request.estimated_cost === null ? '' : centsToDecimal(toCents(request.estimated_cost)),
          target_date: request.target_date ?? '',
        }
      : {
          property_id: propertyId ?? single?.id ?? '',
          unit_id: '',
          title: '',
          description: '',
          category: 'general',
          priority: 'normal',
          assigned_to: '',
          technician_name: '',
          technician_phone: '',
          estimated_cost: '',
          target_date: '',
        },
  })
  const v = useWatch({ control: form.control }) as Values
  const property = properties.data?.find((p) => p.id === v.property_id)
  const { errors } = form.formState
  const saving = create.isPending || update.isPending
  const mutationError = create.error ?? update.error

  function submit(values: Values) {
    const input = {
      property_id: values.property_id,
      unit_id: orNull(values.unit_id),
      title: values.title,
      description: orNull(values.description),
      category: values.category,
      priority: values.priority,
      ...(manager && {
        assigned_to: orNull(values.assigned_to),
        technician_name: orNull(values.technician_name),
        technician_phone: phoneOrNull(values.technician_phone),
        estimated_cost: values.estimated_cost ? Number(values.estimated_cost) : null,
        target_date: orNull(values.target_date),
      }),
    }
    if (request) {
      update.mutate(input, {
        onSuccess: () => {
          toast.success('Request updated.')
          onOpenChange(false)
        },
      })
    } else {
      create.mutate(
        { input, files },
        {
          onSuccess: ({ id, failures }) => {
            failures.forEach((f) => toast.error(f))
            toast.success('Maintenance request reported.')
            onOpenChange(false)
            navigate(`/maintenance/${id}`)
          },
        },
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{request ? 'Edit request' : 'Report a maintenance issue'}</DialogTitle>
          {!manager && <DialogDescription>A manager will review, assign and schedule the repair.</DialogDescription>}
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <FormError message={mutationError ? toUserMessage(mutationError) : null} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Property" error={errors.property_id?.message} required>
              <NativeSelect {...form.register('property_id', { onChange: () => form.setValue('unit_id', '') })} disabled={Boolean(request)}>
                <option value="">Choose…</option>
                {properties.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Unit" error={errors.unit_id?.message}>
              <NativeSelect {...form.register('unit_id')} disabled={!property || (property.units.length ?? 0) <= 1}>
                <option value="">Whole property</option>
                {property?.units
                  .filter((u) => !u.is_default)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Problem" error={errors.title?.message} required className="sm:col-span-2">
              <Input placeholder="e.g. AC leaking in master bedroom" {...form.register('title')} />
            </Field>
            <Field label="Category" error={errors.category?.message}>
              <NativeSelect {...form.register('category')}>
                {Object.entries(MAINTENANCE_CATEGORY).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Priority" error={errors.priority?.message}>
              <NativeSelect {...form.register('priority')}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY[p].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Details" error={errors.description?.message} className="sm:col-span-2">
              <Textarea rows={3} {...form.register('description')} />
            </Field>
            {manager && (
              <>
                <Field label="Assign to staff" error={errors.assigned_to?.message}>
                  <NativeSelect {...form.register('assigned_to')}>
                    <option value="">No one</option>
                    {staff.data?.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Target date" error={errors.target_date?.message}>
                  <Input type="date" {...form.register('target_date')} />
                </Field>
                <Field label="Technician" error={errors.technician_name?.message}>
                  <Input placeholder="External fundi / company" {...form.register('technician_name')} />
                </Field>
                <Field label="Technician phone" error={errors.technician_phone?.message}>
                  <Input type="tel" inputMode="tel" {...form.register('technician_phone')} />
                </Field>
                <Field label={`Estimated cost (${currency})`} error={errors.estimated_cost?.message}>
                  <Input inputMode="decimal" {...form.register('estimated_cost')} />
                </Field>
              </>
            )}
          </div>
          {!request && (
            <div className="space-y-1.5">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  const ok = picked.filter((f) => {
                    const err = validateFile('maintenance-attachments', f)
                    if (err) toast.error(`${f.name}: ${err}`)
                    return !err
                  })
                  setFiles((prev) => [...prev, ...ok].slice(0, 8))
                }}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Paperclip /> Add photos
              </Button>
              {files.length > 0 && (
                <ul className="flex flex-wrap gap-2 text-xs">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-1 rounded bg-sand-100 px-2 py-1">
                      {f.name}
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {request ? 'Save changes' : 'Report issue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
