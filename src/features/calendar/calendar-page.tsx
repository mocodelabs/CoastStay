import { addDays, addMonths, startOfMonth, startOfWeek } from 'date-fns'
import { CalendarPlus, ChevronLeft, ChevronRight, Lock, LogIn, LogOut, BedDouble, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { BookingStatusBadge } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/input'
import { Card, Checkbox, Label, Skeleton } from '@/components/ui/primitives'
import { useDeleteBlock, type BookingOverview } from '@/features/bookings/api'
import { stayLabel } from '@/features/bookings/booking-table'
import { usePropertyOptions, type PropertyOption } from '@/features/properties/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useUrlFilters } from '@/hooks/use-url-state'
import { addDaysISO, formatDate, formatDateShort, isISODate, nightsBetween, parseISODate, toISODate, todayISO } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { BLOCK_REASON, type BookingStatus } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { useCalendarData, type Block } from './api'
import { BlockDialog } from './block-dialog'

type View = 'day' | 'week' | 'month'
const FILTERS = ['view', 'date', 'property', 'cancelled'] as const

const BAR_STYLE: Record<BookingStatus, string> = {
  inquiry: 'border border-dashed border-charcoal-500/50 bg-white text-charcoal-700',
  pending: 'bg-warning-soft text-warning ring-1 ring-warning/30',
  confirmed: 'bg-info-soft text-info ring-1 ring-info/30',
  checked_in: 'bg-ocean-600 text-white',
  checked_out: 'bg-success-soft text-success ring-1 ring-success/25',
  cancelled: 'bg-danger-soft/70 text-danger line-through ring-1 ring-danger/20',
  no_show: 'bg-sand-100 text-muted-foreground',
}
const BLOCK_STYLE =
  'bg-[repeating-linear-gradient(135deg,var(--color-sand-200)_0_6px,var(--color-sand-100)_6px_12px)] text-charcoal-700 ring-1 ring-sand-300'

function computeRange(view: View, anchor: string): { start: string; end: string } {
  const d = parseISODate(anchor)
  if (view === 'month') {
    const s = startOfMonth(d)
    return { start: toISODate(s), end: toISODate(addMonths(s, 1)) }
  }
  if (view === 'week') {
    const s = startOfWeek(d, { weekStartsOn: 1 })
    return { start: toISODate(s), end: toISODate(addDays(s, 7)) }
  }
  return { start: anchor, end: addDaysISO(anchor, 1) }
}

function shift(view: View, anchor: string, dir: 1 | -1): string {
  const d = parseISODate(anchor)
  if (view === 'month') return toISODate(addMonths(d, dir))
  return toISODate(addDays(d, dir * (view === 'week' ? 7 : 1)))
}

interface Item {
  kind: 'booking' | 'block'
  id: string
  start: string
  end: string
  booking?: BookingOverview
  block?: Block
}

/** Assigns overlapping items to stacked lanes. */
function layoutLanes(items: Item[]): Array<Item & { lane: number }> {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end))
  const laneEnds: string[] = []
  return sorted.map((it) => {
    let lane = laneEnds.findIndex((end) => end <= it.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(it.end)
    } else laneEnds[lane] = it.end
    return { ...it, lane }
  })
}

export interface UnitRow {
  property: PropertyOption
  unitId: string
  label: string
  sub?: string
}

