import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, CalendarCheck, CheckCircle2, Loader2, X } from 'lucide-react'
import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, Checkbox, Label } from '@/components/ui/primitives'
import { GuestPicker } from '@/features/guests/guest-picker'
import { PhoneHint } from '@/features/guests/guest-form'
import { usePropertyOptions, type PropertyOption } from '@/features/properties/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { computePricing } from '@/lib/booking-calc'
import { centsToDecimal, formatCents, percentOf, toCents } from '@/lib/currency'
import { formatDate } from '@/lib/date-utils'
import { BOOKING_SOURCE, BOOKING_SOURCES, PAYMENT_METHOD } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { bookingSchema, PAYMENT_METHODS, type BookingFormValues } from '@/schemas/booking'
import { useUnitConflicts } from './api'

function unitDefaults(properties: PropertyOption[] | undefined, propertyId: string, unitId: string) {
  const p = properties?.find((x) => x.id === propertyId)
  const u = p?.units.find((x) => x.id === unitId)
  return {
    property: p,
    unit: u,
    rate: u?.nightly_rate_override ?? p?.standard_nightly_rate ?? null,
    capacity: u?.max_guests ?? p?.max_guests ?? null,
  }
}

function safePricing(v: BookingFormValues) {
  try {
    if (!v.check_in_date || !v.check_out_date || !/^\d/.test(v.nightly_rate)) return null
    return computePricing({
      checkIn: v.check_in_date,
      checkOut: v.check_out_date,
      nightlyRate: v.nightly_rate.replace(/,/g, ''),
      cleaningFee: v.cleaning_fee.replace(/,/g, '') || 0,
      additionalFees: v.additional_fees.replace(/,/g, '') || 0,
      discount: v.discount_amount.replace(/,/g, '') || 0,
    })
  } catch {
    return null
  }
}

