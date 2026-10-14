import { CalendarClock, CheckCircle2, ClipboardList, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState, ListSkeleton, QueryState } from '@/components/feedback/states'
import { PriorityBadge, TaskStatusBadge } from '@/components/status-badges'
import { Card } from '@/components/ui/primitives'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatDateTime } from '@/lib/date-utils'
import { TASK_TYPE } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { useTasks, type TaskListItem } from './api'

export function isOverdue(t: Pick<TaskListItem, 'status' | 'due_at'>, now = Date.now()): boolean {
  return ['pending', 'in_progress'].includes(t.status) && t.due_at !== null && new Date(t.due_at).getTime() < now
}

export function TaskCard({ t }: { t: TaskListItem }) {
  const { timezone } = useOrg()
  const done = t.items.filter((i) => i.is_completed).length
  const overdue = isOverdue(t)
  const where = t.unit && !t.unit.is_default ? `${t.property?.name} · ${t.unit.name}` : t.property?.name
  return (
    <Link
      to={`/housekeeping/${t.id}`}
      className={cn(
        'block rounded-lg border bg-surface p-3 shadow-card transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring',
        overdue && 'border-danger/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{t.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {TASK_TYPE[t.task_type]} · {where}
          </p>
        </div>
        <TaskStatusBadge status={t.status} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className={cn('flex items-center gap-1', overdue && 'font-medium text-danger')}>
          <CalendarClock className="size-3.5" aria-hidden />
          {formatDateTime(t.scheduled_at, timezone)}
          {overdue && ' · overdue'}
        </span>
        <span className="flex items-center gap-1">
          <UserRound className="size-3.5" aria-hidden />
          {t.assignee?.full_name ?? 'Unassigned'}
        </span>
        {t.items.length > 0 && (
          <span className="flex items-center gap-1">
            <CheckCircle2 className="size-3.5" aria-hidden /> {done}/{t.items.length}
          </span>
        )}
        <PriorityBadge priority={t.priority} hideNormal />
        {t.inspection_required && t.status !== 'completed' && <span className="text-ocean-700">Inspection required</span>}
      </div>
    </Link>
  )
}

/** Compact task list for a property page. */
export function TaskList({ propertyId }: { propertyId: string }) {
  const tasks = useTasks({ property: propertyId, recentDays: 14 })
  return (
    <QueryState
      query={tasks}
      loading={<ListSkeleton rows={3} />}
      isEmpty={(d) => d.active.length === 0 && d.done.length === 0}
      empty={<EmptyState icon={ClipboardList} title="No housekeeping tasks" description="Turnover cleans are created automatically for confirmed bookings." />}
    >
      {(d) => (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Open ({d.active.length})</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {d.active.map((t) => (
                <TaskCard key={t.id} t={t} />
              ))}
            </div>
          </div>
          {d.done.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Recently finished</h3>
              <Card className="divide-y">
                {d.done.map((t) => (
                  <Link key={t.id} to={`/housekeeping/${t.id}`} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-sand-50">
                    <span className="truncate">{t.title}</span>
                    <TaskStatusBadge status={t.status} />
                  </Link>
                ))}
              </Card>
            </div>
          )}
        </div>
      )}
    </QueryState>
  )
}
