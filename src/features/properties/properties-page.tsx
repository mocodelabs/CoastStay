import { BedDouble, Building2, ImageOff, MapPin, Plus, Users } from 'lucide-react'
import { Link } from 'react-router'
import { CardGridSkeleton, EmptyState, QueryState } from '@/components/feedback/states'
import { SearchInput } from '@/components/forms/search-input'
import { PageHeader } from '@/components/layout/page-header'
import { Money } from '@/components/money'
import { Pagination } from '@/components/tables/pagination'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { Badge, Card } from '@/components/ui/primitives'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useUrlFilters } from '@/hooks/use-url-state'
import { PROPERTY_TYPE } from '@/lib/labels'
import { useSignedUrls } from '@/lib/storage'
import { PROPERTY_TYPES } from '@/schemas/property'
import { useProperties, type PropertyListItem } from './api'

const FILTERS = ['q', 'status', 'type'] as const

function PropertyCard({ p, cover }: { p: PropertyListItem; cover?: string }) {
  const activeUnits = p.units.filter((u) => u.status === 'active').length
  return (
    <Link to={`/properties/${p.id}`} className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
      <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md">
        <div className="relative aspect-[16/10] bg-sand-100">
          {cover ? (
            <img src={cover} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="flex size-full items-center justify-center text-sand-400">
              <ImageOff className="size-8" aria-hidden />
            </div>
          )}
          {p.status === 'inactive' && (
            <Badge tone="muted" className="absolute top-3 left-3">
              Inactive
            </Badge>
          )}
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold group-hover:text-primary">{p.name}</h3>
            <Badge tone="neutral">{PROPERTY_TYPE[p.property_type]}</Badge>
          </div>
          {(p.location_name || p.county) && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5" aria-hidden />
              {[p.location_name, p.county].filter(Boolean).join(', ')}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-charcoal-700">
            <span className="flex items-center gap-1.5">
              <BedDouble className="size-4 text-muted-foreground" aria-hidden /> {p.bedrooms} bd · {p.bathrooms} ba
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-4 text-muted-foreground" aria-hidden /> {p.max_guests} guests
            </span>
            {activeUnits > 1 && <span>{activeUnits} units</span>}
          </div>
          <p className="text-sm">
            <Money value={p.standard_nightly_rate} compact className="font-semibold" />
            <span className="text-muted-foreground"> / night</span>
          </p>
        </div>
      </Card>
    </Link>
  )
}

export function PropertiesPage() {
  const { can } = useOrg()
  const { values, page, set, clear, active } = useUrlFilters(FILTERS)
  const query = useProperties({ search: values.q, status: values.status, type: values.type, page })
  const covers = (query.data?.rows ?? [])
    .map((p) => [...p.photos].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path)
    .filter((x): x is string => Boolean(x))
  const urls = useSignedUrls('property-photos', covers)

  return (
    <>
      <PageHeader
        title="Properties"
        description="Your holiday homes, their units, photos and rates."
        actions={
          can('property.create') && (
            <Button asChild>
              <Link to="/properties/new">
                <Plus /> Add property
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={values.q} onChange={(q) => set({ q })} placeholder="Search by name or location" className="sm:max-w-xs sm:flex-1" />
        <NativeSelect aria-label="Status" value={values.status} onChange={(e) => set({ status: e.target.value })} className="sm:w-40">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </NativeSelect>
        <NativeSelect aria-label="Type" value={values.type} onChange={(e) => set({ type: e.target.value })} className="sm:w-40">
          <option value="">All types</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {PROPERTY_TYPE[t]}
            </option>
          ))}
        </NativeSelect>
        {active && (
          <Button variant="ghost" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>
      <QueryState
        query={query}
        loading={<CardGridSkeleton />}
        isEmpty={(d) => d.rows.length === 0}
        empty={
          active ? (
            <EmptyState title="No properties match these filters" action={<Button variant="outline" onClick={clear}>Clear filters</Button>} />
          ) : (
            <EmptyState
              icon={Building2}
              title="No properties yet"
              description={can('property.create') ? 'Add your first holiday home to start taking bookings.' : 'No properties have been assigned to you yet.'}
              action={
                can('property.create') && (
                  <Button asChild>
                    <Link to="/properties/new">
                      <Plus /> Add property
                    </Link>
                  </Button>
                )
              }
            />
          )
        }
      >
        {(d) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {d.rows.map((p) => {
                const path = [...p.photos].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path
                return <PropertyCard key={p.id} p={p} cover={path ? urls.data?.[path] : undefined} />
              })}
            </div>
            <Pagination page={page} total={d.total} size={24} onPage={(p) => set({ page: p })} />
          </>
        )}
      </QueryState>
    </>
  )
}
