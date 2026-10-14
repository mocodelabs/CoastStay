import { Download, Info, Printer } from 'lucide-react'
import type * as React from 'react'
import { useSearchParams } from 'react-router'
import { OccupancyChart, RevenueExpenseChart } from '@/components/charts/charts'
import { EmptyState, ErrorState, KpiSkeleton, ListSkeleton } from '@/components/feedback/states'
import { DateRangeFilter, presetRange } from '@/components/forms/date-range'
import { Kpi, KpiGrid } from '@/components/kpi'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useFinanceSummary } from '@/features/finances/api'
import { usePropertyOptions } from '@/features/properties/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useUrlFilters } from '@/hooks/use-url-state'
import { formatCents, toCents } from '@/lib/currency'
import { formatDate, isISODate, parseISODate, todayISO, toISODate } from '@/lib/date-utils'
import { BOOKING_SOURCE, BOOKING_STATUS, MAINTENANCE_CATEGORY, type BookingSource, type BookingStatus } from '@/lib/labels'
import { downloadText, toCsv } from '@/lib/utils'
import { metrics, sumPerformance, useMonthly, usePropertyPerformance } from './api'
import {
  summarizeBookings,
  useBookingsInPeriod,
  useCancellations,
  useExpensesByCategory,
  useHousekeepingStats,
  useInventoryConsumption,
  useMaintenanceStats,
  type ReportFilter,
} from './report-data'

