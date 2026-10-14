import { Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, ListSkeleton, QueryState } from '@/components/feedback/states'
import { MaintenanceStatusBadge, PriorityBadge } from '@/components/status-badges'
import { Pagination } from '@/components/tables/pagination'
import { Card } from '@/components/ui/primitives'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatDate, formatDateTime, todayISO } from '@/lib/date-utils'
import { MAINTENANCE_CATEGORY } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { useMaintenanceList, type MaintenanceListItem } from './api'

export function isMaintenanceOverdue(r: Pick<MaintenanceListItem, 'status' | 'target_date'>, today: string) {
  return !['resolved', 'closed'].includes(r.status) && r.target_date !== null && r.target_date < today
}

export function MaintenanceRows({ rows, showProperty = true }: { rows: MaintenanceListItem[]; showProperty?: boolean }) {
  const { timezone } = useOrg()
  const today = todayISO(timezone)
  return (
    <Card className="divide-y">
      {rows.map((r) => {
        const overdue = isMaintenanceOverdue(r, today)
        const where = r.unit && !r.unit.is_default ? `${r.property?.name} · ${r.unit.name}` : r.property?.name
        return (
          <Link
            key={r.id}
            to={`/maintenance/${r.id}`}
            className={cn('flex flex-wrap items-start gap-3 p-4 hover:bg-sand-50/60', r.priority === 'urgent' && 'border-l-4 border-l-danger')}
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.title}</p>
              <p className="text-xs text-muted-foreground">
                {MAINTENANCE_CATEGORY[r.category] ?? r.category}
                {showProperty && ` · ${where}`} · reported {formatDateTime(r.reported_at, timezone, { dateOnly: true })}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.assignee?.full_name ? `Assigned to ${r.assignee.full_name}` : r.technician_name ? `Technician: ${r.technician_name}` : 'Unassigned'}
                {r.target_date && (
                  <span className={cn(overdue && 'font-medium text-danger')}>
                    {' '}
                    · target {formatDate(r.target_date)}
                    {overdue && ' (overdue)'}
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <MaintenanceStatusBadge status={r.status} />
              <PriorityBadge priority={r.priority} hideNormal />
            </div>
          </Link>
        )
      })}
    </Card>
  )
}

/** Open requests for a property (property page tab). */
export function MaintenanceTable({ propertyId }: { propertyId: string }) {
  const [page, setPage] = useState(1)
  const q = useMaintenanceList({ property: propertyId, status: 'all', page, pageSize: 10 })
  return (
    <QueryState
      query={q}
      loading={<ListSkeleton rows={3} />}
      isEmpty={(d) => d.rows.length === 0}
      empty={<EmptyState icon={Wrench} title="No maintenance requests" />}
    >
      {(d) => (
        <>
          <MaintenanceRows rows={d.rows} showProperty={false} />
          <Pagination page={page} total={d.total} size={10} onPage={setPage} />
        </>
      )}
    </QueryState>
  )
}
