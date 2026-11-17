import { ArrowLeft, Check, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives'
import { useIsPlatformAdmin, usePlatformBilling, useReviewPayment } from '@/features/billing/api'
import { NoAccess, FullPageSpinner } from '@/app/guards'
import { formatMoney } from '@/lib/currency'
import { formatDateTime } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { planByCode } from '@/lib/plans'

const STATE_TONE = { active: 'success', trialing: 'info', expired: 'danger' } as const
const METHOD = { mpesa: 'M-Pesa', bank: 'Bank' } as Record<string, string>

/** Operator console: confirm subscription payments and see every business's status. */
export function PlatformPage() {
  const admin = useIsPlatformAdmin()
  if (admin.isPending) return <FullPageSpinner />
  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to CoastStay
        </Link>
        {admin.data ? <Console /> : <NoAccess />}
      </main>
    </div>
  )
}

function Console() {
  const q = usePlatformBilling()
  if (q.isPending) return <ListSkeleton rows={6} />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const pending = q.data.requests.filter((r) => r.status === 'pending')
  const reviewed = q.data.requests.filter((r) => r.status !== 'pending')
  const counts = { trialing: 0, active: 0, expired: 0 }
  q.data.subscriptions.forEach((s) => (counts[s.state as keyof typeof counts] += 1))

  return (
    <>
      <PageHeader
        title="Platform billing"
        description={`${q.data.subscriptions.length} businesses · ${counts.active} paying · ${counts.trialing} on trial · ${counts.expired} expired`}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Payments to confirm</CardTitle>
            <CardDescription>
              Check each reference against your M-Pesa statement or bank account before approving. Approving extends the
              business by one plan period.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {pending.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Nothing waiting" description="New payment confirmations from owners will appear here." />
              </div>
            ) : (
              <ul className="divide-y">
                {pending.map((r) => (
                  <PendingRow key={r.id} request={r} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Businesses</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-5 py-2 font-medium">Business</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Until</th>
                  <th className="px-5 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {q.data.subscriptions.map((s) => (
                  <tr key={s.organization_id}>
                    <td className="px-5 py-2.5 font-medium">{s.organization_name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{s.owner_email ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={STATE_TONE[s.state as keyof typeof STATE_TONE]}>
                        {s.state === 'active' ? (planByCode(s.plan)?.name ?? 'Active') : s.state === 'trialing' ? 'Trial' : 'Expired'}
                      </Badge>
                      {s.pending_requests > 0 && <Badge tone="warning" className="ml-1.5">Payment waiting</Badge>}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {formatDateTime(s.state === 'active' ? s.current_period_end : s.trial_ends_at, undefined, { dateOnly: true })}
                    </td>
                    <td className="px-5 py-2.5 tabular-nums text-muted-foreground">{formatDateTime(s.created_at, undefined, { dateOnly: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {reviewed.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recently reviewed</CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0 text-sm">
              {reviewed.slice(0, 30).map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                  <span>
                    <span className="font-medium">{r.organization_name}</span> · {METHOD[r.method]} {r.reference} ·{' '}
                    {formatMoney(r.amount, 'KES', { compact: true })}
                    {r.review_note && <span className="text-muted-foreground"> · {r.review_note}</span>}
                  </span>
                  <Badge tone={r.status === 'approved' ? 'success' : 'danger'}>{r.status === 'approved' ? 'Approved' : 'Rejected'}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}

type Request = NonNullable<ReturnType<typeof usePlatformBilling>['data']>['requests'][number]

function PendingRow({ request: r }: { request: Request }) {
  const review = useReviewPayment()
  const [note, setNote] = useState('')
  const act = (approve: boolean) =>
    review.mutate(
      { id: r.id, approve, note },
      {
        onSuccess: () => toast.success(approve ? `${r.organization_name} activated.` : 'Payment marked as not received.'),
        onError: (e) => toast.error(toUserMessage(e)),
      },
    )
  return (
    <li className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {r.organization_name} · {planByCode(r.plan)?.name} · {formatMoney(r.amount, 'KES', { compact: true })}
        </p>
        <p className="text-sm text-muted-foreground">
          {METHOD[r.method]} reference <span className="font-mono text-foreground">{r.reference}</span> · {r.submitted_by_email ?? 'unknown'} ·{' '}
          {formatDateTime(r.submitted_at)}
        </p>
      </div>
      <Input
        aria-label={`Note for ${r.reference}`}
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="lg:w-48"
        maxLength={300}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => act(true)} loading={review.isPending && review.variables?.approve}>
          <Check /> Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => act(false)} loading={review.isPending && !review.variables?.approve}>
          <X /> Reject
        </Button>
      </div>
    </li>
  )
}
