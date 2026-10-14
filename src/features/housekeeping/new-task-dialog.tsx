import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Checkbox, Label } from '@/components/ui/primitives'
import { usePropertyOptions } from '@/features/properties/api'
import { useMemberOptions } from '@/features/workspace/members'
import { toUserMessage } from '@/lib/errors'
import { PRIORITIES, PRIORITY, TASK_TYPE } from '@/lib/labels'
import { useChecklistTemplates, useCreateTask } from './api'

const TASK_TYPES = ['turnover_clean', 'deep_clean', 'inspection', 'laundry', 'restock', 'other'] as const

const schema = z
  .object({
    property_id: z.string().min(1, 'Choose a property.'),
    unit_id: z.string().min(1, 'Choose a unit.'),
    task_type: z.enum(TASK_TYPES),
    title: z.string().trim().min(2, 'Give the task a title.').max(160),
    description: z.string().trim().max(2000),
    scheduled_at: z.string().min(1, 'Choose when it should start.'),
    due_at: z.string(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    assigned_to: z.string(),
    inspection_required: z.boolean(),
    template_id: z.string(),
  })
  .refine((v) => !v.due_at || v.due_at >= v.scheduled_at, { path: ['due_at'], message: 'Due time must be after the start.' })
type Values = z.infer<typeof schema>

/** `datetime-local` value (local wall time in the browser) → ISO timestamp. */
const toIso = (local: string) => new Date(local).toISOString()

export function NewTaskDialog({ open, onOpenChange, propertyId }: { open: boolean; onOpenChange: (o: boolean) => void; propertyId?: string }) {
  const navigate = useNavigate()
  const properties = usePropertyOptions()
  const staff = useMemberOptions(['housekeeping', 'manager', 'owner'])
  const templates = useChecklistTemplates()
  const create = useCreateTask()
  const firstProperty = properties.data?.find((p) => p.id === propertyId) ?? (properties.data?.length === 1 ? properties.data[0] : undefined)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      property_id: firstProperty?.id ?? '',
      unit_id: firstProperty?.units.find((u) => u.status === 'active')?.id ?? '',
      task_type: 'deep_clean',
      title: '',
      description: '',
      scheduled_at: '',
      due_at: '',
      priority: 'normal',
      assigned_to: '',
      inspection_required: false,
      template_id: '',
    },
  })
  const v = useWatch({ control: form.control }) as Values
  const property = properties.data?.find((p) => p.id === v.property_id)
  const { errors } = form.formState

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New housekeeping task</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((values) =>
            create.mutate(
              {
                ...values,
                scheduled_at: toIso(values.scheduled_at),
                due_at: values.due_at ? toIso(values.due_at) : null,
                assigned_to: values.assigned_to || null,
              },
              {
                onSuccess: (id) => {
                  toast.success('Task created.')
                  onOpenChange(false)
                  navigate(`/housekeeping/${id}`)
                },
              },
            ),
          )}
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
                {properties.data
                  ?.filter((p) => p.status === 'active')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Unit" error={errors.unit_id?.message} required>
              <NativeSelect {...form.register('unit_id')} disabled={!property}>
                {property?.units
                  .filter((u) => u.status === 'active')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Type" error={errors.task_type?.message}>
              <NativeSelect {...form.register('task_type')}>
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TASK_TYPE[t]}
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
            <Field label="Title" error={errors.title?.message} required className="sm:col-span-2">
              <Input placeholder="e.g. Monthly deep clean, wash curtains" {...form.register('title')} />
            </Field>
            <Field label="Start" error={errors.scheduled_at?.message} required>
              <Input type="datetime-local" {...form.register('scheduled_at')} />
            </Field>
            <Field label="Due by" error={errors.due_at?.message}>
              <Input type="datetime-local" {...form.register('due_at')} />
            </Field>
            <Field label="Assign to" error={errors.assigned_to?.message}>
              <NativeSelect {...form.register('assigned_to')}>
                <option value="">Unassigned</option>
                {staff.data?.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Checklist" error={errors.template_id?.message}>
              <NativeSelect {...form.register('template_id')}>
                <option value="">No checklist</option>
                {templates.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Instructions" error={errors.description?.message} className="sm:col-span-2">
              <Textarea rows={2} {...form.register('description')} />
            </Field>
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="inspection"
              checked={v.inspection_required}
              onCheckedChange={(c) => form.setValue('inspection_required', c === true)}
            />
            <Label htmlFor="inspection" className="font-normal">
              Requires manager inspection before it counts as complete
            </Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
