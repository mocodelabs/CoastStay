import { describe, expect, it } from 'vitest'
import { toUserMessage } from '@/lib/errors'
import { permissionsFor } from '@/lib/permissions'
import { csvCell, toCsv } from '@/lib/utils'

describe('permissionsFor', () => {
  it('grants managers finance access only when flagged', () => {
    expect(permissionsFor('manager').has('finance.view')).toBe(false)
    expect(permissionsFor('manager', true).has('finance.view')).toBe(true)
    expect(permissionsFor('housekeeping', true).has('finance.view')).toBe(false)
  })

  it('keeps housekeeping away from guests, bookings and finances', () => {
    const p = permissionsFor('housekeeping')
    for (const perm of ['guest.view', 'booking.view', 'finance.view', 'reports.financial', 'staff.manage'] as const) {
      expect(p.has(perm)).toBe(false)
    }
    expect(p.has('housekeeping.work')).toBe(true)
  })

  it('does not let finance staff manage users', () => {
    expect(permissionsFor('finance').has('staff.manage')).toBe(false)
  })
})

describe('toUserMessage', () => {
  it('passes through messages written by database rules', () => {
    expect(toUserMessage({ code: '23514', message: 'This unit sleeps at most 4 guests (infants excluded).' })).toBe(
      'This unit sleeps at most 4 guests (infants excluded).',
    )
  })

  it('hides raw database internals', () => {
    expect(toUserMessage({ code: '42501', message: 'new row violates row-level security policy for table "bookings"' })).toBe(
      'You do not have permission to do that.',
    )
    expect(toUserMessage({ code: '23505', message: 'duplicate key value violates unique constraint "x"' })).toBe(
      'A record with these details already exists.',
    )
    expect(toUserMessage({ code: 'XX000', message: 'internal error at line 4' })).toBe('Something went wrong. Please try again.')
  })

  it('maps overlap and network failures', () => {
    expect(toUserMessage({ code: '23P01', message: 'conflicting key value violates exclusion constraint' })).toMatch(/overlap/)
    expect(toUserMessage(new TypeError('Failed to fetch'))).toMatch(/Network problem/)
  })
})

describe('CSV export', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('neutralizes spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('-5')).toBe("'-5")
  })

  it('builds a CSV document', () => {
    expect(toCsv([{ a: 1, b: 'x' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }])).toBe('A,B\r\n1,x')
  })
})
