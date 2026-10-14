import { describe, expect, it } from 'vitest'
import { parseICal, safeError, toDate } from '../../supabase/functions/_shared/ical'

describe('safeError', () => {
  const url = 'https://www.airbnb.com/calendar/ical/123.ics?s=SECRET'
  it('never reveals the private feed URL', () => {
    expect(safeError(new Error(`error sending request for url (${url}): dns error`), url)).toBe('Could not reach the calendar server. Check the link.')
    expect(safeError(new Error(`weird failure at ${url} and https://other.example/x`), url)).toBe('weird failure at [feed link] and [link]')
    expect(safeError(new Error('Feed returned HTTP 403'), url)).toBe('Feed returned HTTP 403')
  })
})

const AIRBNB = [
  'BEGIN:VCALENDAR',
  'PRODID;X-RICAL-TZSOURCE=TZINFO:-//Airbnb Inc//Hosting Calendar 0.8.8//EN',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20261024',
  'DTSTART;VALUE=DATE:20261020',
  'UID:1418fb94e984-7d1b4f5b7b9fe5b8a8e5d1f0c5b3d1b4@airbnb.com',
  'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC\\nPhone Number (Last 4 Digits): 1234',
  'SUMMARY:Reserved',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20261102',
  'DTSTART;VALUE=DATE:20261101',
  'UID:9d2e-blocked@airbnb.com',
  'SUMMARY:Airbnb (Not available)',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('parseICal', () => {
  it('reads Airbnb-style all-day events', () => {
    expect(parseICal(AIRBNB)).toEqual([
      { uid: '1418fb94e984-7d1b4f5b7b9fe5b8a8e5d1f0c5b3d1b4@airbnb.com', start: '2026-10-20', end: '2026-10-24', summary: 'Reserved' },
      { uid: '9d2e-blocked@airbnb.com', start: '2026-11-01', end: '2026-11-02', summary: 'Airbnb (Not available)' },
    ])
  })

  it('unfolds long lines and handles date-times, missing DTEND and cancelled events', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:abc-',
      ' 123@booking.com',
      'DTSTART:20261205T140000Z',
      'DTEND:20261208T100000Z',
      'SUMMARY:CLOSED - Not available\\, sorry',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:single-day',
      'DTSTART;VALUE=DATE:20261224',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:gone',
      'STATUS:CANCELLED',
      'DTSTART;VALUE=DATE:20261201',
      'DTEND;VALUE=DATE:20261203',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n')
    expect(parseICal(text)).toEqual([
      { uid: 'abc-123@booking.com', start: '2026-12-05', end: '2026-12-08', summary: 'CLOSED - Not available, sorry' },
      { uid: 'single-day', start: '2026-12-24', end: '2026-12-25', summary: '' },
    ])
  })

  it('skips events without UID or with invalid dates and rejects non-calendars', () => {
    const text = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261301\nUID:x\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART:20261201\nEND:VEVENT\nEND:VCALENDAR'
    expect(parseICal(text)).toEqual([])
    expect(() => parseICal('<html>login</html>')).toThrow()
    expect(toDate('20260230')).toBeNull()
  })
})
