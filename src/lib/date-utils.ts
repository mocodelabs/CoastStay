/**
 * Date helpers. Calendar dates (check-in/out, expense dates) are plain `YYYY-MM-DD` strings and are
 * never converted through UTC. Timestamps are displayed in the business time zone.
 */
import { addDays, differenceInCalendarDays, format, isValid, parse } from 'date-fns'

export const DEFAULT_TIMEZONE = 'Africa/Nairobi'
export const DISPLAY_DATE = 'dd/MM/yyyy'
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Parses `YYYY-MM-DD` into a local Date at midnight (no time-zone shift). */
export function parseISODate(value: string): Date {
  if (!ISO_DATE_RE.test(value)) throw new Error(`Invalid date: ${value}`)
  const d = parse(value, 'yyyy-MM-dd', new Date(2000, 0, 1))
  if (!isValid(d)) throw new Error(`Invalid date: ${value}`)
  return d
}

export function isISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false
  return isValid(parse(value, 'yyyy-MM-dd', new Date(2000, 0, 1)))
}

/** Formats a local Date as `YYYY-MM-DD` using its local calendar parts. */
export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** Today's calendar date in the given time zone, as `YYYY-MM-DD`. */
export function todayISO(timeZone = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function addDaysISO(value: string, days: number): string {
  return toISODate(addDays(parseISODate(value), days))
}

/** Nights between check-in (inclusive) and check-out (exclusive). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return differenceInCalendarDays(parseISODate(checkOut), parseISODate(checkIn))
}

/** True if [aStart, aEnd) and [bStart, bEnd) share at least one night. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** `DD/MM/YYYY` for a `YYYY-MM-DD` calendar date. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  if (ISO_DATE_RE.test(value)) return format(parseISODate(value), DISPLAY_DATE)
  return formatDateTime(value, DEFAULT_TIMEZONE, { dateOnly: true })
}

/** Short human form, e.g. "Mon 13 Oct". */
export function formatDateShort(value: string): string {
  return format(parseISODate(value), 'EEE d MMM')
}

/** Formats an ISO timestamp in the business time zone: `DD/MM/YYYY HH:mm`. */
export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone = DEFAULT_TIMEZONE,
  opts: { dateOnly?: boolean } = {},
): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(opts.dateOnly ? {} : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const }),
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const date = `${get('day')}/${get('month')}/${get('year')}`
  return opts.dateOnly ? date : `${date} ${get('hour')}:${get('minute')}`
}

/** Parses user input in `DD/MM/YYYY` into `YYYY-MM-DD`, or null. */
export function parseDisplayDate(value: string): string | null {
  const d = parse(value.trim(), DISPLAY_DATE, new Date(2000, 0, 1))
  return isValid(d) ? toISODate(d) : null
}

/** First and last calendar day of the month containing `isoDate` (last is inclusive). */
export function monthBounds(isoDate: string): { start: string; end: string } {
  const d = parseISODate(isoDate)
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { start: toISODate(start), end: toISODate(end) }
}

/** `HH:mm` from a Postgres `time` value like `14:00:00`. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(0, 5)
}
