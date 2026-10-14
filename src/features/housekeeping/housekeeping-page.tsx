import { CalendarDays, LogIn, LogOut, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives'
import { usePropertyOptions } from '@/features/properties/api'
import { useMemberOptions } from '@/features/workspace/members'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useUrlFilters } from '@/hooks/use-url-state'
import { addDaysISO, formatDateShort, todayISO } from '@/lib/date-utils'
import { useHousekeepingSchedule, useTasks, type TaskListItem } from './api'
import { NewTaskDialog } from './new-task-dialog'
import { isOverdue, TaskCard } from './task-list'

const FILTERS = ['property', 'assignee'] as const

function localDate(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso))
}

function Group({ title, tasks, tone, empty }: { title: string; tasks: TaskListItem[]; tone?: string; empty?: string }) {
  return (
    <section className="space-y-2">
      <h2 className={`text-sm font-semibold ${tone ?? ''}`}>
        {title} <span className="text-muted-foreground">({tasks.length})</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{empty ?? 'Nothing here.'}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((t) => (
            <TaskCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </section>
  )
}

function Schedule({ today }: { today: string }) {
  const to = addDaysISO(today, 6)
  const schedule = useHousekeepingSchedule(today, to)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4" aria-hidden /> Next 7 days
        </CardTitle>
      </CardHeader>
      <CardContent>
        {schedule.isPending ? (
          <ListSkeleton rows={2} />
        ) : schedule.isError ? (
          <ErrorState error={schedule.error} onRetry={() => void schedule.refetch()} />
        ) : schedule.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No arrivals or departures this week.</p>
        ) : (
          <ul className="divide-y text-sm">
            {schedule.data.flatMap((s) => {
              const where = s.unit_name === 'Entire property' ? s.property_name : `${s.property_name} · ${s.unit_name}`
              const rows: Array<{ key: string; date: string; kind: 'in' | 'out' }> = []
              if (s.check_out_date >= today && s.check_out_date <= to) rows.push({ key: `${s.booking_id}-out`, date: s.check_out_date, kind: 'out' })
              if (s.check_in_date >= today && s.check_in_date <= to) rows.push({ key: `${s.booking_id}-in`, date: s.check_in_date, kind: 'in' })
              return rows.map((r) => ({ ...r, where, s }))
            })
              .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'out' ? -1 : 1))
              .map(({ key, date, kind, where, s }) => (
                <li key={key} className="flex items-start gap-3 py-2">
                  {kind === 'out' ? (
                    <LogOut className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Departure" />
                  ) : (
                    <LogIn className="mt-0.5 size-4 shrink-0 text-info" aria-label="Arrival" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">
                      {date === today ? 'Today' : formatDateShort(date)} · {kind === 'out' ? 'Departure' : 'Arrival'}
                    </p>
                    <p className="text-muted-foreground">
                      {where} · {s.guest_first_name}, {s.guest_count} guest{s.guest_count === 1 ? '' : 's'}
                    </p>
                    {kind === 'in' && s.guest_requests && <p className="text-xs text-ocean-700">Request: {s.guest_requests}</p>}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function HousekeepingPage() {
  const { can, timezone, role } = useOrg()
  const today = todayISO(timezone)
  const { values, set } = useUrlFilters(FILTERS)
  const assignee = values.assignee || (role === 'housekeeping' ? 'me' : '')
  const tasks = useTasks({ property: values.property, assignee })
  const properties = usePropertyOptions()
  const staff = useMemberOptions()
  const [creating, setCreating] = useState(false)

  const active = tasks.data?.active ?? []
  const overdue = active.filter((t) => isOverdue(t))
  const awaiting = active.filter((t) => t.status === 'awaiting_inspection')
  const rest = active.filter((t) => !overdue.includes(t) && !awaiting.includes(t))
  const todays = rest.filter((t) => localDate(t.scheduled_at, timezone) <= today)
  const upcoming = rest.filter((t) => localDate(t.scheduled_at, timezone) > today)
  const completed = (tasks.data?.done ?? []).filter((t) => t.status === 'completed')

  return (
    <>
      <PageHeader
        title="Housekeeping"
        description="Cleaning, inspections and turnovers. Turnover cleans are created automatically for confirmed stays."
        actions={
          can('housekeeping.manage') && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New task
            </Button>
          )
        }
      />
      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <NativeSelect aria-label="Property" value={values.property} onChange={(e) => set({ property: e.target.value })} className="sm:w-52">
          <option value="">All properties</option>
          {properties.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Assigned to" value={assignee} onChange={(e) => set({ assignee: e.target.value || (role === 'housekeeping' ? 'all' : '') })} className="sm:w-52">
          <option value={role === 'housekeeping' ? 'all' : ''}>Everyone</option>
          <option value="me">My tasks</option>
          <option value="unassigned">Unassigned</option>
          {can('housekeeping.manage') &&
            staff.data?.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name}
              </option>
            ))}
        </NativeSelect>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {tasks.isPending ? (
            <ListSkeleton />
          ) : tasks.isError ? (
            <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
          ) : active.length === 0 && completed.length === 0 ? (
            <EmptyState icon={Sparkles} title="All clear" description="No open housekeeping tasks." />
          ) : (
            <>
              {overdue.length > 0 && <Group title="Overdue" tasks={overdue} tone="text-danger" />}
              <Group title="Today" tasks={todays} empty="Nothing scheduled for today." />
              {awaiting.length > 0 && <Group title="Awaiting inspection" tasks={awaiting} tone="text-ocean-700" />}
              <Group title="Upcoming" tasks={upcoming} empty="Nothing upcoming." />
              {completed.length > 0 && <Group title="Completed in the last 7 days" tasks={completed} tone="text-success" />}
            </>
          )}
        </div>
        <aside>
          <Schedule today={today} />
        </aside>
      </div>
      {creating && <NewTaskDialog open onOpenChange={setCreating} propertyId={values.property || undefined} />}
    </>
  )
}