function Legend() {
  const items: Array<[string, string]> = [
    ['Confirmed', BAR_STYLE.confirmed],
    ['Pending', BAR_STYLE.pending],
    ['Inquiry', BAR_STYLE.inquiry],
    ['In house', BAR_STYLE.checked_in],
    ['Checked out', BAR_STYLE.checked_out],
    ['Cancelled', BAR_STYLE.cancelled],
    ['Blocked', BLOCK_STYLE],
  ]
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {items.map(([label, cls]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={cn('inline-block h-3 w-5 rounded-sm', cls)} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  )
}

export function CalendarPage() {
  const { can, timezone } = useOrg()
  const navigate = useNavigate()
  const today = todayISO(timezone)
  const { values, set } = useUrlFilters(FILTERS)
  const view: View = values.view === 'day' || values.view === 'month' ? values.view : values.view === 'week' ? 'week' : defaultView()
  const anchor = isISODate(values.date) ? values.date : today
  const { start, end } = computeRange(view, anchor)
  const properties = usePropertyOptions()
  // Day view also needs the previous night to list departures.
  const data = useCalendarData(view === 'day' ? addDaysISO(start, -1) : start, end, values.property, values.cancelled === '1')

  const [selection, setSelection] = useState<{ row: UnitRow; start: string; end?: string } | null>(null)
  const [blockInit, setBlockInit] = useState<{ property_id: string; unit_id: string; start_date: string; end_date: string } | null>(null)
  const [openBlock, setOpenBlock] = useState<Block | null>(null)

  const days = useMemo(() => {
    const out: string[] = []
    for (let d = start; d < end; d = addDaysISO(d, 1)) out.push(d)
    return out
  }, [start, end])

  const rows = useMemo(() => buildUnitRows(properties.data, data.data?.bookings, values.property), [properties.data, values.property, data.data])

  const title =
    view === 'month'
      ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(parseISODate(start))
      : view === 'week'
        ? `${formatDateShort(start)} – ${formatDateShort(addDaysISO(end, -1))}`
        : formatDateShort(start)

  function onCell(row: UnitRow, day: string) {
    if (!can('booking.manage') && !can('block.manage')) return
    if (!selection || selection.row.unitId !== row.unitId || selection.end || day < selection.start) {
      setSelection({ row, start: day })
      return
    }
    setSelection({ ...selection, end: day })
  }

  const selRange = selection?.end ? { from: selection.start, to: addDaysISO(selection.end, 1) } : null
  const scrollRef = useRef<HTMLDivElement>(null)
  const ready = Boolean(data.data && properties.data)

  // Bring today (or the start of the period) into view when the period changes.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const cell = el.querySelector<HTMLElement>('[data-today]')
    const offset = cell ? cell.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft : 0
    el.scrollLeft = Math.max(0, offset - el.clientWidth / 3)
  }, [start, view, ready])

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Occupancy and availability across your units. Select two dates on a unit row to book or block them."
        actions={
          can('booking.manage') && (
            <Button asChild>
              <Link to="/bookings/new">
                <CalendarPlus /> New booking
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border bg-surface p-0.5" role="group" aria-label="View">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => set({ view: v })}
                className={cn('rounded px-3 py-1.5 text-sm font-medium capitalize', view === v ? 'bg-primary text-white' : 'text-charcoal-700 hover:bg-sand-100')}
              >
                {v}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" aria-label="Previous" onClick={() => set({ date: shift(view, anchor, -1) })}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" onClick={() => set({ date: today })}>
            Today
          </Button>
          <Button variant="outline" size="icon" aria-label="Next" onClick={() => set({ date: shift(view, anchor, 1) })}>
            <ChevronRight />
          </Button>
          <h2 className="ml-1 text-lg font-semibold" aria-live="polite">
            {title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect aria-label="Property" value={values.property} onChange={(e) => set({ property: e.target.value })} className="w-48">
            <option value="">All properties</option>
            {properties.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
          <div className="flex items-center gap-2">
            <Checkbox id="show-cancelled" checked={values.cancelled === '1'} onCheckedChange={(c) => set({ cancelled: c === true ? '1' : '' })} />
            <Label htmlFor="show-cancelled" className="font-normal">
              Show cancelled
            </Label>
          </div>
        </div>
      </div>

      {properties.isError || data.isError ? (
        <ErrorState error={properties.error ?? data.error} onRetry={() => void (properties.isError ? properties.refetch() : data.refetch())} />
      ) : properties.isPending || data.isPending ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <EmptyState icon={BedDouble} title="No units to show" description="Add a property to see its availability here." />
      ) : view === 'day' ? (
        <DayAgenda day={start} rows={rows} bookings={data.data.bookings} blocks={data.data.blocks} onBlock={setOpenBlock} />
      ) : (
        <Card className="overflow-hidden">
          <div ref={scrollRef} className="overflow-x-auto" role="region" aria-label="Availability timeline" tabIndex={0}>
            <Timeline
              view={view}
              days={days}
              today={today}
              rows={rows}
              bookings={data.data.bookings}
              blocks={data.data.blocks}
              selection={selection}
              onCell={onCell}
              onBooking={(id) => navigate(`/bookings/${id}`)}
              onBlock={setOpenBlock}
            />
          </div>
        </Card>
      )}
      <div className="mt-3">
        <Legend />
      </div>
      {selection && !selection.end && (
        <p className="no-print fixed inset-x-4 bottom-20 z-10 mx-auto max-w-md rounded-lg bg-charcoal-900 px-4 py-2.5 text-center text-sm text-white shadow-lg md:bottom-6">
          Now select the last night for {selection.row.label}.{' '}
          <button type="button" className="underline" onClick={() => setSelection(null)}>
            Cancel
          </button>
        </p>
      )}

      <Dialog open={Boolean(selRange)} onOpenChange={(o) => !o && setSelection(null)}>
        <DialogContent>
          {selection && selRange && (
            <>
              <DialogHeader>
                <DialogTitle>{selection.row.sub ? `${selection.row.sub} · ${selection.row.label}` : selection.row.label}</DialogTitle>
                <DialogDescription>
                  {formatDate(selRange.from)} → {formatDate(selRange.to)} · {nightsBetween(selRange.from, selRange.to)} night
                  {nightsBetween(selRange.from, selRange.to) === 1 ? '' : 's'}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                {can('block.manage') && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBlockInit({ property_id: selection.row.property.id, unit_id: selection.row.unitId, start_date: selRange.from, end_date: selRange.to })
                      setSelection(null)
                    }}
                  >
                    <Lock /> Block dates
                  </Button>
                )}
                {can('booking.manage') && (
                  <Button asChild>
                    <Link
                      to={`/bookings/new?property=${selection.row.property.id}&unit=${selection.row.unitId}&check_in=${selRange.from}&check_out=${selRange.to}`}
                    >
                      <CalendarPlus /> New booking
                    </Link>
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {blockInit && <BlockDialog open onOpenChange={(o) => !o && setBlockInit(null)} initial={blockInit} />}
      <BlockDetails block={openBlock} rows={rows} onClose={() => setOpenBlock(null)} />
    </>
  )
}

/** One timeline row per bookable unit (inactive units only while they have stays in view). */
export function buildUnitRows(properties: PropertyOption[] | undefined, bookings: BookingOverview[] | undefined, propertyFilter = ''): UnitRow[] {
  const list = (properties ?? []).filter((p) => !propertyFilter || p.id === propertyFilter)
  const out: UnitRow[] = []
  for (const p of list) {
    const units = p.units.filter((u) => u.status === 'active' || (bookings ?? []).some((b) => b.unit_id === u.id))
    if (p.status !== 'active' && !(bookings ?? []).some((b) => b.property_id === p.id)) continue
    for (const u of units) {
      const single = units.length === 1 && u.is_default
      out.push({ property: p, unitId: u.id, label: single ? p.name : u.name, sub: single ? undefined : p.name })
    }
  }
  return out
}

function defaultView(): View {
  return typeof window !== 'undefined' && window.innerWidth < 768 ? 'week' : 'month'
}

export function Timeline({
  view,
  days,
  today,
  rows,
  bookings,
  blocks,
  selection,
  onCell,
  onBooking,
  onBlock,
}: {
  view: View
  days: string[]
  today: string
  rows: UnitRow[]
  bookings: BookingOverview[]
  blocks: Block[]
  selection: { row: UnitRow; start: string; end?: string } | null
  onCell: (row: UnitRow, day: string) => void
  onBooking: (id: string) => void
  onBlock: (b: Block) => void
}) {
  const col = view === 'month' ? '2.6rem' : 'minmax(5.5rem, 1fr)'
  const n = days.length
  const first = days[0]!
  const last = addDaysISO(days[n - 1]!, 1)
  const idx = (d: string) => Math.max(0, Math.min(n, nightsBetween(first, d)))

  return (
    <div className="min-w-max" style={{ display: 'grid', gridTemplateColumns: `minmax(9rem, 12rem) repeat(${n}, ${col})` }}>
      <div className="sticky left-0 z-20 border-r border-b bg-sand-50" />
      {days.map((d) => {
        const date = parseISODate(d)
        const weekend = date.getDay() === 0 || date.getDay() === 6
        return (
          <div
            key={d}
            data-today={d === today || undefined}
            className={cn('border-b border-l px-1 py-1.5 text-center text-xs', weekend && 'bg-sand-50', d === today && 'bg-ocean-50 font-semibold text-ocean-700')}
          >
            <div className="text-muted-foreground">{new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date)}</div>
            <div className="text-sm">{date.getDate()}</div>
          </div>
        )
      })}

      {rows.map((row) => {
        const items: Item[] = [
          ...bookings
            .filter((b) => b.unit_id === row.unitId)
            .map((b) => ({ kind: 'booking' as const, id: b.id, start: b.check_in_date, end: b.check_out_date, booking: b })),
          ...blocks
            .filter((k) => k.unit_id === row.unitId)
            .map((k) => ({ kind: 'block' as const, id: k.id, start: k.start_date, end: k.end_date, block: k })),
        ]
        const laid = layoutLanes(items)
        const lanes = Math.max(1, ...laid.map((i) => i.lane + 1))
        return (
          <div key={row.unitId} className="contents">
            <div className="sticky left-0 z-10 flex flex-col justify-center border-r border-b bg-surface px-3 py-2">
              <span className="truncate text-sm font-medium" title={row.label}>
                {row.label}
              </span>
              {row.sub && <span className="truncate text-xs text-muted-foreground">{row.sub}</span>}
            </div>
            <div
              className="relative border-b"
              style={{
                gridColumn: `span ${n}`,
                display: 'grid',
                gridTemplateColumns: `repeat(${n}, ${col})`,
                gridTemplateRows: `repeat(${lanes}, 1.9rem)`,
                rowGap: '2px',
                padding: '4px 0',
              }}
            >
              {days.map((d, i) => {
                const selected =
                  selection?.row.unitId === row.unitId && d >= selection.start && d <= (selection.end ?? selection.start)
                const weekend = [0, 6].includes(parseISODate(d).getDay())
                return (
                  <button
                    key={d}
                    type="button"
                    aria-label={`${row.sub ? `${row.sub} ${row.label}` : row.label}, ${formatDateShort(d)}`}
                    onClick={() => onCell(row, d)}
                    className={cn(
                      'border-l focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                      weekend && 'bg-sand-50/70',
                      d === today && 'bg-ocean-50/60',
                      selected && 'bg-ocean-200/60',
                      'hover:bg-ocean-50',
                    )}
                    style={{ gridColumn: `${i + 1}`, gridRow: `1 / span ${lanes}`, margin: '-4px 0' }}
                  />
                )
              })}
              {laid.map((it) => {
                const s = idx(it.start)
                const e = idx(it.end)
                if (e <= s) return null
                const clippedStart = it.start < first
                const clippedEnd = it.end > last
                const common = cn(
                  'relative z-[1] mx-0.5 flex items-center gap-1 overflow-hidden rounded px-1.5 text-left text-xs font-medium whitespace-nowrap shadow-xs focus-visible:outline-2 focus-visible:outline-ring',
                  clippedStart && 'rounded-l-none',
                  clippedEnd && 'rounded-r-none',
                )
                const style = { gridColumn: `${s + 1} / ${e + 1}`, gridRow: `${it.lane + 1}` }
                if (it.kind === 'block') {
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className={cn(common, BLOCK_STYLE)}
                      style={style}
                      onClick={() => onBlock(it.block!)}
                      title={`Blocked: ${BLOCK_REASON[it.block!.reason]}`}
                    >
                      <Lock className="size-3 shrink-0" aria-hidden /> {BLOCK_REASON[it.block!.reason]}
                    </button>
                  )
                }
                const b = it.booking!
                return (
                  <button
                    key={it.id}
                    type="button"
                    className={cn(common, BAR_STYLE[b.status])}
                    style={style}
                    onClick={() => onBooking(b.id)}
                    title={`${b.guest_name} · ${formatDate(b.check_in_date)} → ${formatDate(b.check_out_date)} · ${b.booking_reference}`}
                  >
                    {b.check_in_date >= first && <LogIn className="size-3 shrink-0" aria-hidden />}
                    <span className="truncate">{b.guest_name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AgendaSection({ icon: Icon, title, children, count }: { icon: typeof LogIn; title: string; children: React.ReactNode; count: number }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-primary" aria-hidden /> {title} <span className="text-muted-foreground">({count})</span>
      </h3>
      {count === 0 ? <p className="text-sm text-muted-foreground">None</p> : <ul className="space-y-2">{children}</ul>}
    </Card>
  )
}

function DayAgenda({
  day,
  rows,
  bookings,
  blocks,
  onBlock,
}: {
  day: string
  rows: UnitRow[]
  bookings: BookingOverview[]
  blocks: Block[]
  onBlock: (b: Block) => void
}) {
  // The day query returns stays overlapping this night; departures need the previous night too.
  const arrivals = bookings.filter((b) => b.check_in_date === day && b.status !== 'cancelled')
  const departures = bookings.filter((b) => b.check_out_date === day && b.status !== 'cancelled')
  const inHouse = bookings.filter((b) => b.check_in_date < day && b.check_out_date > day && b.status !== 'cancelled')
  const occupied = new Set([...arrivals, ...inHouse].map((b) => b.unit_id))
  const blocked = blocks.filter((k) => k.start_date <= day && k.end_date > day)
  const free = rows.filter((r) => !occupied.has(r.unitId) && !blocked.some((k) => k.unit_id === r.unitId))

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AgendaSection icon={LogIn} title="Arriving" count={arrivals.length}>
        {arrivals.map((b) => (
          <li key={b.id}>
            <Link to={`/bookings/${b.id}`} className="flex items-center justify-between gap-2 rounded-md p-2 hover:bg-sand-50">
              <span>
                <span className="font-medium">{b.guest_name}</span>
                <span className="block text-xs text-muted-foreground">
                  {stayLabel(b)} · {b.nights} nights
                </span>
              </span>
              <BookingStatusBadge status={b.status} />
            </Link>
          </li>
        ))}
      </AgendaSection>
      <AgendaSection icon={LogOut} title="Departing" count={departures.length}>
        {departures.map((b) => (
          <li key={b.id}>
            <Link to={`/bookings/${b.id}`} className="flex items-center justify-between gap-2 rounded-md p-2 hover:bg-sand-50">
              <span>
                <span className="font-medium">{b.guest_name}</span>
                <span className="block text-xs text-muted-foreground">{stayLabel(b)}</span>
              </span>
              <BookingStatusBadge status={b.status} />
            </Link>
          </li>
        ))}
      </AgendaSection>
      <AgendaSection icon={BedDouble} title="In house" count={inHouse.length}>
        {inHouse.map((b) => (
          <li key={b.id}>
            <Link to={`/bookings/${b.id}`} className="flex items-center justify-between gap-2 rounded-md p-2 hover:bg-sand-50">
              <span>
                <span className="font-medium">{b.guest_name}</span>
                <span className="block text-xs text-muted-foreground">
                  {stayLabel(b)} · leaves {formatDate(b.check_out_date)}
                </span>
              </span>
              <BookingStatusBadge status={b.status} />
            </Link>
          </li>
        ))}
      </AgendaSection>
      <AgendaSection icon={Lock} title="Blocked" count={blocked.length}>
        {blocked.map((k) => (
          <li key={k.id}>
            <button type="button" onClick={() => onBlock(k)} className="w-full rounded-md p-2 text-left hover:bg-sand-50">
              <span className="font-medium">{rows.find((r) => r.unitId === k.unit_id)?.label ?? 'Unit'}</span>
              <span className="block text-xs text-muted-foreground">
                {BLOCK_REASON[k.reason]} · until {formatDate(k.end_date)}
              </span>
            </button>
          </li>
        ))}
      </AgendaSection>
      <AgendaSection icon={CalendarPlus} title="Available tonight" count={free.length}>
        {free.map((r) => (
          <li key={r.unitId} className="p-2 text-sm">
            <span className="font-medium">{r.label}</span>
            {r.sub && <span className="text-muted-foreground"> · {r.sub}</span>}
          </li>
        ))}
      </AgendaSection>
    </div>
  )
}

function BlockDetails({ block, rows, onClose }: { block: Block | null; rows: UnitRow[]; onClose: () => void }) {
  const { can } = useOrg()
  const del = useDeleteBlock()
  const [confirm, setConfirm] = useState(false)
  const row = rows.find((r) => r.unitId === block?.unit_id)
  return (
    <>
      <Dialog open={block !== null && !confirm} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          {block && (
            <>
              <DialogHeader>
                <DialogTitle>Blocked: {BLOCK_REASON[block.reason]}</DialogTitle>
                <DialogDescription>
                  {row ? (row.sub ? `${row.sub} · ${row.label}` : row.label) : 'Unit'} · {formatDate(block.start_date)} → available{' '}
                  {formatDate(block.end_date)}
                </DialogDescription>
              </DialogHeader>
              {block.notes && <p className="text-sm whitespace-pre-line">{block.notes}</p>}
              {block.maintenance_request_id && (
                <Link to={`/maintenance/${block.maintenance_request_id}`} className="text-sm text-primary hover:underline">
                  View maintenance request
                </Link>
              )}
              <DialogFooter>
                {can('block.manage') && block.reason !== 'external_calendar' && (
                  <Button variant="destructive" onClick={() => setConfirm(true)}>
                    <Trash2 /> Remove block
                  </Button>
                )}
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={(o) => {
          setConfirm(o)
          if (!o) onClose()
        }}
        title="Remove this block?"
        description="The dates become available for booking again."
        confirmLabel="Remove block"
        destructive
        onConfirm={async () => {
          try {
            await del.mutateAsync(block!.id)
            toast.success('Block removed.')
          } catch (e) {
            toast.error(toUserMessage(e))
            throw e
          }
        }}
      />
    </>
  )
}
