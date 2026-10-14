import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  BedDouble,
  Building2,
  CalendarCheck,
  DoorClosed,
  DoorOpen,
  MessageCircle,
  Receipt,
  Scale,
  Sparkles,
  TrendingUp,
  Wrench,
} from 'lucide-react'
import { useMemo } from 'react'
import type * as React from 'react'
import { Link, useNavigate } from 'react-router'
import { RevenueExpenseChart, OccupancyChart } from '@/components/charts/charts'
import { EmptyState, ErrorState, KpiSkeleton } from '@/components/feedback/states'
import { Kpi, KpiGrid } from '@/components/kpi'
import { PageHeader } from '@/components/layout/page-header'
import { Money } from '@/components/money'
import { BookingStatusBadge, MaintenanceStatusBadge, PriorityBadge } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/auth-provider'
import type { BookingOverview } from '@/features/bookings/api'
import { stayLabel } from '@/features/bookings/booking-table'
import { useCalendarData } from '@/features/calendar/api'
import { buildUnitRows, Timeline } from '@/features/calendar/calendar-page'
import { useFinanceSummary, useLedger } from '@/features/finances/api'
import { useTasks } from '@/features/housekeeping/api'
import { isOverdue, TaskCard } from '@/features/housekeeping/task-list'
import { usePropertyOptions } from '@/features/properties/api'
import { metrics, useDashboardToday, useMonthly, usePropertyPerformance } from '@/features/reports/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatCents, toCents } from '@/lib/currency'
import { addDaysISO, formatDate, monthBounds, parseISODate, todayISO, toISODate } from '@/lib/date-utils'
import { PAYMENT_TYPE } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import { MessagesPanel } from '@/features/comms/messages-panel'

function greeting(timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function useTodayBookings(today: string, enabled: boolean) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['bookings', orgId, 'today-movements', today],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings_overview')
        .select('*')
        .eq('organization_id', orgId)
        .or(`check_in_date.eq.${today},check_out_date.eq.${today}`)
        .in('status', ['pending', 'confirmed', 'checked_in', 'checked_out'])
      if (error) throw error
      return data as BookingOverview[]
    },
  })
}

function useOverduePayments(today: string, dueDays: number, enabled: boolean) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['bookings', orgId, 'overdue', today, dueDays],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings_overview')
        .select('*')
        .eq('organization_id', orgId)
        .in('status', ['pending', 'confirmed', 'checked_in'])
        .gt('balance_due', 0)
        .lte('check_in_date', addDaysISO(today, dueDays))
        .order('check_in_date')
        .limit(6)
      if (error) throw error
      return data as BookingOverview[]
    },
  })
}

function useAttentionMaintenance(today: string, enabled: boolean) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['maintenance', orgId, 'attention', today],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('id, title, priority, status, target_date, property:properties(name)')
        .eq('organization_id', orgId)
        .not('status', 'in', '(resolved,closed)')
        .or(`priority.in.(urgent,high),target_date.lt.${today}`)
        .order('reported_at', { ascending: false })
        .limit(6)
      if (error) throw error
      return data
    },
  })
}

