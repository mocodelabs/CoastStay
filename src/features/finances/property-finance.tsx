import { Link } from 'react-router'
import { ErrorState, KpiSkeleton } from '@/components/feedback/states'
import { presetRange } from '@/components/forms/date-range'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatCents, toCents } from '@/lib/currency'
import { todayISO } from '@/lib/date-utils'
import { useFinanceSummary, type FinanceSummary } from './api'

function Column({ title, s, currency }: { title: string; s: FinanceSummary; currency: string }) {
  const f = (v: number) => formatCents(toCents(v), currency, { compact: true })
  const rows: Array<[string, string, string?]> = [
    ['Payments received', f(s.payments_received)],
    ['Refunds', f(s.refunds)],
    ['Net collected', f(s.net_collected), 'font-semibold'],
    ['Operating expenses', f(s.expenses_operating)],
    ['Estimated operating income', f(s.estimated_operating_income), s.estimated_operating_income >= 0 ? 'font-semibold text-success' : 'font-semibold text-danger'],
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">
          {rows.map(([label, value, cls]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={`tabular ${cls ?? ''}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

/** Month-to-date and year-to-date cash summary for one property. */
export function PropertyFinanceSummary({ propertyId }: { propertyId: string }) {
  const { timezone, currency } = useOrg()
  const today = todayISO(timezone)
  const month = presetRange('this_month', today)
  const year = presetRange('this_year', today)
  const m = useFinanceSummary(month.from, month.to, propertyId)
  const y = useFinanceSummary(year.from, year.to, propertyId)
  if (m.isPending || y.isPending) return <KpiSkeleton count={2} />
  if (m.isError || y.isError) return <ErrorState error={m.error ?? y.error} onRetry={() => void Promise.all([m.refetch(), y.refetch()])} />
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Column title="This month" s={m.data} currency={currency} />
        <Column title="This year" s={y.data} currency={currency} />
      </div>
      <p className="text-sm text-muted-foreground">
        Outstanding guest balances for this property: {formatCents(toCents(m.data.outstanding_balance), currency)}.{' '}
        <Link to={`/finances?property=${propertyId}`} className="text-primary hover:underline">
          Open finances
        </Link>
      </p>
    </div>
  )
}