export function BookingForm({
  mode,
  initial,
  bookingId,
  submitLabel,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit'
  initial: BookingFormValues
  bookingId?: string
  submitLabel: string
  saving: boolean
  error?: string | null
  onSubmit: (v: BookingFormValues) => void
  onCancel: () => void
}) {
  const { can, currency, settings } = useOrg()
  const properties = usePropertyOptions()
  const form = useForm<BookingFormValues>({ resolver: zodResolver(bookingSchema), defaultValues: initial })
  const { errors } = form.formState
  const reg = form.register
  const values = useWatch({ control: form.control }) as BookingFormValues

  const { property, unit, capacity } = unitDefaults(properties.data, values.property_id, values.unit_id)
  const pricing = useMemo(() => safePricing(values), [values])
  const conflicts = useUnitConflicts(values.unit_id, values.check_in_date, values.check_out_date, bookingId)
  const blocking = values.status !== 'inquiry'
  const hasConflict = blocking && (conflicts.data?.length ?? 0) > 0
  const guests = Number(values.adults || 0) + Number(values.children || 0)
  const overCapacity = capacity !== null && guests > capacity
  const deposit = pricing ? percentOf(pricing.total, Number(settings?.default_deposit_percent ?? 30)) : 0

  function applyUnitDefaults(propertyId: string, unitId: string) {
    if (mode !== 'create') return
    const d = unitDefaults(properties.data, propertyId, unitId)
    if (d.rate !== null) form.setValue('nightly_rate', centsToDecimal(toCents(d.rate)), { shouldValidate: true })
    if (d.property) form.setValue('cleaning_fee', centsToDecimal(toCents(d.property.cleaning_fee)))
  }

  function onPropertyChange(propertyId: string) {
    const p = properties.data?.find((x) => x.id === propertyId)
    const firstUnit = p?.units.find((u) => u.status === 'active')
    form.setValue('property_id', propertyId, { shouldValidate: true })
    form.setValue('unit_id', firstUnit?.id ?? '', { shouldValidate: true })
    applyUnitDefaults(propertyId, firstUnit?.id ?? '')
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(
        (v) => {
          if (hasConflict) return
          onSubmit(v)
        },
        () => toast.error('Some details need attention — check the highlighted fields.'),
      )}
      className="grid gap-5 lg:grid-cols-[1fr_20rem]"
    >
      <div className="space-y-5">
        <FormError message={error} />

        <Card>
          <CardHeader>
            <CardTitle>Guest</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {values.guest_mode === 'existing' ? (
              <GuestPicker
                guestId={values.guest_id}
                error={errors.guest_id?.message}
                allowNew={mode === 'create'}
                onSelect={(id) => form.setValue('guest_id', id, { shouldValidate: Boolean(id) })}
                onNewGuest={(name) => {
                  form.setValue('guest_mode', 'new')
                  form.setValue('new_guest_name', name)
                }}
              />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" error={errors.new_guest_name?.message} required className="sm:col-span-2">
                    <Input autoComplete="off" {...reg('new_guest_name')} />
                  </Field>
                  <Field label="Phone / WhatsApp" error={errors.new_guest_phone?.message} hint={<PhoneHint value={values.new_guest_phone} />}>
                    <Input type="tel" inputMode="tel" placeholder="0712 345 678" {...reg('new_guest_phone')} />
                  </Field>
                  <Field label="Email" error={errors.new_guest_email?.message}>
                    <Input type="email" inputMode="email" {...reg('new_guest_email')} />
                  </Field>
                </div>
                <Button variant="ghost" size="sm" onClick={() => form.setValue('guest_mode', 'existing')}>
                  <X /> Choose an existing guest instead
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stay</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Property" error={errors.property_id?.message} required>
              <NativeSelect value={values.property_id} onChange={(e) => onPropertyChange(e.target.value)} disabled={properties.isPending}>
                <option value="">Choose a property…</option>
                {properties.data
                  ?.filter((p) => p.status === 'active' || p.id === values.property_id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Unit" error={errors.unit_id?.message} required>
              <NativeSelect
                value={values.unit_id}
                disabled={!property}
                onChange={(e) => {
                  form.setValue('unit_id', e.target.value, { shouldValidate: true })
                  applyUnitDefaults(values.property_id, e.target.value)
                }}
              >
                <option value="">Choose a unit…</option>
                {property?.units
                  .filter((u) => u.status === 'active' || u.id === values.unit_id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Check-in" error={errors.check_in_date?.message} required>
              <Input type="date" {...reg('check_in_date')} />
            </Field>
            <Field label="Check-out" error={errors.check_out_date?.message} required>
              <Input type="date" min={values.check_in_date || undefined} {...reg('check_out_date')} />
            </Field>
            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              <Field label="Adults" error={errors.adults?.message} required>
                <Input type="number" inputMode="numeric" min={1} {...reg('adults')} />
              </Field>
              <Field label="Children" error={errors.children?.message}>
                <Input type="number" inputMode="numeric" min={0} {...reg('children')} />
              </Field>
              <Field label="Infants" error={errors.infants?.message}>
                <Input type="number" inputMode="numeric" min={0} {...reg('infants')} />
              </Field>
            </div>
            {overCapacity && (
              <p className="flex items-center gap-2 text-sm text-danger sm:col-span-2" role="alert">
                <AlertTriangle className="size-4" /> {unit?.name ?? 'This unit'} sleeps at most {capacity} (infants excluded).
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing ({currency})</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Nightly rate" error={errors.nightly_rate?.message} required>
              <Input inputMode="decimal" {...reg('nightly_rate')} />
            </Field>
            <Field label="Cleaning fee" error={errors.cleaning_fee?.message}>
              <Input inputMode="decimal" placeholder="0" {...reg('cleaning_fee')} />
            </Field>
            <Field label="Additional fees" hint="e.g. airport transfer, extra bed" error={errors.additional_fees?.message}>
              <Input inputMode="decimal" placeholder="0" {...reg('additional_fees')} />
            </Field>
            <Field label="Discount" error={errors.discount_amount?.message}>
              <Input inputMode="decimal" placeholder="0" {...reg('discount_amount')} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Booking details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Source" error={errors.booking_source?.message}>
              <NativeSelect {...reg('booking_source')}>
                {BOOKING_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {BOOKING_SOURCE[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Platform reference" hint="e.g. Airbnb confirmation code" error={errors.external_reference?.message}>
              <Input {...reg('external_reference')} />
            </Field>
            {mode === 'create' && (
              <Field
                label="Status"
                hint="Inquiries don’t reserve the dates; pending and confirmed bookings do."
                error={errors.status?.message}
                className="sm:col-span-2"
              >
                <NativeSelect {...reg('status')}>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending (dates held, awaiting deposit)</option>
                  <option value="inquiry">Inquiry (dates not reserved)</option>
                </NativeSelect>
              </Field>
            )}
            <Field label="Guest requests" error={errors.guest_requests?.message} className="sm:col-span-2">
              <Textarea rows={2} placeholder="Late arrival, baby cot, airport pickup…" {...reg('guest_requests')} />
            </Field>
            <Field label="Internal notes" hint="Staff only." error={errors.internal_notes?.message} className="sm:col-span-2">
              <Textarea rows={2} {...reg('internal_notes')} />
            </Field>
          </CardContent>
        </Card>

        {mode === 'create' && can('finance.record') && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="record-payment"
                  checked={values.record_payment}
                  onCheckedChange={(c) => {
                    form.setValue('record_payment', c === true)
                    if (c === true && !values.payment_amount && deposit > 0) form.setValue('payment_amount', centsToDecimal(deposit))
                  }}
                />
                <Label htmlFor="record-payment" className="text-base font-semibold">
                  Record a deposit now
                </Label>
              </div>
            </CardHeader>
            {values.record_payment && (
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Amount received" error={errors.payment_amount?.message} required>
                  <Input inputMode="decimal" {...reg('payment_amount')} />
                </Field>
                <Field label="Method" error={errors.payment_method?.message}>
                  <NativeSelect {...reg('payment_method')}>
                    {PAYMENT_METHODS.filter((m) => settings?.enabled_payment_methods.includes(m) ?? true).map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD[m]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field
                  label="Transaction reference"
                  hint={values.payment_method === 'mpesa' ? 'M-Pesa confirmation code' : undefined}
                  error={errors.payment_reference?.message}
                >
                  <Input className="uppercase" {...reg('payment_reference')} />
                </Field>
                <Field label="Payment date" error={errors.payment_date?.message} required>
                  <Input type="date" {...reg('payment_date')} />
                </Field>
                {values.payment_method === 'mpesa' && (
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Saved as a manually recorded M-Pesa payment — it is not verified with Safaricom.
                  </p>
                )}
              </CardContent>
            )}
          </Card>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {pricing ? (
              <dl className="space-y-1.5">
                <SummaryRow
                  label={`${formatCents(toCents(values.nightly_rate.replace(/,/g, '')), currency)} × ${pricing.nights} night${pricing.nights === 1 ? '' : 's'}`}
                  value={formatCents(pricing.accommodation, currency)}
                />
                {pricing.cleaningFee > 0 && <SummaryRow label="Cleaning fee" value={formatCents(pricing.cleaningFee, currency)} />}
                {pricing.additionalFees > 0 && <SummaryRow label="Additional fees" value={formatCents(pricing.additionalFees, currency)} />}
                {pricing.discount > 0 && <SummaryRow label="Discount" value={`− ${formatCents(pricing.discount, currency)}`} />}
                <div className="border-t pt-2">
                  <SummaryRow label="Total" value={formatCents(pricing.total, currency)} strong />
                </div>
                {deposit > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Suggested deposit ({Number(settings?.default_deposit_percent ?? 30)}%): {formatCents(deposit, currency)}
                  </p>
                )}
              </dl>
            ) : (
              <p className="text-muted-foreground">Choose dates and a rate to see the total.</p>
            )}

            <Availability
              enabled={Boolean(values.unit_id && values.check_in_date && values.check_out_date && values.check_out_date > values.check_in_date)}
              loading={conflicts.isFetching}
              blocking={blocking}
              conflicts={conflicts.data ?? []}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" loading={saving} disabled={hasConflict || overCapacity}>
            <CalendarCheck /> {submitLabel}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </aside>
    </form>
  )
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', strong && 'text-base font-semibold')}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  )
}

function Availability({
  enabled,
  loading,
  blocking,
  conflicts,
}: {
  enabled: boolean
  loading: boolean
  blocking: boolean
  conflicts: Array<{ source_type: string; booking_id: string | null; start_date: string; end_date: string; label: string }>
}) {
  if (!enabled) return null
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground" aria-live="polite">
        <Loader2 className="size-4 animate-spin" /> Checking availability…
      </p>
    )
  }
  if (conflicts.length === 0) {
    return (
      <p className="flex items-center gap-2 font-medium text-success" aria-live="polite">
        <CheckCircle2 className="size-4" /> Available for these dates
      </p>
    )
  }
  return (
    <div className={cn('space-y-2 rounded-md p-3', blocking ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')} aria-live="polite">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4" /> {blocking ? 'Not available' : 'Dates are taken (inquiry only)'}
      </p>
      <ul className="space-y-1 text-xs">
        {conflicts.map((c, i) => (
          <li key={i}>
            {c.booking_id ? (
              <Link to={`/bookings/${c.booking_id}`} className="underline">
                {c.label}
              </Link>
            ) : (
              c.label
            )}{' '}
            · {formatDate(c.start_date)} → {formatDate(c.end_date)}
          </li>
        ))}
      </ul>
    </div>
  )
}
