import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ListSkeleton, QueryState } from '@/components/feedback/states'
import { Field, FormError } from '@/components/forms/field'
import { Money } from '@/components/money'
import { PaymentStatusBadge } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useRequestId } from '@/hooks/use-url-state'
import { centsToDecimal, formatCents, toCents } from '@/lib/currency'
import { formatDate, todayISO } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { PAYMENT_METHOD, PAYMENT_TYPE } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { ENTRY_TYPES, PAYMENT_METHODS, paymentSchema, type PaymentFormValues } from '@/schemas/booking'
import { useBookingPayments, useRecordPayment, useReversePayment, type BookingDetail, type Payment } from './api'

const TYPE_HELP: Record<(typeof ENTRY_TYPES)[number], string> = {
  deposit: 'Money received to secure the booking.',
  balance: 'Money received towards the remaining balance.',
  payment: 'Any other money received from the guest.',
  refund: 'Money sent back to the guest. Cannot exceed what was received.',
  adjustment_credit: 'Non-cash credit that reduces what the guest owes (e.g. compensation).',
  adjustment_debit: 'Non-cash charge that increases what the guest owes (e.g. damage).',
}

function RecordPaymentDialog({ booking, open, onOpenChange }: { booking: BookingDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { timezone, settings, currency } = useOrg()
  const record = useRecordPayment(booking.id)
  const requestId = useRequestId()
  const balance = toCents(booking.balance_due)
  const defaultType = balance < 0 ? 'refund' : booking.amount_paid > 0 ? 'balance' : 'deposit'
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_type: defaultType,
      amount: balance !== 0 ? centsToDecimal(Math.abs(balance)) : '',
      payment_method: settings?.enabled_payment_methods[0] ?? 'mpesa',
      transaction_reference: '',
      payment_date: todayISO(timezone),
      notes: '',
    },
  })
  const type = useWatch({ control: form.control, name: 'payment_type' })
  const method = useWatch({ control: form.control, name: 'payment_method' })
  const isAdjustment = type.startsWith('adjustment')
  const { errors } = form.formState

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a transaction</DialogTitle>
          <DialogDescription>
            Balance due: {formatCents(balance, currency)}
            {balance < 0 && ' (credit owed to the guest)'}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((values) =>
            record.mutate(
              { values: { ...values, // adjustments move no money; any enabled method satisfies the column
                payment_method: isAdjustment ? (settings?.enabled_payment_methods[0] ?? values.payment_method) : values.payment_method }, requestId: requestId.get() },
              {
                onSuccess: () => {
                  requestId.renew()
                  toast.success(`${PAYMENT_TYPE[values.payment_type]} recorded.`)
                  onOpenChange(false)
                  form.reset()
                },
              },
            ),
          )}
        >
          <FormError message={record.isError ? toUserMessage(record.error) : null} />
          <Field label="Type" hint={TYPE_HELP[type]} error={errors.payment_type?.message}>
            <NativeSelect {...form.register('payment_type')}>
              {ENTRY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PAYMENT_TYPE[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Amount (${currency})`} error={errors.amount?.message} required>
              <Input inputMode="decimal" {...form.register('amount')} />
            </Field>
            <Field label="Date" error={errors.payment_date?.message} required>
              <Input type="date" max={todayISO(timezone)} {...form.register('payment_date')} />
            </Field>
            {!isAdjustment && (
              <>
                <Field label="Method" error={errors.payment_method?.message}>
                  <NativeSelect {...form.register('payment_method')}>
                    {PAYMENT_METHODS.filter((m) => settings?.enabled_payment_methods.includes(m) ?? true).map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD[m]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field
                  label="Transaction reference"
                  hint={method === 'mpesa' ? 'M-Pesa confirmation code' : undefined}
                  error={errors.transaction_reference?.message}
                >
                  <Input className="uppercase" autoComplete="off" {...form.register('transaction_reference')} />
                </Field>
              </>
            )}
          </div>
          <Field label="Notes" error={errors.notes?.message}>
            <Textarea rows={2} {...form.register('notes')} />
          </Field>
          {method === 'mpesa' && !isAdjustment && (
            <p className="text-xs text-muted-foreground">Recorded manually — not verified with Safaricom. Check the code against your M-Pesa statement.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={record.isPending}>
              Record
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ReverseDialog({
  bookingId,
  payment,
  onOpenChange,
}: {
  bookingId: string
  payment: Payment | null
  onOpenChange: (o: boolean) => void
}) {
  const { timezone, currency } = useOrg()
  const reverse = useReversePayment(bookingId)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <Dialog open={payment !== null} onOpenChange={(o) => !reverse.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse this transaction?</DialogTitle>
          <DialogDescription>
            {payment && `${PAYMENT_TYPE[payment.payment_type]} of ${formatCents(toCents(payment.amount), currency)} on ${formatDate(payment.payment_date)}.`}{' '}
            The original stays in the history; a reversal entry cancels its effect.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormError message={err} />
          <Field label="Reason" required error={err && reason.trim().length < 3 ? 'Give a reason.' : undefined}>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered on the wrong booking" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reverse.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={reverse.isPending}
            onClick={() => {
              if (reason.trim().length < 3) {
                setErr('Give a reason for the reversal.')
                return
              }
              setErr(null)
              reverse.mutate(
                { payment: payment!, reason: reason.trim(), date: todayISO(timezone) },
                {
                  onSuccess: () => {
                    toast.success('Transaction reversed.')
                    setReason('')
                    onOpenChange(false)
                  },
                  onError: (e) => setErr(toUserMessage(e)),
                },
              )
            }}
          >
            <Undo2 /> Reverse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PaymentsPanel({ booking }: { booking: BookingDetail }) {
  const { can, currency } = useOrg()
  const payments = useBookingPayments(booking.id)
  const [recording, setRecording] = useState(false)
  const [reversing, setReversing] = useState<Payment | null>(null)
  const reversedIds = new Set((payments.data ?? []).map((p) => p.reverses_payment_id).filter(Boolean))
  const balance = toCents(booking.balance_due)
  const chargeable = booking.status === 'cancelled' ? booking.cancellation_fee : booking.total_amount

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Payments</CardTitle>
        {can('finance.record') && booking.status !== 'inquiry' && (
          <Button size="sm" onClick={() => setRecording(true)}>
            <Plus /> Record
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">{booking.status === 'cancelled' ? 'Cancellation fee' : 'Booking total'}</dt>
            <dd className="font-semibold">
              <Money value={chargeable} currency={currency} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Received</dt>
            <dd className="font-semibold">
              <Money value={booking.amount_paid} currency={currency} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Refunded</dt>
            <dd className="font-semibold">
              <Money value={booking.amount_refunded} currency={currency} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{balance < 0 ? 'Credit owed to guest' : 'Balance due'}</dt>
            <dd className={cn('font-semibold', balance > 0 && 'text-warning', balance < 0 && 'text-info', balance === 0 && 'text-success')}>
              {formatCents(Math.abs(balance), currency)}
            </dd>
          </div>
        </dl>
        {booking.adjustment_total !== 0 && (
          <p className="text-xs text-muted-foreground">
            Includes net adjustments of {formatCents(toCents(booking.adjustment_total), currency)}.
          </p>
        )}

        <QueryState query={payments} loading={<ListSkeleton rows={2} />} empty={<p className="text-sm text-muted-foreground">No transactions recorded yet.</p>}>
          {(rows) => (
            <ul className="divide-y rounded-md border">
              {rows.map((p) => {
                const reversed = reversedIds.has(p.id)
                const outgoing = p.payment_type === 'refund' || p.payment_type === 'reversal'
                return (
                  <li key={p.id} className={cn('flex flex-wrap items-center gap-3 p-3 text-sm', reversed && 'opacity-60')}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {PAYMENT_TYPE[p.payment_type]}
                        {p.payment_type !== 'adjustment_credit' && p.payment_type !== 'adjustment_debit' && ` · ${PAYMENT_METHOD[p.payment_method]}`}
                        {reversed && (
                          <Badge tone="muted" className="ml-2">
                            Reversed
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.payment_date)}
                        {p.transaction_reference && ` · ${p.transaction_reference}`}
                        {p.recorder?.full_name && ` · by ${p.recorder.full_name}`}
                      </p>
                      {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                    </div>
                    <PaymentStatusBadge status={p.status} />
                    <span className={cn('tabular font-medium', outgoing && 'text-danger')}>
                      {outgoing ? '− ' : ''}
                      <Money value={p.amount} currency={currency} />
                    </span>
                    {can('finance.reverse') && p.payment_type !== 'reversal' && !reversed && ['recorded', 'verified'].includes(p.status) && (
                      <Button variant="ghost" size="icon-sm" aria-label="Reverse transaction" onClick={() => setReversing(p)}>
                        <Undo2 />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </QueryState>
      </CardContent>
      {recording && <RecordPaymentDialog booking={booking} open={recording} onOpenChange={setRecording} />}
      <ReverseDialog bookingId={booking.id} payment={reversing} onOpenChange={(o) => !o && setReversing(null)} />
    </Card>
  )
}
