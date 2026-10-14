import { addMonths } from 'date-fns'
import { Input, NativeSelect } from '@/components/ui/input'
import { Label } from '@/components/ui/primitives'
import { monthBounds, parseISODate, toISODate } from '@/lib/date-utils'

export type RangePreset = 'this_month' | 'last_month' | 'this_year' | 'last_30' | 'custom'

export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
  const d = parseISODate(today)
  switch (preset) {
    case 'last_month': {
      const b = monthBounds(toISODate(addMonths(d, -1)))
      return { from: b.start, to: b.end }
    }
    case 'this_year':
      return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` }
    case 'last_30': {
      const from = new Date(d)
      from.setDate(from.getDate() - 29)
      return { from: toISODate(from), to: today }
    }
    default: {
      const b = monthBounds(today)
      return { from: b.start, to: b.end }
    }
  }
}

/** Preset selector plus custom from/to dates. Values are inclusive calendar dates. */
export function DateRangeFilter({
  from,
  to,
  today,
  onChange,
}: {
  from: string
  to: string
  today: string
  onChange: (r: { from: string; to: string }) => void
}) {
  const presets: RangePreset[] = ['this_month', 'last_month', 'last_30', 'this_year']
  const current = presets.find((p) => {
    const r = presetRange(p, today)
    return r.from === from && r.to === to
  }) ?? 'custom'
  const labels: Record<RangePreset, string> = {
    this_month: 'This month',
    last_month: 'Last month',
    last_30: 'Last 30 days',
    this_year: 'This year',
    custom: 'Custom range',
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="range-preset">Period</Label>
        <NativeSelect
          id="range-preset"
          value={current}
          onChange={(e) => {
            const p = e.target.value as RangePreset
            if (p !== 'custom') onChange(presetRange(p, today))
          }}
          className="w-40"
        >
          {[...presets, 'custom' as const].map((p) => (
            <option key={p} value={p}>
              {labels[p]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="range-from">From</Label>
        <Input id="range-from" type="date" value={from} max={to} onChange={(e) => e.target.value && onChange({ from: e.target.value, to })} className="w-40" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="range-to">To</Label>
        <Input id="range-to" type="date" value={to} min={from} onChange={(e) => e.target.value && onChange({ from, to: e.target.value })} className="w-40" />
      </div>
    </div>
  )
}
