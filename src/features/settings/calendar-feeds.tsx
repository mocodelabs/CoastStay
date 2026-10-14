import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarSync, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { ListSkeleton, QueryState } from '@/components/feedback/states'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Badge, Switch } from '@/components/ui/primitives'
import { usePropertyOptions } from '@/features/properties/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatDate, formatDateTime } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { BOOKING_SOURCE } from '@/lib/labels'
import { supabase } from '@/lib/supabase'

const SOURCES = ['airbnb', 'booking_com', 'other'] as const

function useFeeds() {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['calendar-feeds', orgId],
    queryFn: async () => {
      const [feeds, conflicts] = await Promise.all([
        supabase
          .from('calendar_feeds')
          .select('id, name, source, is_active, last_synced_at, last_status, last_error, property:properties(name), unit:property_units(name, is_default)')
          .eq('organization_id', orgId)
          .order('created_at'),
        supabase
          .from('external_calendar_events')
          .select('id, feed_id, start_date, end_date, summary')
          .eq('organization_id', orgId)
          .eq('status', 'conflict')
          .order('start_date'),
      ])
      if (feeds.error) throw feeds.error
      if (conflicts.error) throw conflicts.error
      return { feeds: feeds.data, conflicts: conflicts.data }
    },
  })
}

function AddFeedDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const properties = usePropertyOptions()
  const [propertyId, setPropertyId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [source, setSource] = useState<(typeof SOURCES)[number]>('airbnb')
  const [url, setUrl] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const property = properties.data?.find((p) => p.id === propertyId)
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('calendar_feeds').insert({
        organization_id: orgId,
        property_id: propertyId,
        unit_id: unitId,
        source,
        name: `${BOOKING_SOURCE[source]} — ${property?.name ?? ''}`.slice(0, 80),
        url: url.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Calendar feed added. Run a sync to import its dates.')
      void qc.invalidateQueries({ queryKey: ['calendar-feeds', orgId] })
      onOpenChange(false)
    },
    onError: (e) => setErr(toUserMessage(e)),
  })
  return (
    <Dialog open={open} onOpenChange={(o) => !add.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a calendar feed</DialogTitle>
          <DialogDescription>
            Paste the platform’s export link (Airbnb: Listing → Availability → Connect calendars → Export). The link is private — only owners can see it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormError message={err} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Property" required>
              <NativeSelect
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value)
                  const p = properties.data?.find((x) => x.id === e.target.value)
                  setUnitId(p?.units.find((u) => u.status === 'active')?.id ?? '')
                }}
              >
                <option value="">Choose…</option>
                {properties.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Unit" required>
              <NativeSelect value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!property}>
                {property?.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Platform">
              <NativeSelect value={source} onChange={(e) => setSource(e.target.value as (typeof SOURCES)[number])}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {BOOKING_SOURCE[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Calendar export URL (https)" required className="sm:col-span-2">
              <Input type="url" inputMode="url" placeholder="https://www.airbnb.com/calendar/ical/…" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={add.isPending}>
            Cancel
          </Button>
          <Button
            loading={add.isPending}
            onClick={() => {
              if (!propertyId || !unitId) return setErr('Choose the property and unit.')
              if (!/^https:\/\/\S+$/.test(url.trim())) return setErr('Enter the full https:// link.')
              setErr(null)
              add.mutate()
            }}
          >
            Add feed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Owner-only management of iCal availability feeds. */
export function CalendarFeeds() {
  const { orgId, timezone } = useOrg()
  const qc = useQueryClient()
  const feeds = useFeeds()
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['calendar-feeds', orgId] })

  const sync = useMutation({
    mutationFn: async (feedId: string) => {
      const { data, error } = await supabase.functions.invoke('ical-sync', { body: { feed_id: feedId } })
      if (error) throw new Error('The sync service is unavailable. Try again later.')
      const r = (data as { results?: Array<{ status: string; error?: string; created?: number; updated?: number; removed?: number; conflicts?: number }> }).results?.[0]
      if (!r || r.status !== 'ok') throw new Error(r?.error ?? 'Sync failed')
      return r
    },
    onSuccess: (r) => {
      toast.success(`Synced: ${r.created ?? 0} new, ${r.updated ?? 0} changed, ${r.removed ?? 0} released${r.conflicts ? `, ${r.conflicts} conflicts` : ''}.`)
      void refresh()
      void qc.invalidateQueries({ queryKey: ['calendar', orgId] })
    },
    onError: (e) => {
      toast.error(toUserMessage(e))
      void refresh()
    },
  })

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('calendar_feeds').update({ is_active: active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast.error(toUserMessage(e)),
  })

  return (
    <div className="space-y-3">
      <QueryState query={feeds} loading={<ListSkeleton rows={1} />} isEmpty={(d) => d.feeds.length === 0} empty={<p className="text-sm">No feeds yet.</p>}>
        {(d) => (
          <>
            {d.conflicts.length > 0 && (
              <div className="rounded-md border border-danger/20 bg-danger-soft p-3 text-sm text-danger" role="alert">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="size-4" aria-hidden /> {d.conflicts.length} imported stay{d.conflicts.length === 1 ? '' : 's'} overlap
                  CoastStay bookings or blocks
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {d.conflicts.map((c) => (
                    <li key={c.id}>
                      {formatDate(c.start_date)} → {formatDate(c.end_date)} {c.summary && `(${c.summary})`} —{' '}
                      {d.feeds.find((f) => f.id === c.feed_id)?.name}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">Resolve on the platform or in CoastStay; nothing was changed automatically.</p>
              </div>
            )}
            <ul className="divide-y rounded-md border">
              {d.feeds.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{f.name}</p>
                    <p className="text-xs">
                      {f.unit && !f.unit.is_default ? `${f.property?.name} · ${f.unit.name}` : f.property?.name} ·{' '}
                      {f.last_synced_at ? `last sync ${formatDateTime(f.last_synced_at, timezone)}` : 'never synced'}
                    </p>
                    {f.last_status === 'error' && <p className="text-xs text-danger">{f.last_error}</p>}
                  </div>
                  {f.last_status && <Badge tone={f.last_status === 'ok' ? 'success' : 'danger'}>{f.last_status === 'ok' ? 'OK' : 'Error'}</Badge>}
                  <Switch checked={f.is_active} onCheckedChange={(v) => toggle.mutate({ id: f.id, active: v })} aria-label={`Sync ${f.name} automatically`} />
                  <Button size="sm" variant="outline" loading={sync.isPending && sync.variables === f.id} onClick={() => sync.mutate(f.id)}>
                    <RefreshCw /> Sync now
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${f.name}`} onClick={() => setDeleting(f.id)}>
                    <Trash2 className="text-danger" />
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryState>
      <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
        <Plus /> Add calendar feed
      </Button>
      {adding && <AddFeedDialog open onOpenChange={setAdding} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove this calendar feed?"
        description="Dates it blocked are released immediately."
        confirmLabel="Remove feed"
        destructive
        onConfirm={async () => {
          // The database releases the feed's imported blocks when the feed is deleted.
          const { error } = await supabase.from('calendar_feeds').delete().eq('id', deleting!)
          if (error) {
            toast.error(toUserMessage(error))
            throw error
          }
          toast.success('Feed removed.')
          void refresh()
          void qc.invalidateQueries({ queryKey: ['calendar', orgId] })
        }}
      />
      <p className="flex items-center gap-1.5 text-xs">
        <CalendarSync className="size-3.5" aria-hidden /> Imported stays appear on the calendar as blocked dates. They are not bookings and carry no payments.
      </p>
    </div>
  )
}
