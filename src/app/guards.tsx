import { Lock } from 'lucide-react'
import type * as React from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-provider'
import { useWorkspace } from '@/features/workspace/workspace-provider'
import type { Permission } from '@/lib/permissions'

export function FullPageSpinner({ label = 'Loading CoastStay…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <span className="size-8 animate-spin rounded-full border-2 border-ocean-200 border-t-primary" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  )
}

/** Signed-in users only; remembers where they were going. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner />
  if (!user) {
    const next = location.pathname + location.search
    return <Navigate to={`/login${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />
  }
  return <>{children}</>
}

/** Requires an active organization membership; otherwise sends the user to onboarding. */
export function RequireOrg({ children }: { children: React.ReactNode }) {
  const { org, loading, error, refetch } = useWorkspace()
  if (loading) return <FullPageSpinner />
  if (error && !org) {
    return (
      <div className="mx-auto max-w-md p-6 pt-24">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    )
  }
  if (!org) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

/** Hides a page from roles without the permission. RLS still protects the data itself. */
export function RequirePermission({ anyOf, children }: { anyOf: Permission[]; children: React.ReactNode }) {
  const { canAny } = useWorkspace()
  if (!canAny(...anyOf)) return <NoAccess />
  return <>{children}</>
}

export function NoAccess() {
  return (
    <EmptyState
      icon={Lock}
      title="You don’t have access to this page"
      description="Your role doesn’t include this area. Ask the business owner if you need access."
      action={
        <Button asChild variant="outline">
          <Link to="/">Go to dashboard</Link>
        </Button>
      }
    />
  )
}
