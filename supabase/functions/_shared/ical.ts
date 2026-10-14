/**
 * Minimal, defensive iCalendar (RFC 5545) VEVENT reader for availability feeds (Airbnb,
 * Booking.com, VRBO). Only what availability needs: UID, start/end dates, summary, status.
 * Shared by the `ical-sync` Edge Function (Deno) and unit tests (Vitest) — no runtime imports.
 */

export interface CalendarEvent {
  uid: string
  /** YYYY-MM-DD, first blocked night */
  start: string
  /** YYYY-MM-DD, exclusive (first night available again) */
  end: string
  summary: string
}

const MAX_EVENTS = 2000

/** Joins folded lines (RFC 5545 §3.1: CRLF followed by a space or tab continues a line). */
export function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
}

function addDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** DTSTART/DTEND value → calendar date. Date-times keep their wall-clock date. */
export function toDate(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d] = m
  const iso = `${y}-${mo}-${d}`
  const check = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso ? null : iso
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim()
}

export function parseICal(text: string): CalendarEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Not an iCalendar file')
  const events: CalendarEvent[] = []
  let current: Record<string, string> | null = null
  for (const raw of unfold(text)) {
    const line = raw.trimEnd()
    if (/^BEGIN:VEVENT$/i.test(line)) {
      current = {}
      continue
    }
    if (/^END:VEVENT$/i.test(line)) {
      if (current) {
        const start = current.DTSTART ? toDate(current.DTSTART) : null
        let end = current.DTEND ? toDate(current.DTEND) : null
        const cancelled = (current.STATUS ?? '').toUpperCase() === 'CANCELLED'
        if (start && current.UID && !cancelled) {
          if (!end || end <= start) end = addDay(start)
          events.push({ uid: current.UID.slice(0, 255), start, end, summary: unescapeText(current.SUMMARY ?? '').slice(0, 200) })
          if (events.length >= MAX_EVENTS) break
        }
      }
      current = null
      continue
    }
    if (!current) continue
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const name = line.slice(0, idx).split(';')[0]!.toUpperCase()
    const value = line.slice(idx + 1)
    if (['UID', 'DTSTART', 'DTEND', 'SUMMARY', 'STATUS'].includes(name)) current[name] = value
  }
  return events
}

/** User-safe error text. Never includes the feed URL (it carries the platform's secret token). */
export function safeError(e: unknown, url: string): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/^(Feed |Not an iCalendar|Empty response)/.test(msg)) return msg.slice(0, 200)
  if (/dns|lookup|connect|refused|unreachable|tls|certificate/i.test(msg)) return 'Could not reach the calendar server. Check the link.'
  return msg.split(url).join('[feed link]').replace(/https?:\/\/\S+/g, '[link]').slice(0, 200) || 'Fetch failed'
}
