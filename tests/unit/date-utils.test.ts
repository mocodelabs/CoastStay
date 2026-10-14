import { describe, expect, it } from 'vitest'
import {
  addDaysISO,
  formatDate,
  formatDateTime,
  isISODate,
  monthBounds,
  nightsBetween,
  parseDisplayDate,
  rangesOverlap,
  todayISO,
} from '@/lib/date-utils'

describe('date utilities', () => {
  it('counts nights with check-in inclusive and check-out exclusive', () => {
    expect(nightsBetween('2026-12-20', '2026-12-27')).toBe(7)
    expect(nightsBetween('2026-12-31', '2027-01-02')).toBe(2)
    expect(nightsBetween('2028-02-28', '2028-03-01')).toBe(2) // leap year
  })

  it('treats a same-day turnover as non-overlapping', () => {
    expect(rangesOverlap('2026-12-20', '2026-12-25', '2026-12-25', '2026-12-28')).toBe(false)
    expect(rangesOverlap('2026-12-20', '2026-12-25', '2026-12-24', '2026-12-28')).toBe(true)
    expect(rangesOverlap('2026-12-20', '2026-12-25', '2026-12-18', '2026-12-20')).toBe(false)
  })

  it('formats as DD/MM/YYYY without time-zone shifts', () => {
    expect(formatDate('2026-10-01')).toBe('01/10/2026')
    expect(formatDate(null)).toBe('—')
    expect(parseDisplayDate('05/11/2026')).toBe('2026-11-05')
    expect(parseDisplayDate('31/02/2026')).toBeNull()
  })

  it('resolves "today" in Africa/Nairobi, not UTC', () => {
    // 22:30 UTC on 31 Oct is already 1 Nov in Nairobi (UTC+3).
    const instant = new Date('2026-10-31T22:30:00Z')
    expect(todayISO('Africa/Nairobi', instant)).toBe('2026-11-01')
    expect(todayISO('UTC', instant)).toBe('2026-10-31')
  })

  it('formats timestamps in the business time zone', () => {
    expect(formatDateTime('2026-10-31T22:30:00Z')).toBe('01/11/2026 01:30')
  })

  it('computes month bounds for report boundaries', () => {
    expect(monthBounds('2026-02-14')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(monthBounds('2028-02-14')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(monthBounds('2026-12-31')).toEqual({ start: '2026-12-01', end: '2026-12-31' })
  })

  it('validates and shifts ISO dates', () => {
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate('2026-02-28')).toBe(true)
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
  })
})
