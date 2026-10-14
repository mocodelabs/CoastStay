import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { useOrg } from '@/features/workspace/workspace-provider'
import { balanceDue } from '@/lib/booking-calc'
import { formatCents, toCents } from '@/lib/currency'
import { toUserMessage } from '@/lib/errors'
import { cancelSchema, type CancelFormValues } from '@/schemas/booking'
import { useCancelBooking, type BookingDetail } from './api'

export function CancelBookingDialog({ booking, open, onOpenChange }: { booking: BookingDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { currency } = useOrg()
  const cancel = useCancelBooking(booking.id)
  const form = useForm<CancelFormValues>({ resolver: zodResolver(cancelSchema), defaultValues: { cancellation_fee: '', cancellation_reason: '' } })
  const fee = useWatch({ control: form.control, name: 'cancellation_fee' })
  const { errors } = form.formState

  let feeCents = 0
  try {
    feeCents = toCents(fee || '0')
  } catch {
    feeCents = 0
  }
  const result = balanceDue({
    status: 'cancelled',
    total: toCents(booking.total_amount),
    cancellationFee: feeCents,
    paid: toCents(booking.amount_paid),
    refunded: toCents(booking.amount_refunded),
    adjustments: toCents(booking.adjustment_total),
  })
  const tooHigh = feeCents > toCents(booking.total_amount)

  return (
    <Dialog open={open} onOpenChange={(o) => !cancel.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel booking {booking.booking_reference}?</DialogTitle>
          <DialogDescription>The booking and its history are kept; the dates become available again.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((v) => {
            if (tooHigh) return
            cancel.mutate(v, {
              onSuccess: () => {
                toast.success('Booking cancelled.')
                onOpenChange(false)
              },
            })
          })}
        >
          <FormError message={cancel.isError ? toUserMessage(cancel.error) : null} />
          <Field
            label={`Cancellation fee kept (${currency})`}
            hint={`Received so far: ${formatCents(toCents(booking.amount_paid) - toCents(booking.amount_refunded), currency)}. Leave empty for no fee.`}
            error={errors.cancellation_fee?.message ?? (tooHigh ? 'Cannot exceed the booking total.' : undefined)}
          >
            <Input inputMode="decimal" {...form.register('cancellation_fee')} />
          </Field>
          <Field label="Reason" error={errors.cancellation_reason?.message} required>
            <Textarea rows={2} {...form.register('cancellation_reason')} />
          </Field>
          <p className="rounded-md bg-sand-50 p-3 text-sm">
            {result > 0 && <>After cancelling, the guest will still owe {formatCents(result, currency)}.</>}
            {result === 0 && <>After cancelling, nothing is owed either way.</>}
            {result < 0 && (
              <>
                After cancelling, <strong>{formatCents(-result, currency)}</strong> is owed back to the guest — record the refund
                once it is sent.
              </>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cancel.isPending}>
              Keep booking
            </Button>
            <Button type="submit" variant="destructive" loading={cancel.isPending}>
              Cancel booking
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
