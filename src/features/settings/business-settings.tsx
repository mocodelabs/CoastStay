import { zodResolver } from '@hookform/resolvers/zod'
import { ImageUp, Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Field } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives'
import { useOrg } from '@/features/workspace/workspace-provider'
import { toUserMessage } from '@/lib/errors'
import { formatPhone } from '@/lib/phone'
import { BrandMark } from '@/components/layout/brand'
import { businessSchema, CURRENCIES, TIMEZONES, type BusinessValues } from '@/schemas/settings'
import { useUpdateBusiness, useUploadLogo } from './api'

export function BusinessSettings() {
  const { org } = useOrg()
  const update = useUpdateBusiness()
  const logo = useUploadLogo()
  const fileRef = useRef<HTMLInputElement>(null)

  const form = useForm<BusinessValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: toValues(org),
  })
  useEffect(() => form.reset(toValues(org)), [org, form])

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    logo.mutate(file, {
      onSuccess: () => toast.success('Logo updated.'),
      onError: (err) => toast.error(toUserMessage(err)),
    })
  }

  const { errors, isDirty } = form.formState
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Your logo appears in the app and on printed booking confirmations.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          {org.logo_url ? (
            <img src={org.logo_url} alt={`${org.name} logo`} className="size-16 rounded-lg border bg-white object-contain p-1" />
          ) : (
            <BrandMark className="size-16" />
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onLogo} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" loading={logo.isPending} onClick={() => fileRef.current?.click()}>
              <ImageUp /> Upload logo
            </Button>
            {org.logo_url && (
              <Button variant="ghost" disabled={logo.isPending} onClick={() => logo.mutate(null)}>
                <Trash2 /> Remove
              </Button>
            )}
          </div>
          <p className="w-full text-xs text-muted-foreground">PNG, JPG, WebP or SVG, up to 2 MB. Square images work best.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>Contact details are used in guest messages and confirmations.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="space-y-4"
            onSubmit={form.handleSubmit((v) =>
              update.mutate(v, {
                onSuccess: () => toast.success('Business details saved.'),
                onError: (e) => toast.error(toUserMessage(e)),
              }),
            )}
          >
            <Field label="Business name" error={errors.name?.message} required>
              <Input {...form.register('name')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact phone" error={errors.contact_phone?.message}>
                <Input type="tel" inputMode="tel" {...form.register('contact_phone')} />
              </Field>
              <Field label="Contact email" error={errors.contact_email?.message}>
                <Input type="email" inputMode="email" {...form.register('contact_email')} />
              </Field>
            </div>
            <Field label="Address" error={errors.address?.message}>
              <Textarea rows={2} {...form.register('address')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency" hint="Applies to new bookings and expenses." error={errors.currency?.message}>
                <NativeSelect {...form.register('currency')}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Time zone" error={errors.timezone?.message}>
                <NativeSelect {...form.register('timezone')}>
                  {TIMEZONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Button type="submit" loading={update.isPending} disabled={!isDirty}>
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function toValues(org: ReturnType<typeof useOrg>['org']): BusinessValues {
  return {
    name: org.name,
    contact_email: org.contact_email ?? '',
    contact_phone: org.contact_phone ? formatPhone(org.contact_phone) : '',
    address: org.address ?? '',
    currency: (CURRENCIES as readonly string[]).includes(org.currency) ? (org.currency as BusinessValues['currency']) : 'KES',
    timezone: (TIMEZONES as readonly string[]).includes(org.timezone) ? (org.timezone as BusinessValues['timezone']) : 'Africa/Nairobi',
  }
}