const FILTERS = ['tab', 'from', 'to', 'property'] as const

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-md bg-sand-50 px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function ReportCard({
  title,
  onExport,
  children,
}: {
  title: string
  onExport?: () => void
  children: React.ReactNode
}) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {onExport && (
          <Button variant="ghost" size="sm" className="no-print" onClick={onExport}>
            <Download /> CSV
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`)

function SummaryTab({ f }: { f: ReportFilter }) {
  const { currency, can } = useOrg()
  const fin = can('reports.financial') && can('finance.view')
  const bookings = useBookingsInPeriod(f)
  const finance = useFinanceSummary(f.from, f.to, f.property)
  const cancellations = useCancellations(f)
  const money = (c: number) => formatCents(c, currency, { compact: true })
  if (bookings.isPending) return <KpiSkeleton count={8} />
  if (bookings.isError) return <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
  const s = summarizeBookings(bookings.data)
  const d = finance.data
  const cancelRate = s.bookings ? (s.cancelled / s.bookings) * 100 : null
  const exportSources = () =>
    downloadText(
      `booking-summary-${f.from}-${f.to}.csv`,
      toCsv(
        s.bySource.map((r) => ({ source: BOOKING_SOURCE[r.key as BookingSource], bookings: r.count, nights: r.nights, value: (r.value / 100).toFixed(2) })),
        [
          { key: 'source', label: 'Source' },
          { key: 'bookings', label: 'Bookings' },
          { key: 'nights', label: 'Nights (excl. cancelled)' },
          { key: 'value', label: `Reservation value (${currency})` },
        ],
      ),
    )
  return (
    <div className="space-y-5">
      <KpiGrid>
        <Kpi label="Bookings (check-in in period)" value={s.bookings} hint={`${s.inquiries} inquiries not counted`} />
        <Kpi label="Nights booked" value={s.nights} hint={`Average stay ${s.avgStay.toFixed(1)} nights`} />
        <Kpi label="Reservation value" value={money(s.valueCents)} hint="Totals of non-cancelled bookings" />
        <Kpi label="Cancellations" value={s.cancelled} hint={cancelRate === null ? undefined : `${cancelRate.toFixed(1)}% of bookings`} tone="danger" />
        {fin && d && (
          <>
            <Kpi label="Revenue collected" value={money(toCents(d.net_collected))} hint="Payments − refunds, by payment date" tone="success" />
            <Kpi label="Operating expenses" value={money(toCents(d.expenses_operating))} tone="danger" />
            <Kpi label="Est. operating income" value={money(toCents(d.estimated_operating_income))} hint="Not accounting profit" />
            <Kpi label="Outstanding balances" value={money(toCents(d.outstanding_balance))} hint="Current, all dates" tone="warning" />
          </>
        )}
      </KpiGrid>
      <div className="grid gap-5 lg:grid-cols-2">
        <ReportCard title="By source" onExport={exportSources}>
          <Table>
            <THead>
              <tr>
                <TH>Source</TH>
                <TH className="text-right">Bookings</TH>
                <TH className="text-right">Nights</TH>
                <TH className="text-right">Value</TH>
              </tr>
            </THead>
            <TBody>
              {s.bySource.map((r) => (
                <TR key={r.key}>
                  <TD>{BOOKING_SOURCE[r.key as BookingSource]}</TD>
                  <TD className="text-right tabular">{r.count}</TD>
                  <TD className="text-right tabular">{r.nights}</TD>
                  <TD className="text-right tabular">{money(r.value)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </ReportCard>
        <ReportCard title="By status">
          <Table>
            <THead>
              <tr>
                <TH>Status</TH>
                <TH className="text-right">Bookings</TH>
                <TH className="text-right">Value</TH>
              </tr>
            </THead>
            <TBody>
              {s.byStatus.map((r) => (
                <TR key={r.key}>
                  <TD>{BOOKING_STATUS[r.key as BookingStatus].label}</TD>
                  <TD className="text-right tabular">{r.count}</TD>
                  <TD className="text-right tabular">{r.key === 'cancelled' ? '—' : money(r.value)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </ReportCard>
      </div>
      <ReportCard
        title="Cancellations in the period"
        onExport={() =>
          cancellations.data &&
          downloadText(
            `cancellations-${f.from}-${f.to}.csv`,
            toCsv(
              cancellations.data.map((c) => ({
                reference: c.booking_reference,
                guest: c.guest?.full_name,
                property: c.property?.name,
                source: BOOKING_SOURCE[c.booking_source],
                check_in: c.check_in_date,
                cancelled: c.cancelled_at?.slice(0, 10),
                value: c.total_amount,
                fee: c.cancellation_fee,
                reason: c.cancellation_reason,
              })),
              [
                { key: 'reference', label: 'Reference' },
                { key: 'guest', label: 'Guest' },
                { key: 'property', label: 'Property' },
                { key: 'source', label: 'Source' },
                { key: 'check_in', label: 'Check-in' },
                { key: 'cancelled', label: 'Cancelled on' },
                { key: 'value', label: 'Booking value' },
                { key: 'fee', label: 'Fee kept' },
                { key: 'reason', label: 'Reason' },
              ],
            ),
          )
        }
      >
        {cancellations.isPending ? (
          <ListSkeleton rows={2} />
        ) : (cancellations.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No cancellations in this period.</p>
        ) : (
          <>
            <p className="text-sm">
              {cancellations.data!.length} cancelled · value lost{' '}
              {money(cancellations.data!.reduce((a, c) => a + toCents(c.total_amount) - toCents(c.cancellation_fee), 0))} · fees kept{' '}
              {money(cancellations.data!.reduce((a, c) => a + toCents(c.cancellation_fee), 0))}
            </p>
            <Table>
              <THead>
                <tr>
                  <TH>Guest</TH>
                  <TH className="hidden sm:table-cell">Cancelled</TH>
                  <TH>Reason</TH>
                  <TH className="text-right">Fee kept</TH>
                </tr>
              </THead>
              <TBody>
                {cancellations.data!.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      {c.guest?.full_name}
                      <p className="text-xs text-muted-foreground">
                        {c.booking_reference} · {c.property?.name}
                      </p>
                    </TD>
                    <TD className="hidden text-sm sm:table-cell">{c.cancelled_at ? formatDate(c.cancelled_at) : '—'}</TD>
                    <TD className="text-sm">{c.cancellation_reason ?? '—'}</TD>
                    <TD className="text-right tabular">{money(toCents(c.cancellation_fee))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </>
        )}
        <Formula>Cancellation rate = bookings with check-in in the period that are now cancelled ÷ all bookings (excluding inquiries) with check-in in the period. Value lost = booking total − cancellation fee kept.</Formula>
      </ReportCard>
      <Formula>
        Bookings are counted by check-in date. Reservation value = totals of bookings that are not cancelled (inquiries excluded). Revenue collected is cash
        basis by payment date. See docs/REPORTS.md for every definition.
      </Formula>
    </div>
  )
}

function PerformanceTab({ f }: { f: ReportFilter }) {
  const { currency, can } = useOrg()
  const fin = can('reports.financial') && can('finance.view')
  const perf = usePropertyPerformance(f.from, f.to)
  if (perf.isPending) return <ListSkeleton />
  if (perf.isError) return <ErrorState error={perf.error} onRetry={() => void perf.refetch()} />
  const rows = perf.data.filter((r) => !f.property || r.property_id === f.property)
  if (!rows.length) return <EmptyState title="No properties to report on" />
  const total = sumPerformance(rows)
  const tm = metrics(total)
  const money = (v: number) => formatCents(toCents(v), currency, { compact: true })
  const exportCsv = () =>
    downloadText(
      `property-performance-${f.from}-${f.to}.csv`,
      toCsv(
        rows.map((r) => {
          const m = metrics(r)
          return {
            property: r.property_name,
            units: r.unit_count,
            available: r.available_nights,
            blocked: r.blocked_nights,
            occupied: r.occupied_nights,
            occupancy: m.occupancy?.toFixed(1) ?? '',
            adr: m.adr?.toFixed(2) ?? '',
            revpar: m.revpar?.toFixed(2) ?? '',
            accommodation: r.accommodation_revenue,
            reservation: r.reservation_value,
            ...(fin && { collected: r.payments_collected, expenses: r.operating_expenses, income: (Number(r.payments_collected) - Number(r.operating_expenses)).toFixed(2) }),
          }
        }),
        [
          { key: 'property', label: 'Property' },
          { key: 'units', label: 'Units' },
          { key: 'available', label: 'Available unit-nights' },
          { key: 'blocked', label: 'Blocked unit-nights' },
          { key: 'occupied', label: 'Occupied unit-nights' },
          { key: 'occupancy', label: 'Occupancy %' },
          { key: 'adr', label: `ADR (${currency})` },
          { key: 'revpar', label: `RevPAR (${currency})` },
          { key: 'accommodation', label: 'Accommodation revenue' },
          { key: 'reservation', label: 'Reservation value' },
          ...(fin
            ? [
                { key: 'collected', label: 'Collected' },
                { key: 'expenses', label: 'Operating expenses' },
                { key: 'income', label: 'Est. operating income' },
              ]
            : []),
        ],
      ),
    )
  return (
    <div className="space-y-5">
      <KpiGrid>
        <Kpi label="Occupancy rate" value={pct(tm.occupancy)} hint={`${total.occupied_nights} of ${total.available_nights} unit-nights`} />
        <Kpi label="Average daily rate (ADR)" value={tm.adr === null ? '—' : money(tm.adr)} />
        <Kpi label="RevPAR" value={tm.revpar === null ? '—' : money(tm.revpar)} hint="Per available unit-night" />
        <Kpi label="Reservation value" value={money(total.reservation_value)} hint="Allocated by stay night" />
      </KpiGrid>
      <ReportCard title="Occupancy by property">
        <OccupancyChart data={rows.map((r) => ({ name: r.property_name, occupancy: metrics(r).occupancy }))} />
      </ReportCard>
      <ReportCard title="Property performance" onExport={exportCsv}>
        <Table>
          <THead>
            <tr>
              <TH>Property</TH>
              <TH className="text-right">Occupied / available</TH>
              <TH className="text-right">Occupancy</TH>
              <TH className="hidden text-right md:table-cell">ADR</TH>
              <TH className="hidden text-right md:table-cell">RevPAR</TH>
              <TH className="text-right">Accommodation</TH>
              {fin && <TH className="hidden text-right lg:table-cell">Collected</TH>}
              {fin && <TH className="hidden text-right lg:table-cell">Expenses</TH>}
              {fin && <TH className="hidden text-right lg:table-cell">Est. income</TH>}
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => {
              const m = metrics(r)
              return (
                <TR key={r.property_id}>
                  <TD className="font-medium">{r.property_name}</TD>
                  <TD className="text-right tabular">
                    {r.occupied_nights} / {r.available_nights}
                    {r.blocked_nights > 0 && <span className="block text-xs text-muted-foreground">{r.blocked_nights} blocked</span>}
                  </TD>
                  <TD className="text-right tabular">{pct(m.occupancy)}</TD>
                  <TD className="hidden text-right tabular md:table-cell">{m.adr === null ? '—' : money(m.adr)}</TD>
                  <TD className="hidden text-right tabular md:table-cell">{m.revpar === null ? '—' : money(m.revpar)}</TD>
                  <TD className="text-right tabular">{money(r.accommodation_revenue)}</TD>
                  {fin && <TD className="hidden text-right tabular lg:table-cell">{money(r.payments_collected)}</TD>}
                  {fin && <TD className="hidden text-right tabular lg:table-cell">{money(r.operating_expenses)}</TD>}
                  {fin && <TD className="hidden text-right tabular lg:table-cell">{money(Number(r.payments_collected) - Number(r.operating_expenses))}</TD>}
                </TR>
              )
            })}
            {rows.length > 1 && (
              <TR className="font-semibold">
                <TD>Total</TD>
                <TD className="text-right tabular">
                  {total.occupied_nights} / {total.available_nights}
                </TD>
                <TD className="text-right tabular">{pct(tm.occupancy)}</TD>
                <TD className="hidden text-right tabular md:table-cell">{tm.adr === null ? '—' : money(tm.adr)}</TD>
                <TD className="hidden text-right tabular md:table-cell">{tm.revpar === null ? '—' : money(tm.revpar)}</TD>
                <TD className="text-right tabular">{money(total.accommodation_revenue)}</TD>
                {fin && <TD className="hidden text-right tabular lg:table-cell">{money(total.payments_collected)}</TD>}
                {fin && <TD className="hidden text-right tabular lg:table-cell">{money(total.operating_expenses)}</TD>}
                {fin && <TD className="hidden text-right tabular lg:table-cell">{money(total.payments_collected - total.operating_expenses)}</TD>}
              </TR>
            )}
          </TBody>
        </Table>
        <Formula>
          Occupancy = occupied unit-nights ÷ available unit-nights × 100. Available = active units × nights in the period (from the unit’s creation)
          minus blocked nights. Occupied = nights of confirmed, checked-in and checked-out stays. ADR = accommodation revenue ÷ occupied unit-nights.
          RevPAR = accommodation revenue ÷ available unit-nights. Accommodation revenue per night = (nightly rate × nights − discount) ÷ nights, so a
          stay spanning two periods is split by night. Property collected/expenses exclude business-wide expenses.
        </Formula>
      </ReportCard>
    </div>
  )
}

function MonthlyTab({ to }: { to: string }) {
  const { currency } = useOrg()
  const end = parseISODate(to)
  const first = toISODate(new Date(end.getFullYear(), end.getMonth() - 11, 1))
  const monthly = useMonthly(first, 12)
  if (monthly.isPending) return <ListSkeleton />
  if (monthly.isError) return <ErrorState error={monthly.error} onRetry={() => void monthly.refetch()} />
  const money = (v: number) => formatCents(toCents(v), currency, { compact: true })
  const label = (m: string) => new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(parseISODate(m))
  const exportCsv = () =>
    downloadText(
      `monthly-summary-${first}.csv`,
      toCsv(
        monthly.data.map((m) => ({
          month: m.month.slice(0, 7),
          collected: m.net_collected,
          refunds: m.refunds,
          expenses: m.operating_expenses,
          income: m.estimated_operating_income,
          reservation: m.reservation_value,
          occupied: m.occupied_nights,
          available: m.available_nights,
          occupancy: metrics(m).occupancy?.toFixed(1) ?? '',
        })),
        [
          { key: 'month', label: 'Month' },
          { key: 'collected', label: 'Net collected' },
          { key: 'refunds', label: 'Refunds' },
          { key: 'expenses', label: 'Operating expenses' },
          { key: 'income', label: 'Est. operating income' },
          { key: 'reservation', label: 'Reservation value' },
          { key: 'occupied', label: 'Occupied unit-nights' },
          { key: 'available', label: 'Available unit-nights' },
          { key: 'occupancy', label: 'Occupancy %' },
        ],
      ),
    )
  return (
    <div className="space-y-5">
      <ReportCard title="Net collected vs operating expenses">
        <RevenueExpenseChart
          currency={currency}
          data={monthly.data.map((m) => ({ label: label(m.month), collected: Number(m.net_collected), expenses: Number(m.operating_expenses) }))}
        />
      </ReportCard>
      <ReportCard title="12-month summary" onExport={exportCsv}>
        <Table>
          <THead>
            <tr>
              <TH>Month</TH>
              <TH className="text-right">Collected</TH>
              <TH className="text-right">Expenses</TH>
              <TH className="text-right">Est. income</TH>
              <TH className="hidden text-right md:table-cell">Reservation value</TH>
              <TH className="text-right">Occupancy</TH>
            </tr>
          </THead>
          <TBody>
            {monthly.data.map((m) => (
              <TR key={m.month}>
                <TD>{label(m.month)}</TD>
                <TD className="text-right tabular">{money(m.net_collected)}</TD>
                <TD className="text-right tabular">{money(m.operating_expenses)}</TD>
                <TD className="text-right tabular">{money(m.estimated_operating_income)}</TD>
                <TD className="hidden text-right tabular md:table-cell">{money(m.reservation_value)}</TD>
                <TD className="text-right tabular">{pct(metrics(m).occupancy)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Formula>Twelve months ending with the month of the period’s end date. Cash figures by payment/expense date; reservation value and occupancy by stay night.</Formula>
      </ReportCard>
    </div>
  )
}

function ExpensesTab({ f }: { f: ReportFilter }) {
  const { currency } = useOrg()
  const q = useExpensesByCategory(f)
  if (q.isPending) return <ListSkeleton />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const total = q.data.reduce((a, r) => a + r.cents, 0)
  const operating = q.data.filter((r) => r.operating).reduce((a, r) => a + r.cents, 0)
  return (
    <ReportCard
      title="Expenses by category"
      onExport={() =>
        downloadText(
          `expenses-by-category-${f.from}-${f.to}.csv`,
          toCsv(
            q.data.map((r) => ({ category: r.name, entries: r.count, amount: (r.cents / 100).toFixed(2), operating: r.operating ? 'yes' : 'no' })),
            [
              { key: 'category', label: 'Category' },
              { key: 'entries', label: 'Entries' },
              { key: 'amount', label: `Amount (${currency})` },
              { key: 'operating', label: 'Counts in operating income' },
            ],
          ),
        )
      }
    >
      {q.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses in this period.</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Category</TH>
              <TH className="text-right">Entries</TH>
              <TH className="text-right">Amount</TH>
              <TH className="text-right">Share</TH>
            </tr>
          </THead>
          <TBody>
            {q.data.map((r) => (
              <TR key={r.code}>
                <TD>
                  {r.name}
                  {!r.operating && <span className="ml-2 text-xs text-muted-foreground">(excluded from operating income)</span>}
                </TD>
                <TD className="text-right tabular">{r.count}</TD>
                <TD className="text-right tabular">{formatCents(r.cents, currency)}</TD>
                <TD className="text-right tabular">{total ? `${((r.cents / total) * 100).toFixed(1)}%` : '—'}</TD>
              </TR>
            ))}
            <TR className="font-semibold">
              <TD>Total</TD>
              <TD />
              <TD className="text-right tabular">{formatCents(total, currency)}</TD>
              <TD />
            </TR>
          </TBody>
        </Table>
      )}
      <Formula>
        Non-void expenses dated in the period. Operating expenses (counted in estimated operating income): {formatCents(operating, currency)}. Business-wide
        expenses are included unless a property filter is applied.
      </Formula>
    </ReportCard>
  )
}

function OperationsTab({ f }: { f: ReportFilter }) {
  const { currency, can } = useOrg()
  const hk = useHousekeepingStats(f)
  const mx = useMaintenanceStats(f)
  const inv = useInventoryConsumption(f)
  const costs = can('finance.view') || can('inventory.manage')
  return (
    <div className="space-y-5">
      {can('housekeeping.view') && (
        <ReportCard title="Housekeeping completion">
          {hk.isPending ? (
            <ListSkeleton rows={2} />
          ) : hk.isError ? (
            <ErrorState error={hk.error} />
          ) : (
            <>
              <KpiGrid>
                <Kpi label="Tasks scheduled" value={hk.data.total} hint={`${hk.data.cancelled} cancelled not counted`} />
                <Kpi label="Completion rate" value={hk.data.total ? pct((hk.data.completed / hk.data.total) * 100) : '—'} tone="success" />
                <Kpi label="Completed on time" value={hk.data.completed ? pct((hk.data.onTime / hk.data.completed) * 100) : '—'} />
                <Kpi label="Overdue, still open" value={hk.data.overdueOpen} tone={hk.data.overdueOpen ? 'danger' : 'default'} />
              </KpiGrid>
              {hk.data.byPerson.length > 0 && (
                <Table>
                  <THead>
                    <tr>
                      <TH>Assigned to</TH>
                      <TH className="text-right">Tasks</TH>
                      <TH className="text-right">Completed</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {hk.data.byPerson.map((p) => (
                      <TR key={p.name}>
                        <TD>{p.name}</TD>
                        <TD className="text-right tabular">{p.total}</TD>
                        <TD className="text-right tabular">{p.done}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              <Formula>
                Tasks scheduled in the period, excluding cancelled. Completion rate = completed ÷ scheduled. On time = completed at or before the due time.
                {hk.data.avgHours !== null && ` Average time from scheduled start to completion: ${hk.data.avgHours.toFixed(1)} h.`}
              </Formula>
            </>
          )}
        </ReportCard>
      )}
      {can('maintenance.view') && (
        <ReportCard title="Maintenance">
          {mx.isPending ? (
            <ListSkeleton rows={2} />
          ) : mx.isError ? (
            <ErrorState error={mx.error} />
          ) : (
            <>
              <KpiGrid>
                <Kpi label="Reported" value={mx.data.reported} hint={`${mx.data.urgent} urgent`} />
                <Kpi label="Resolved" value={mx.data.resolved} hint={mx.data.avgDays === null ? undefined : `Avg ${mx.data.avgDays.toFixed(1)} days to resolve`} />
                {costs && <Kpi label="Repair costs (resolved)" value={formatCents(mx.data.costCents, currency, { compact: true })} hint={`Estimated ${formatCents(mx.data.estimateCents, currency, { compact: true })}`} />}
              </KpiGrid>
              {costs && mx.data.byCategory.length > 0 && (
                <Table>
                  <THead>
                    <tr>
                      <TH>Category</TH>
                      <TH className="text-right">Resolved</TH>
                      <TH className="text-right">Actual cost</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {mx.data.byCategory.map((c) => (
                      <TR key={c.category}>
                        <TD>{MAINTENANCE_CATEGORY[c.category] ?? c.category}</TD>
                        <TD className="text-right tabular">{c.count}</TD>
                        <TD className="text-right tabular">{formatCents(c.cents, currency)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              <Formula>Costs are the actual costs entered on requests resolved in the period. Record payments as expenses to include them in finances.</Formula>
            </>
          )}
        </ReportCard>
      )}
      {can('inventory.view') && (
        <ReportCard
          title="Inventory consumption"
          onExport={() =>
            inv.data &&
            downloadText(
              `inventory-consumption-${f.from}-${f.to}.csv`,
              toCsv(
                inv.data.map((r) => ({ item: r.name, location: r.location, used: r.qty, unit: r.unit, value: (r.cents / 100).toFixed(2) })),
                [
                  { key: 'item', label: 'Item' },
                  { key: 'location', label: 'Location' },
                  { key: 'used', label: 'Quantity used' },
                  { key: 'unit', label: 'Unit' },
                  { key: 'value', label: `Estimated cost (${currency})` },
                ],
              ),
            )
          }
        >
          {inv.isPending ? (
            <ListSkeleton rows={2} />
          ) : inv.isError ? (
            <ErrorState error={inv.error} />
          ) : inv.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock used in this period.</p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Item</TH>
                  <TH className="hidden sm:table-cell">Location</TH>
                  <TH className="text-right">Used</TH>
                  {costs && <TH className="text-right">Est. cost</TH>}
                </tr>
              </THead>
              <TBody>
                {inv.data.map((r) => (
                  <TR key={`${r.name}-${r.location}`}>
                    <TD>{r.name}</TD>
                    <TD className="hidden text-sm sm:table-cell">{r.location}</TD>
                    <TD className="text-right tabular">
                      {r.qty} {r.unit}
                    </TD>
                    {costs && <TD className="text-right tabular">{formatCents(r.cents, currency)}</TD>}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          <Formula>“Used” movements recorded in the period. Estimated cost = quantity × the item’s current unit cost.</Formula>
        </ReportCard>
      )}
    </div>
  )
}

export function ReportsPage() {
  const { timezone, can } = useOrg()
  const today = todayISO(timezone)
  const { values, set } = useUrlFilters(FILTERS)
  const [, setParams] = useSearchParams()
  const properties = usePropertyOptions()
  const def = presetRange('this_month', today)
  const f: ReportFilter = {
    from: isISODate(values.from) ? values.from : def.from,
    to: isISODate(values.to) ? values.to : def.to,
    property: values.property,
  }
  const fin = can('reports.financial')
  const tab = values.tab || 'summary'
  const propertyName = properties.data?.find((p) => p.id === f.property)?.name

  return (
    <>
      <PageHeader
        title="Reports"
        description="Bookings, revenue, occupancy and operations, with the formula behind every figure."
        actions={
          <Button variant="outline" className="no-print" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        }
      />
      <div className="no-print mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        {tab !== 'monthly' && <DateRangeFilter from={f.from} to={f.to} today={today} onChange={(r) => set({ from: r.from, to: r.to })} />}
        <div className="space-y-1">
          <label htmlFor="rep-property" className="text-sm font-medium">
            Property
          </label>
          <NativeSelect id="rep-property" value={values.property} onChange={(e) => set({ property: e.target.value })} className="w-52">
            <option value="">All properties</option>
            {properties.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <p className="mb-3 hidden text-sm print:block">
        {formatDate(f.from)} – {formatDate(f.to)}
        {propertyName ? ` · ${propertyName}` : ' · All properties'}
      </p>
      <Tabs
        value={tab}
        onValueChange={(t) =>
          setParams(
            (p) => {
              const n = new URLSearchParams(p)
              n.set('tab', t)
              return n
            },
            { replace: true },
          )
        }
      >
        <TabsList className="no-print">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="performance">Occupancy & performance</TabsTrigger>
          {fin && <TabsTrigger value="monthly">Monthly</TabsTrigger>}
          {fin && <TabsTrigger value="expenses">Expenses</TabsTrigger>}
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <SummaryTab f={f} />
        </TabsContent>
        <TabsContent value="performance">
          <PerformanceTab f={f} />
        </TabsContent>
        {fin && (
          <TabsContent value="monthly">
            <MonthlyTab to={f.to} />
          </TabsContent>
        )}
        {fin && (
          <TabsContent value="expenses">
            <ExpensesTab f={f} />
          </TabsContent>
        )}
        <TabsContent value="operations">
          <OperationsTab f={f} />
        </TabsContent>
      </Tabs>
    </>
  )
}
