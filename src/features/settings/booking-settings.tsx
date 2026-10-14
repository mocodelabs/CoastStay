import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ListSkeleton } from '@/components/feedback/states'
import { Field } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Label } from '@/components/ui/primitives'
import { useOrg, type OrganizationSettings } from '@/features/workspace/workspace-provider'
import { toUserMessage } from '@/lib/errors'
import {
  bookingDefaultsSchema,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type BookingDefaultsInput,
  type BookingDefaultsValues,
} from '@/schemas/settings'
import { useUpdateBookingDefaults } from './api'

function toValues(s: OrganizationSettings): BookingDefaultsInput {
  return {
    default_check_in_time: s.default_check_in_time.slice(0, 5),
    default_check_out_time: s.default_check_out_time.slice(0, 5),
    booking_reference_prefix: s.booking_reference_prefix,
    default_deposit_percent: Number(s.default_deposit_percent),
    balance_due_days_before_arrival: s.balance_due_days_before_arrival,
    enabled_payment_methods: s.enabled_payment_methods,
  }
}

export function BookingSettings() {
  const { settings } = useOrg()
  if (!settings) return <ListSkeleton rows={3} />
  return <BookingSettingsForm settings={settings} />
}

function BookingSettingsForm({ settings }: { settings: OrganizationSettings }) {
  const update = useUpdateBookingDefaults()
  const form = useForm<BookingDefaultsInput, unknown, BookingDefaultsValues>({
    resolver: zodResolver(bookingDefaultsSchema),
    defaultValues: toValues(settings),
  })
  useEffect(() => form.reset(toValues(settings)), [settings, form])
  const { errors, isDirty } = form.formState

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={form.handleSubmit((v) =>
        update.mutate(v, {
          onSuccess: () => toast.success('Booking settings saved.'),
          onError: (e) => toast.error(toUserMessage(e)),
        }),
      )}
    >
      <Card>
        <CardHeader>
          <CardTitle>Booking defaults</CardTitle>
          <CardDescription>Used when a property doesn’t set its own times, and for new bookings.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Default check-in time" error={errors.default_check_in_time?.message}>
            <Input type="time" {...form.register('default_check_in_time')} />
          </Field>
          <Field label="Default check-out time" error={errors.default_check_out_time?.message}>
            <Input type="time" {...form.register('default_check_out_time')} />
          </Field>
          <Field label="Booking reference prefix" hint="e.g. CS → CS-2610-K7XQP" error={errors.booking_reference_prefix?.message}>
            <Input className="uppercase" maxLength={6} {...form.register('booking_reference_prefix')} />
          </Field>
          <Field label="Suggested deposit (%)" error={errors.default_deposit_percent?.message}>
            <Input type="number" inputMode="decimal" min={0} max={100} step="1" {...form.register('default_deposit_percent')} />
          </Field>
          <Field
            label="Balance due (days before arrival)"
            hint="Used for overdue-balance reminders."
            error={errors.balance_due_days_before_arrival?.message}
          >
            <Input type="number" inputMode="numeric" min={0} max={60} {...form.register('balance_due_days_before_arrival')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment methods</CardTitle>
          <CardDescription>
            Methods staff can choose when recording payments. M-Pesa entries are recorded manually and marked unverified
            unless confirmed by an integration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Controller
            control={form.control}
            name="enabled_payment_methods"
            render={({ field }) => (
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Enabled payment methods</legend>
                {PAYMENT_METHODS.map((m) => {
                  const checked = field.value.includes(m)
                  return (
                    <div key={m} className="flex items-center gap-2.5">
                      <Checkbox
                        id={`pm-${m}`}
                        checked={checked}
                        onCheckedChange={(c) =>
                          field.onChange(c ? [...field.value, m] : field.value.filter((x) => x !== m))
                        }
                      />
                      <Label htmlFor={`pm-${m}`} className="font-normal">
                        {PAYMENT_METHOD_LABELS[m]}
                      </Label>
                    </div>
                  )
                })}
              </fieldset>
            )}
          />
          {errors.enabled_payment_methods && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger">
              {errors.enabled_payment_methods.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Button type="submit" loading={update.isPending} disabled={!isDirty}>
        Save settings
      </Button>
    </form>
  )
}
