import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { toUserMessage } from '@/lib/errors'
import { normalizePhone } from '@/lib/phone'
import { emptyGuest, guestSchema, guestToForm, type GuestFormValues } from '@/schemas/guest'
import { useSaveGuest, type Guest } from './api'

export function PhoneHint({ value }: { value: string }) {
  if (!value.trim()) return null
  const r = normalizePhone(value)
  if (!r.ok) return null
  return (
    <span>
      Saved as {r.e164}
      {!r.isKenyanMobile && ' (international)'}
    </span>
  )
}

export function GuestDialog({
  guest,
  open,
  onOpenChange,
  onSaved,
}: {
  guest?: Guest | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved?: (id: string) => void
}) {
  const save = useSaveGuest()
  const form = useForm<GuestFormValues>({
    resolver: zodResolver(guestSchema),
    values: guest ? guestToForm(guest) : emptyGuest,
  })
  const phone = useWatch({ control: form.control, name: 'phone' })
  const { errors } = form.formState

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{guest ? 'Edit guest' : 'New guest'}</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((values) =>
            save.mutate(
              { id: guest?.id, values },
              {
                onSuccess: (id) => {
                  toast.success(guest ? 'Guest saved.' : 'Guest added.')
                  onOpenChange(false)
                  onSaved?.(id)
                },
              },
            ),
          )}
        >
          <FormError message={save.isError ? toUserMessage(save.error) : null} />
          <Field label="Full name" error={errors.full_name?.message} required>
            <Input autoComplete="off" {...form.register('full_name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone / WhatsApp" error={errors.phone?.message} hint={<PhoneHint value={phone} />}>
              <Input type="tel" inputMode="tel" placeholder="0712 345 678" {...form.register('phone')} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" inputMode="email" {...form.register('email')} />
            </Field>
          </div>
          <Field label="Country" error={errors.country?.message}>
            <Input {...form.register('country')} />
          </Field>
          <Field label="Preferences" hint="e.g. ground floor, extra towels, early check-in" error={errors.preferences?.message}>
            <Textarea rows={2} {...form.register('preferences')} />
          </Field>
          <Field label="Internal notes" hint="Visible to staff only." error={errors.notes?.message}>
            <Textarea rows={2} {...form.register('notes')} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {guest ? 'Save guest' : 'Add guest'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
