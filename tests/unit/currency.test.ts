import { describe, expect, it } from 'vitest'
import { centsToDecimal, formatCents, formatMoney, percentOf, sumCents, toCents } from '@/lib/currency'

describe('toCents', () => {
  it('parses decimal strings exactly', () => {
    expect(toCents('1250.50')).toBe(125050)
    expect(toCents('0.10')).toBe(10)
    expect(toCents('12,500')).toBe(1250000)
    expect(toCents('KES 3,000.75')).toBe(300075)
    expect(toCents('-45.5')).toBe(-4550)
  })

  it('parses JSON numbers without floating-point drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(1250.5)).toBe(125050)
    expect(toCents(19.99)).toBe(1999)
  })

  it('rounds half away from zero at the third decimal', () => {
    expect(toCents('1.005')).toBe(101)
    expect(toCents('1.004')).toBe(100)
    expect(toCents('-1.005')).toBe(-101)
  })

  it('treats empty values as zero and rejects junk', () => {
    expect(toCents('')).toBe(0)
    expect(toCents(null)).toBe(0)
    expect(() => toCents('abc')).toThrow()
    expect(() => toCents(Number.NaN)).toThrow()
  })
})

describe('formatting', () => {
  it('round-trips cents to database decimals', () => {
    expect(centsToDecimal(125050)).toBe('1250.50')
    expect(centsToDecimal(5)).toBe('0.05')
    expect(centsToDecimal(-4550)).toBe('-45.50')
  })

  it('formats KES amounts for display', () => {
    expect(formatCents(1250000)).toBe('KES 12,500.00')
    expect(formatCents(1250000, 'KES', { compact: true })).toBe('KES 12,500')
    expect(formatMoney('99.5')).toBe('KES 99.50')
  })

  it('sums and takes percentages in cents', () => {
    expect(sumCents(['0.10', 0.2, '1,000'])).toBe(100030)
    expect(percentOf(1000000, 30)).toBe(300000)
    expect(percentOf(333, 33.33)).toBe(111)
  })
})