function SetupState() {
  return (
    <EmptyState
      icon={Building2}
      title="Add your first property"
      description="Start by adding a holiday home or apartment. It gets a rentable unit automatically, ready for bookings. Then invite your caretakers from Settings."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/properties/new">Add property</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/settings/staff">Invite staff</Link>
          </Button>
        </div>
      }
    />
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const { org, can, timezone, currency, settings } = useOrg()
  const navigate = useNavigate()
  const name = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0]
  const today = todayISO(timezone)
  const month = monthBounds(today)
  const sixMonthsAgo = toISODate(new Date(parseISODate(month.start).getFullYear(), parseISODate(month.start).getMonth() - 5, 1))
  const ops = can('booking.view')
  const fin = can('finance.view')
  const hk = can('housekeeping.view')
  const mx = can('maintenance.view')

  const snapshot = useDashboardToday()
  const finance = useFinanceSummary(month.start, month.end)
  const monthly = useMonthly(sixMonthsAgo, 6, fin)
  const perf = usePropertyPerformance(month.start, month.end, ops)
  const movements = useTodayBookings(today, ops)
  const overdue = useOverduePayments(today, settings?.balance_due_days_before_arrival ?? 3, fin)
  const maint = useAttentionMaintenance(today, mx)
  const tasks = useTasks({})
  const ledger = useLedger({ page: 1 })
  const properties = usePropertyOptions()
  const week = useCalendarData(today, addDaysISO(today, 7), '', false)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(today, i)), [today])
  const weekRows = useMemo(() => buildUnitRows(properties.data, week.data?.bookings), [properties.data, week.data])

  const s = snapshot.data
  const f = finance.data
  const money = (v: number | undefined) => formatCents(toCents(v ?? 0), currency, { compact: true })
  const arrivals = (movements.data ?? []).filter((b) => b.check_in_date === today)
  const departures = (movements.data ?? []).filter((b) => b.check_out_date === today)
  const active = tasks.data?.active ?? []
  const attention = active.filter((t) => isOverdue(t) || t.status === 'awaiting_inspection' || new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(t.scheduled_at)) <= today)

  if (snapshot.isPending) {
    return (
      <>
        <PageHeader title={`${greeting(timezone)}${name ? `, ${name}` : ''}`} description={org.name} />
        <KpiSkeleton count={8} />
      </>
    )
  }
  if (snapshot.isError) return <ErrorState error={snapshot.error} onRetry={() => void snapshot.refetch()} />

  const header = (
    <PageHeader
      title={`${greeting(timezone)}${name ? `, ${name}` : ''}`}
      description={`${org.name} · ${formatDate(today)}`}
      actions={
        can('booking.manage') &&
        (s?.properties ?? 0) > 0 && (
          <Button asChild>
            <Link to="/bookings/new">
              <CalendarCheck /> New booking
            </Link>
          </Button>
        )
      }
    />
  )

  if ((s?.properties ?? 0) === 0 && can('property.create')) {
    return (
      <>
        {header}
        <SetupState />
      </>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      <KpiGrid>
        {ops && <Kpi icon={Building2} label="Properties" value={s?.properties ?? 0} hint={`${s?.active_units ?? 0} rentable units`} />}
        {ops && <Kpi icon={BedDouble} tone="info" label="Occupied tonight" value={s?.occupied_units ?? 0} hint={s?.blocked_units ? `${s.blocked_units} blocked` : undefined} />}
        {ops && <Kpi icon={BedDouble} tone="success" label="Available tonight" value={s?.available_units ?? 0} />}
        {ops && <Kpi icon={DoorOpen} tone="info" label="Arrivals today" value={s?.arrivals ?? 0} />}
        {ops && <Kpi icon={DoorClosed} tone="warning" label="Departures today" value={s?.departures ?? 0} />}
        {fin && <Kpi icon={ArrowDownLeft} tone="success" label="Collected this month" value={f ? money(f.net_collected) : '…'} hint="Payments − refunds" />}
        {fin && <Kpi icon={Receipt} tone="danger" label="Expenses this month" value={f ? money(f.expenses_operating) : '…'} hint="Operating categories" />}
        {fin && (
          <Kpi
            icon={TrendingUp}
            tone={(f?.estimated_operating_income ?? 0) >= 0 ? 'success' : 'danger'}
            label="Est. operating income"
            value={f ? money(f.estimated_operating_income) : '…'}
            hint="Not accounting profit"
          />
        )}
        {fin && <Kpi icon={Scale} tone="warning" label="Outstanding balances" value={f ? money(f.outstanding_balance) : '…'} hint="Owed by guests" />}
        {!ops && hk && <Kpi icon={Sparkles} tone="warning" label="Tasks needing attention" value={attention.length} />}
      </KpiGrid>

      {ops && (
        <Panel
          title="Next 7 days"
          action={
            <Button asChild variant="link" size="sm">
              <Link to="/calendar?view=week">Open calendar</Link>
            </Button>
          }
        >
          {week.isPending || properties.isPending ? (
            <Skeleton className="h-32" />
          ) : weekRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No units yet.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <Timeline
                view="week"
                days={weekDays}
                today={today}
                rows={weekRows}
                bookings={week.data?.bookings ?? []}
                blocks={week.data?.blocks ?? []}
                selection={null}
                onCell={(row, day) => can('booking.manage') && navigate(`/bookings/new?property=${row.property.id}&unit=${row.unitId}&check_in=${day}`)}
                onBooking={(id) => navigate(`/bookings/${id}`)}
                onBlock={() => navigate('/calendar?view=week')}
              />
            </div>
          )}
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {ops && (
          <Panel title={`Today’s arrivals & departures`}>
            {movements.isPending ? (
              <Skeleton className="h-20" />
            ) : arrivals.length + departures.length === 0 ? (
              <p className="text-sm text-muted-foreground">No arrivals or departures today.</p>
            ) : (
              <ul className="divide-y text-sm">
                {[...arrivals.map((b) => ['in', b] as const), ...departures.map((b) => ['out', b] as const)].map(([kind, b]) => (
                  <li key={`${kind}-${b.id}`}>
                    <Link to={`/bookings/${b.id}`} className="flex items-center gap-3 py-2.5 hover:bg-sand-50">
                      {kind === 'in' ? (
                        <DoorOpen className="size-4 text-info" aria-label="Arrival" />
                      ) : (
                        <DoorClosed className="size-4 text-warning" aria-label="Departure" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{b.guest_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {kind === 'in' ? 'Arriving' : 'Leaving'} · {stayLabel(b)}
                        </span>
                      </span>
                      <BookingStatusBadge status={b.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {hk && (
          <Panel
            title="Housekeeping needing attention"
            action={
              <Button asChild variant="link" size="sm">
                <Link to="/housekeeping">All tasks</Link>
              </Button>
            }
          >
            {tasks.isPending ? (
              <Skeleton className="h-20" />
            ) : attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due today.</p>
            ) : (
              <div className="space-y-2">
                {attention.slice(0, 4).map((t) => (
                  <TaskCard key={t.id} t={t} />
                ))}
                {attention.length > 4 && <p className="text-xs text-muted-foreground">+{attention.length - 4} more</p>}
              </div>
            )}
          </Panel>
        )}

        {fin && (
          <Panel
            title="Overdue payments"
            action={
              <Button asChild variant="link" size="sm">
                <Link to="/finances?tab=outstanding">All balances</Link>
              </Button>
            }
          >
            {overdue.isPending ? (
              <Skeleton className="h-20" />
            ) : (overdue.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No balances are overdue.</p>
            ) : (
              <ul className="divide-y text-sm">
                {overdue.data!.map((b) => (
                  <li key={b.id}>
                    <Link to={`/bookings/${b.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-sand-50">
                      <span className="min-w-0">
                        <span className="block font-medium">{b.guest_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          Arrives {formatDate(b.check_in_date)} · {stayLabel(b)}
                        </span>
                      </span>
                      <Money value={b.balance_due} currency={currency} className="font-medium text-warning" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {mx && (
          <Panel
            title="Urgent & overdue maintenance"
            action={
              <Button asChild variant="link" size="sm">
                <Link to="/maintenance">All requests</Link>
              </Button>
            }
          >
            {maint.isPending ? (
              <Skeleton className="h-20" />
            ) : (maint.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No urgent repairs.</p>
            ) : (
              <ul className="divide-y text-sm">
                {maint.data!.map((r) => (
                  <li key={r.id}>
                    <Link to={`/maintenance/${r.id}`} className="flex items-center gap-3 py-2.5 hover:bg-sand-50">
                      <Wrench className="size-4 text-danger" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{r.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.property?.name}
                          {r.target_date && ` · target ${formatDate(r.target_date)}`}
                        </span>
                      </span>
                      <PriorityBadge priority={r.priority} hideNormal />
                      <MaintenanceStatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      {can('comms.send') && <MessagesPanel compact />}

      {fin && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel
            title="Collected vs expenses — last 6 months"
            action={
              <Button asChild variant="link" size="sm">
                <Link to="/reports">Reports</Link>
              </Button>
            }
          >
            {monthly.isPending ? (
              <Skeleton className="h-64" />
            ) : monthly.isError ? (
              <ErrorState error={monthly.error} onRetry={() => void monthly.refetch()} />
            ) : (
              <RevenueExpenseChart
                currency={currency}
                data={monthly.data.map((m) => ({
                  label: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(parseISODate(m.month)),
                  collected: Number(m.net_collected),
                  expenses: Number(m.operating_expenses),
                }))}
              />
            )}
          </Panel>
          <Panel title="Recent transactions">
            {ledger.isPending ? (
              <Skeleton className="h-40" />
            ) : (ledger.data?.rows.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {ledger.data!.rows.slice(0, 6).map((p) => {
                  const out = p.payment_type === 'refund' || p.payment_type === 'reversal'
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block font-medium">{p.booking?.guest?.full_name ?? '—'}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(p.payment_date)} · {PAYMENT_TYPE[p.payment_type]}
                        </span>
                      </span>
                      <span className={out ? 'text-danger' : ''}>
                        {out && '− '}
                        <Money value={p.amount} currency={currency} />
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {ops && (perf.data?.length ?? 0) > 0 && (
        <Panel
          title="Property performance this month"
          action={
            <Button asChild variant="link" size="sm">
              <Link to="/reports?tab=performance">Details</Link>
            </Button>
          }
        >
          <OccupancyChart data={perf.data!.map((r) => ({ name: r.property_name, occupancy: metrics(r).occupancy }))} />
          <p className="mt-2 text-xs text-muted-foreground">
            Occupancy = occupied unit-nights ÷ available unit-nights (blocked nights excluded).
          </p>
        </Panel>
      )}

      {!ops && !hk && !fin && (
        <EmptyState icon={MessageCircle} title={`Welcome to ${org.name}`} description="Use the menu to open the areas available to your role." />
      )}
    </div>
  )
}
