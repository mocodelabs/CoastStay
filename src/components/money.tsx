import { formatMoney } from '@/lib/currency'
import { cn } from '@/lib/utils'

export function Money({
  value,
  currency = 'KES',
  compact,
  className,
  signed,
}: {
  value: string | number | null | undefined
  currency?: string
  compact?: boolean
  className?: string
  /** Colour negatives red and positives green. */
  signed?: boolean
}) {
  const n = Number(value ?? 0)
  return (
    <span className={cn('tabular whitespace-nowrap', signed && n < 0 && 'text-danger', signed && n > 0 && 'text-success', className)}>
      {formatMoney(value ?? 0, currency, { compact })}
    </span>
  )
}
