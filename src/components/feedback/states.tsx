import type { UseQueryResult } from '@tanstack/react-query'
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { Card, Skeleton } from '@/components/ui/primitives'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-sand-50/50 px-6 py-12 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-ocean-50 text-ocean-600">
        <Icon className="size-6" />
      </span>
      <div className="max-w-sm space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 rounded-lg border border-danger/20 bg-danger-soft/50 px-6 py-10 text-center', className)}>
      <AlertTriangle className="size-6 text-danger" />
      <div className="space-y-1">
        <p className="font-medium text-charcoal-900">We couldn’t load this</p>
        <p className="text-sm text-muted-foreground">{toUserMessage(error)}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="divide-y" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </Card>
  )
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="aspect-[16/10] rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </Card>
      ))}
    </div>
  )
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="space-y-3 p-4">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-6 w-2/3" />
        </Card>
      ))}
    </div>
  )
}

/**
 * Renders the loading / error / empty / data states of a query consistently.
 */
export function QueryState<T>({
  query,
  loading,
  empty,
  isEmpty,
  children,
}: {
  query: UseQueryResult<T>
  loading?: React.ReactNode
  empty?: React.ReactNode
  isEmpty?: (data: T) => boolean
  children: (data: T) => React.ReactNode
}) {
  if (query.isPending) return <>{loading ?? <ListSkeleton />}</>
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const data = query.data as T
  const emptyCheck = isEmpty ?? ((d: T) => Array.isArray(d) && d.length === 0)
  if (empty && emptyCheck(data)) return <>{empty}</>
  return <>{children(data)}</>
}
