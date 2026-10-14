import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives'
import { useMemberOptions } from '@/features/workspace/members'
import { AMENITY_SUGGESTIONS, KENYA_COASTAL_COUNTIES, PROPERTY_TYPE } from '@/lib/labels'
import { ROLE_LABELS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { PROPERTY_TYPES, propertySchema, type PropertyFormValues } from '@/schemas/property'

function AmenitiesPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [custom, setCustom] = useState('')
  const all = [...new Set([...AMENITY_SUGGESTIONS, ...value])]
  const toggle = (a: string) => onChange(value.includes(a) ? value.filter((x) => x !== a) : [...value, a])
  function addCustom() {
    const v = custom.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setCustom('')
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Amenities">
        {all.map((a) => {
          const on = value.includes(a)
          return (
            <button
              key={a}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(a)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                on ? 'border-primary bg-ocean-50 text-ocean-700' : 'border-input bg-surface text-charcoal-700 hover:bg-sand-50',
              )}
            >
              {a}
            </button>
          )
        })}
      </div>
      <div className="flex max-w-sm gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder="Add another amenity"
          aria-label="Add another amenity"
          maxLength={60}
        />
        <Button type="button" variant="outline" size="icon" onClick={addCustom} aria-label="Add amenity">
          <Plus />
        </Button>
      </div>
    </div>
  )
}

export function PropertyForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  error,
  saving,
}: {
  initial: PropertyFormValues
  submitLabel: string
  onSubmit: (v: PropertyFormValues) => void
  onCancel: () => void
  error?: string | null
  saving: boolean
}) {
  const staff = useMemberOptions(['housekeeping', 'manager', 'owner'])
  const form = useForm<PropertyFormValues>({ resolver: zodResolver(propertySchema), defaultValues: initial })
  const { errors } = form.formState
  const reg = form.register

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <FormError message={error} />
      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Property name" error={errors.name?.message} required className="sm:col-span-2">
            <Input placeholder="e.g. Diani Beach Villa" {...reg('name')} />
          </Field>
          <Field label="Type" error={errors.property_type?.message}>
            <NativeSelect {...reg('property_type')}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROPERTY_TYPE[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Caretaker" hint="Gets access to this property automatically." error={errors.caretaker_id?.message}>
            <NativeSelect {...reg('caretaker_id')} disabled={staff.isPending}>
              <option value="">No caretaker</option>
              {staff.data?.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name} — {ROLE_LABELS[m.role]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Description" error={errors.description?.message} className="sm:col-span-2">
            <Textarea rows={3} {...reg('description')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Area / location" hint="e.g. Diani, Nyali, Watamu" error={errors.location_name?.message}>
            <Input {...reg('location_name')} />
          </Field>
          <Field label="County" error={errors.county?.message}>
            <Input list="coastal-counties" {...reg('county')} />
          </Field>
          <datalist id="coastal-counties">
            {KENYA_COASTAL_COUNTIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Field label="Address" error={errors.address?.message} className="sm:col-span-2">
            <Textarea rows={2} {...reg('address')} />
          </Field>
          <Field label="Latitude" hint="Optional, e.g. -4.3167" error={errors.latitude?.message}>
            <Input inputMode="decimal" {...reg('latitude')} />
          </Field>
          <Field label="Longitude" hint="Optional, e.g. 39.5833" error={errors.longitude?.message}>
            <Input inputMode="decimal" {...reg('longitude')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Capacity & pricing</CardTitle>
          <CardDescription>Defaults for new bookings; each booking keeps its own agreed price.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Bedrooms" error={errors.bedrooms?.message} required>
            <Input type="number" inputMode="numeric" min={0} {...reg('bedrooms')} />
          </Field>
          <Field label="Bathrooms" error={errors.bathrooms?.message} required>
            <Input type="number" inputMode="decimal" min={0} step={0.5} {...reg('bathrooms')} />
          </Field>
          <Field label="Maximum guests" hint="Adults and children; infants excluded." error={errors.max_guests?.message} required>
            <Input type="number" inputMode="numeric" min={1} {...reg('max_guests')} />
          </Field>
          <Field label="Standard nightly rate (KES)" error={errors.standard_nightly_rate?.message} required>
            <Input inputMode="decimal" placeholder="12500" {...reg('standard_nightly_rate')} />
          </Field>
          <Field label="Cleaning fee (KES)" error={errors.cleaning_fee?.message}>
            <Input inputMode="decimal" placeholder="0" {...reg('cleaning_fee')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Amenities</CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            control={form.control}
            name="amenities"
            render={({ field }) => <AmenitiesPicker value={field.value} onChange={field.onChange} />}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Arrival & departure</CardTitle>
          <CardDescription>Used in guest messages. Times default to your business settings when empty.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Check-in from" error={errors.check_in_time?.message}>
            <Input type="time" {...reg('check_in_time')} />
          </Field>
          <Field label="Check-out by" error={errors.check_out_time?.message}>
            <Input type="time" {...reg('check_out_time')} />
          </Field>
          <Field label="Check-in instructions" error={errors.check_in_instructions?.message} className="sm:col-span-2">
            <Textarea rows={3} placeholder="Key collection, gate code, caretaker contact…" {...reg('check_in_instructions')} />
          </Field>
          <Field label="Check-out instructions" error={errors.check_out_instructions?.message} className="sm:col-span-2">
            <Textarea rows={2} {...reg('check_out_instructions')} />
          </Field>
          <Field label="Directions" error={errors.directions?.message} className="sm:col-span-2">
            <Textarea rows={2} placeholder="Landmarks, Google Maps link…" {...reg('directions')} />
          </Field>
          <Field label="House rules" error={errors.house_rules?.message} className="sm:col-span-2">
            <Textarea rows={2} {...reg('house_rules')} />
          </Field>
          <Field label="Wi-Fi network" error={errors.wifi_name?.message}>
            <Input autoComplete="off" {...reg('wifi_name')} />
          </Field>
          <Field label="Wi-Fi password" error={errors.wifi_password?.message}>
            <Input autoComplete="off" {...reg('wifi_password')} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          <X /> Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
