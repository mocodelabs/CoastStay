import { BedDouble, CalendarPlus, Clock, KeyRound, MapPin, MoreVertical, Pencil, Power, UserRound, Users, Wifi } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { ErrorState } from '@/components/feedback/states'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Money } from '@/components/money'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menu'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives'
import { BookingTable } from '@/features/bookings/booking-table'
import { PropertyFinanceSummary } from '@/features/finances/property-finance'
import { TaskList } from '@/features/housekeeping/task-list'
import { InventoryTable } from '@/features/inventory/inventory-table'
import { MaintenanceTable } from '@/features/maintenance/maintenance-table'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatTime } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { PROPERTY_TYPE } from '@/lib/labels'
import { formatPhone } from '@/lib/phone'
import { useProperty, useUpdateProperty, type PropertyDetail } from './api'
import { PhotoManager } from './photo-manager'
import { UnitsTab } from './units-tab'

function InfoRow({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <div className="text-sm whitespace-pre-line">{children}</div>
      </div>
    </div>
  )
}

function Overview({ p, editable }: { p: PropertyDetail; editable: boolean }) {
  const { settings } = useOrg()
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoManager propertyId={p.id} photos={p.photos} editable={editable} />
          </CardContent>
        </Card>
        {p.description && (
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-line text-charcoal-700">{p.description}</CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Arrival & departure</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <InfoRow icon={Clock} label="Check-in / check-out">
              From {formatTime(p.check_in_time ?? settings?.default_check_in_time)} · by{' '}
              {formatTime(p.check_out_time ?? settings?.default_check_out_time)}
            </InfoRow>
            <InfoRow icon={Wifi} label="Wi-Fi">
              {p.wifi_name ? `${p.wifi_name}${p.wifi_password ? ` · ${p.wifi_password}` : ''}` : '—'}
            </InfoRow>
            <InfoRow icon={KeyRound} label="Check-in instructions">
              {p.check_in_instructions || '—'}
            </InfoRow>
            <InfoRow icon={KeyRound} label="Check-out instructions">
              {p.check_out_instructions || '—'}
            </InfoRow>
            <InfoRow icon={MapPin} label="Directions">
              {p.directions || '—'}
            </InfoRow>
            <InfoRow icon={MapPin} label="House rules">
              {p.house_rules || '—'}
            </InfoRow>
          </CardContent>
        </Card>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow icon={MapPin} label="Location">
              {[p.location_name, p.county].filter(Boolean).join(', ') || '—'}
              {p.address && <span className="block text-muted-foreground">{p.address}</span>}
              {p.latitude !== null && p.longitude !== null && (
                <a
                  className="text-primary hover:underline"
                  href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Google Maps
                </a>
              )}
            </InfoRow>
            <InfoRow icon={BedDouble} label="Rooms">
              {p.bedrooms} bedrooms · {p.bathrooms} bathrooms
            </InfoRow>
            <InfoRow icon={Users} label="Capacity & rates">
              Up to {p.max_guests} guests
              <br />
              <Money value={p.standard_nightly_rate} compact /> / night · cleaning <Money value={p.cleaning_fee} compact />
            </InfoRow>
            <InfoRow icon={UserRound} label="Caretaker">
              {p.caretaker ? `${p.caretaker.full_name}${p.caretaker.phone ? ` · ${formatPhone(p.caretaker.phone)}` : ''}` : '—'}
            </InfoRow>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Amenities</CardTitle>
          </CardHeader>
          <CardContent>
            {p.amenities.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {p.amenities.map((a) => (
                  <li key={a}>
                    <Badge tone="neutral">{a}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None listed.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const TABS = ['overview', 'units', 'bookings', 'housekeeping', 'maintenance', 'inventory', 'finance'] as const

export function PropertyDetailPage() {
  const { id = '' } = useParams()
  const { can } = useOrg()
  const [params, setParams] = useSearchParams()
  const property = useProperty(id)
  const update = useUpdateProperty(id)
  const [confirmStatus, setConfirmStatus] = useState(false)
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? params.get('tab')! : 'overview'

  if (property.isPending) return <PageSkeleton />
  if (property.isError) return <ErrorState error={property.error} onRetry={() => void property.refetch()} />
  const p = property.data
  const editable = can('property.edit')

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">
            <Link to="/properties" className="hover:underline">
              Properties
            </Link>{' '}
            / {PROPERTY_TYPE[p.property_type]}
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {p.name}
            {p.status === 'inactive' && <Badge tone="muted">Inactive</Badge>}
          </h1>
          {(p.location_name || p.county) && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5" aria-hidden /> {[p.location_name, p.county].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {can('booking.manage') && p.status === 'active' && (
            <Button asChild>
              <Link to={`/bookings/new?property=${p.id}`}>
                <CalendarPlus /> New booking
              </Link>
            </Button>
          )}
          {editable && (
            <>
              <Button asChild variant="outline">
                <Link to={`/properties/${p.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem destructive={p.status === 'active'} onSelect={() => setConfirmStatus(true)}>
                    <Power /> {p.status === 'active' ? 'Deactivate property' : 'Reactivate property'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(t) => setParams({ tab: t }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="units">Units ({p.units.length})</TabsTrigger>
          {can('booking.view') && <TabsTrigger value="bookings">Bookings</TabsTrigger>}
          {can('housekeeping.view') && <TabsTrigger value="housekeeping">Housekeeping</TabsTrigger>}
          {can('maintenance.view') && <TabsTrigger value="maintenance">Maintenance</TabsTrigger>}
          {can('inventory.view') && <TabsTrigger value="inventory">Inventory</TabsTrigger>}
          {can('finance.view') && <TabsTrigger value="finance">Financial summary</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview">
          <Overview p={p} editable={editable} />
        </TabsContent>
        <TabsContent value="units">
          <UnitsTab property={p} editable={editable} />
        </TabsContent>
        {can('booking.view') && (
          <TabsContent value="bookings">
            <BookingTable propertyId={p.id} />
          </TabsContent>
        )}
        {can('housekeeping.view') && (
          <TabsContent value="housekeeping">
            <TaskList propertyId={p.id} />
          </TabsContent>
        )}
        {can('maintenance.view') && (
          <TabsContent value="maintenance">
            <MaintenanceTable propertyId={p.id} />
          </TabsContent>
        )}
        {can('inventory.view') && (
          <TabsContent value="inventory">
            <InventoryTable propertyId={p.id} />
          </TabsContent>
        )}
        {can('finance.view') && (
          <TabsContent value="finance">
            <PropertyFinanceSummary propertyId={p.id} />
          </TabsContent>
        )}
      </Tabs>

      <ConfirmDialog
        open={confirmStatus}
        onOpenChange={setConfirmStatus}
        title={p.status === 'active' ? `Deactivate ${p.name}?` : `Reactivate ${p.name}?`}
        description={
          p.status === 'active'
            ? 'It will stop accepting new reservations. Existing bookings, history and finances are kept.'
            : 'It will accept reservations again.'
        }
        confirmLabel={p.status === 'active' ? 'Deactivate' : 'Reactivate'}
        destructive={p.status === 'active'}
        onConfirm={async () => {
          try {
            await update.mutateAsync({ status: p.status === 'active' ? 'inactive' : 'active' })
            toast.success(p.status === 'active' ? 'Property deactivated.' : 'Property reactivated.')
          } catch (e) {
            toast.error(toUserMessage(e))
            throw e
          }
        }}
      />
    </>
  )
}
