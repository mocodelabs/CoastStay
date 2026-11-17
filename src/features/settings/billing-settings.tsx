import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Clock3 } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ErrorState, ListSkeleton } from '@/components/feedback/states'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives'
import { useBillingInstructions, usePaymentRequests, useRequestPayment, useSubscriptionStatus, type SubscriptionStatus } from '@/features/billing/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatMoney } from '@/lib/currency'
import { formatDateTime } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { annualSaving, PLANS, planByCode, type PlanCode } from '@/lib/plans'
import { cn } from '@/lib/utils'

const paymentSchema = z.object({
  plan: z.enum(['monthly', 'annual']),
  method: z.enum(['mpesa', 'bank']),
  reference: z
    .string()
    .trim()
    .min(4, 'Enter the transaction reference from your M-Pesa message or bank slip.')
    .max(60, 'That reference is too long.'),
})
type PaymentValues = z.infer<typeof paymentSchema>

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger' } as const
const METHOD_LABEL = { mpesa: 'M-Pesa', bank: 'Bank transfer' } as const

export function BillingSettings() {
  const { orgId } = useOrg()
  const status = useSubscriptionStatus(orgId)
  if (status.isPending) return <ListSkeleton rows={3} />
  if (status.isError) return <ErrorState error={status.error} onRetry={() => void status.refetch()} />
  if (!status.data) return <ErrorState error="No subscription was found for this business. Contact mocode labs on 0721 609 317." />
  return (
    <div className="space-y-6">
      <StatusCard status={status.data} />
      <PayCard status={status.data} />
      <History />
    </div>
  )
}

function StatusCard({ status }: { status: SubscriptionStatus }) {
  const { timezone } = useOrg()
  const plan = planByCode(status.plan)
  const until = status.state === 'active' ? status.current_period_end : status.trial_ends_at
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Your subscription</CardTitle>
          <CardDescription>One subscription covers the whole business: every property, unit and team member.</CardDescription>
        </div>
        {status.state === 'active' && <Badge tone="success">Active · {plan?.name ?? 'Paid'}</Badge>}
        {status.state === 'trialing' && <Badge tone="info">Free trial</Badge>}
        {status.state === 'expired' && <Badge tone="danger">Expired · read-only</Badge>}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {status.state === 'expired' ? (
          <p>
            Your access ended on <strong>{formatDateTime(until, timezone, { dateOnly: true })}</strong>. Everything is
            safe and visible, but nothing can be added or changed until you renew.
          </p>
        ) : (
          <p>
            {status.state === 'trialing' ? 'Your free trial ends' : 'Paid until'}{' '}
            <strong>{formatDateTime(until, timezone, { dateOnly: true })}</strong> —{' '}
            {status.days_left === 1 ? '1 day' : `${status.days_left} days`} left.
          </p>
        )}
        {status.pending_request && (
          <p className="flex items-center gap-2 text-warning">
            <Clock3 className="size-4" /> A payment is waiting to be confirmed. Your plan is activated as soon as it is.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function PayCard({ status }: { status: SubscriptionStatus }) {
  const { orgId } = useOrg()
  const instructions = useBillingInstructions()
  const request = useRequestPayment(orgId)
  const form = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { plan: status.plan ?? 'annual', method: 'mpesa', reference: '' },
  })
  const plan = useWatch({ control: form.control, name: 'plan' })
  const { errors } = form.formState
  const verb = status.state === 'active' ? 'Renew or extend' : 'Choose a plan'

  return (
    <Card>
      <CardHeader>
        <CardTitle>{verb}</CardTitle>
        <CardDescription>
          Paying early never loses days: a new period starts when your current one ends.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Plan</legend>
          {PLANS.map((p) => {
            const selected = plan === p.code
            return (
              <label
                key={p.code}
                className={cn(
                  'relative flex cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors',
                  selected ? 'border-primary bg-ocean-50 ring-1 ring-primary' : 'hover:bg-sand-50',
                )}
              >
                <input type="radio" value={p.code} className="sr-only" {...form.register('plan')} />
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  {p.code === 'annual' && <Badge tone="success">Save {formatMoney(annualSaving(), 'KES', { compact: true })}</Badge>}
                </span>
                <span className="text-2xl font-semibold tabular-nums">
                  {formatMoney(p.price, 'KES', { compact: true })}
                  <span className="text-sm font-normal text-muted-foreground"> / {p.per}</span>
                </span>
                {p.code === 'annual' && (
                  <span className="text-xs text-muted-foreground">Works out at {formatMoney(Math.round(p.price / 12), 'KES', { compact: true })} a month</span>
                )}
                {selected && <Check className="absolute top-3 right-3 size-4 text-primary" aria-hidden />}
              </label>
            )
          })}
        </fieldset>

        <div className="rounded-lg border border-dashed bg-sand-50/60 p-4 text-sm">
          <p className="font-medium">How to pay</p>
          <p className="mt-1 text-muted-foreground">{instructions.data ?? 'Loading payment details…'}</p>
        </div>

        <form
          noValidate
          className="grid gap-4 sm:grid-cols-[10rem_1fr_auto] sm:items-start"
          onSubmit={form.handleSubmit((v) =>
            request.mutate(
              { plan: v.plan as PlanCode, method: v.method, reference: v.reference },
              {
                onSuccess: () => {
                  toast.success('Payment submitted. We’ll activate your plan as soon as it is confirmed.')
                  form.reset({ ...v, reference: '' })
                },
              },
            ),
          )}
        >
          <div className="sm:col-span-3">
            <FormError message={request.isError ? toUserMessage(request.error) : null} />
          </div>
          <Field label="Paid by" error={errors.method?.message}>
            <NativeSelect {...form.register('method')}>
              <option value="mpesa">M-Pesa</option>
              <option value="bank">Bank transfer</option>
            </NativeSelect>
          </Field>
          <Field label="Transaction reference" required error={errors.reference?.message} hint="e.g. QLK7H2M9TB">
            <Input className="uppercase" autoComplete="off" {...form.register('reference')} />
          </Field>
          <Button type="submit" loading={request.isPending} className="sm:mt-[1.6rem]">
            I’ve paid {formatMoney(PLANS.find((p) => p.code === plan)!.price, 'KES', { compact: true })}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function History() {
  const { orgId, timezone } = useOrg()
  const requests = usePaymentRequests(orgId)
  if (requests.isPending || !requests.data?.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment history</CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {requests.data.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {planByCode(r.plan)?.name ?? r.plan} · {formatMoney(r.amount, 'KES', { compact: true })}
              </p>
              <p className="text-xs text-muted-foreground">
                {METHOD_LABEL[r.method as 'mpesa' | 'bank']} {r.reference} · submitted {formatDateTime(r.submitted_at, timezone)}
                {r.status === 'approved' && r.period_end && ` · covers until ${formatDateTime(r.period_end, timezone, { dateOnly: true })}`}
                {r.review_note && ` · ${r.review_note}`}
              </p>
            </div>
            <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE]}>
              {r.status === 'pending' ? 'Awaiting confirmation' : r.status === 'approved' ? 'Confirmed' : 'Not confirmed'}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
