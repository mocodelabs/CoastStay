import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCents, toCents } from '@/lib/currency'

/*
 * Chart colours come from the validated reference categorical palette (dataviz skill):
 * slot 1 blue, slot 2 orange — the brand teal is too desaturated to read as a series.
 * Text stays in text tokens; grid and axes are recessive.
 */
export const SERIES = { s1: '#2a78d6', s2: '#eb6834' } as const
const AXIS = { fontSize: 12, fill: '#59656a' }
const GRID = '#ebe5da'

function compactMoney(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`
  return String(Math.round(v))
}

function TooltipBox({
  label,
  rows,
}: {
  label: string
  rows: Array<{ name: string; value: string; color: string }>
}) {
  return (
    <div className="rounded-md border bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-charcoal-900">{label}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2 text-charcoal-700">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: r.color }} aria-hidden />
          {r.name}: <span className="tabular font-medium text-charcoal-900">{r.value}</span>
        </p>
      ))}
    </div>
  )
}

/** Grouped bars: money collected vs operating expenses per month (one shared money axis). */
export function RevenueExpenseChart({
  data,
  currency,
}: {
  data: Array<{ label: string; collected: number; expenses: number }>
  currency: string
}) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Net collected versus operating expenses by month">
      <ResponsiveContainer>
        <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS} width={44} tickFormatter={(v: number) => compactMoney(v)} />
          <Tooltip
            cursor={{ fill: 'rgba(29,36,39,0.04)' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  label={String(label)}
                  rows={payload.map((p) => ({
                    name: String(p.name),
                    value: formatCents(toCents(Number(p.value)), currency),
                    color: String(p.color),
                  }))}
                />
              ) : null
            }
          />
          <Legend verticalAlign="top" align="right" iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
          <Bar dataKey="collected" name="Net collected" fill={SERIES.s1} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expenses" name="Operating expenses" fill={SERIES.s2} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontal bars of occupancy % per property (single series, direct value labels). */
export function OccupancyChart({ data }: { data: Array<{ name: string; occupancy: number | null }> }) {
  const rows = data.map((d) => ({ ...d, value: d.occupancy === null ? 0 : Math.round(d.occupancy * 10) / 10 }))
  return (
    <div className="w-full" style={{ height: Math.max(120, rows.length * 40 + 30) }} role="img" aria-label="Occupancy rate by property">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} tick={AXIS} tickFormatter={(v: number) => `${v}%`} />
          <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={AXIS} width={130} />
          <Tooltip
            cursor={{ fill: 'rgba(29,36,39,0.04)' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  label={String(payload[0]!.payload.name)}
                  rows={[{ name: 'Occupancy', value: `${payload[0]!.value}%`, color: SERIES.s1 }]}
                />
              ) : null
            }
          />
          <Bar
            dataKey="value"
            fill={SERIES.s1}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            label={{ position: 'right', fontSize: 12, fill: '#384246', formatter: (v: unknown) => `${v}%` }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
