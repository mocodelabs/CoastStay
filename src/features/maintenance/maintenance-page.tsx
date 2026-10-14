import { Plus, Wrench } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ListSkeleton, QueryState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { Pagination } from '@/components/tables/pagination'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { usePropertyOptions } from '@/features/properties/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useUrlFilters } from '@/hooks/use-url-state'
import { MAINTENANCE_STATUS, MAINTENANCE_STATUSES, PRIORITIES, PRIORITY } from '@/lib/labels'
import { useMaintenanceList } from './api'
import { MaintenanceDialog } from './maintenance-form'
import { MaintenanceRows } from './maintenance-table'

const FILTERS = ['property', 'status', 'priority'] as const

export function MaintenancePage() {
  const { can } = useOrg()
  const { values, page, set, active, clear } = useUrlFilters(FILTERS)
  const properties = usePropertyOptions()
  const list = useMaintenanceList({ ...values, page })
  const [creating, setCreating] = useState(false)

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Repairs and issues across your properties, most urgent first."
        actions={
          can('maintenance.report') && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Report issue
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <NativeSelect aria-label="Status" value={values.status} onChange={(e) => set({ status: e.target.value })} className="sm:w-48">
          <option value="">Open</option>
          <option value="all">All statuses</option>
          {MAINTENANCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MAINTENANCE_STATUS[s].label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Priority" value={values.priority} onChange={(e) => set({ priority: e.target.value })} className="sm:w-40">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY[p].label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Property" value={values.property} onChange={(e) => set({ property: e.target.value })} className="sm:w-52">
          <option value="">All properties</option>
          {properties.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        {active && (
          <Button variant="ghost" onClick={clear}>
            Clear
          </Button>
        )}
      </div>
      <QueryState
        query={list}
        loading={<ListSkeleton />}
        isEmpty={(d) => d.rows.length === 0}
        empty={<EmptyState icon={Wrench} title={values.status ? 'No requests match' : 'No open maintenance requests'} description="Report leaks, broken appliances and other issues here." />}
      >
        {(d) => (
          <>
            <MaintenanceRows rows={d.rows} />
            <Pagination page={page} total={d.total} onPage={(p) => set({ page: p })} />
          </>
        )}
      </QueryState>
      {creating && <MaintenanceDialog open onOpenChange={setCreating} propertyId={values.property || undefined} />}
    </>
  )
}
