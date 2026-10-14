import type * as React from 'react'
import { Card } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export function Kpi({
  label,
  value,
  hint,
  tone = 'default',
  icon: Icon,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'default' | 'info' | 'warning' | 'danger' | 'success'
  icon?: React.ComponentType<{ className?: string }>
  className?: string
}) {
  const toneClass = {
    default: 'bg-ocean-50 text-ocean-600',
    info: 'bg-info-soft text-info',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    success: 'bg-success-soft text-success',
  }[tone]
  return (
    <Card className={cn('flex min-w-0 items-start gap-3 p-4', className)}>
      {Icon && (
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', toneClass)}>
          <Icon className="size-[1.1rem]" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-lg font-semibold tabular whitespace-nowrap text-charcoal-900 sm:text-xl">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  )
}

/** Responsive KPI grid: as many ~12rem columns as fit. */
export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3', className)}>{children}</div>
}

