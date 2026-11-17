import { AlertTriangle, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { useOrg } from '@/features/workspace/workspace-provider'
import { cn } from '@/lib/utils'
import { useSubscriptionStatus } from './api'

/**
 * Trial countdown and read-only notice above every page. Hidden while loading or if the status
 * can't be read, so a billing problem never gets in the way of running the business.
 */
export function SubscriptionBanner() {
  const { orgId } = useOrg()
  const { data } = useSubscriptionStatus(orgId)
  if (!data) return null

  const expired = data.state === 'expired'
  const endingSoon = data.state === 'active' && data.days_left <= 5
  if (data.state === 'active' && !endingSoon) return null

  const days = data.days_left === 1 ? '1 day' : `${data.days_left} days`
  const text = expired
    ? data.can_manage
      ? 'Your subscription has ended. Everything is still here, but CoastStay is read-only until you renew.'
      : 'This business’s subscription has ended, so CoastStay is read-only. Ask the owner to renew.'
    : data.state === 'trialing'
      ? `Free trial: ${days} left.`
      : `Your plan ends in ${days}.`

  return (
    <div
      role={expired ? 'alert' : 'status'}
      className={cn(
        'no-print mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-3 text-sm',
        expired ? 'border-danger/25 bg-danger-soft text-charcoal-900' : 'border-ocean-100 bg-ocean-50 text-charcoal-900',
      )}
    >
      {expired ? <AlertTriangle className="size-4 shrink-0 text-danger" /> : <Sparkles className="size-4 shrink-0 text-primary" />}
      <span className="min-w-0 flex-1">
        {text}
        {data.pending_request && ' Your payment is awaiting confirmation.'}
      </span>
      {data.can_manage && !data.pending_request && (
        <Link to="/settings/billing" className="font-semibold text-primary underline-offset-4 hover:underline">
          {expired ? 'Renew now' : 'Choose a plan'}
        </Link>
      )}
    </div>
  )
}
