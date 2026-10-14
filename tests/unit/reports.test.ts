import { describe, expect, it } from 'vitest'
import type { BookingOverview } from '@/features/bookings/api'
import { metrics, sumPerformance, type PropertyPerformance } from '@/features/reports/api'
import { summarizeBookings } from '@/features/reports/report-data'

const perf = (o: Partial<PropertyPerformance>): PropertyPerformance => ({
  property_id: 'p',
  property_name: 'P',
  unit_count: 1,
  available_nights: 0,
  blocked_nights: 0,
  occupied_nights: 0,
  accommodation_revenue: 0,
  reservation_value: 0,
  payments_collected: 0,
  operating_expenses: 0,
  ...o,
})

describe('occupancy, ADR and RevPAR', () => {
  it('follows the documented formulas', () => {
    const m = metrics({ available_nights: 27, occupied_nights: 2, accommodation_revenue: 20000 })
    expect(m.occupancy).toBeCloseTo((2 / 27) * 100)
    expect(m.adr).toBe(10000)
    expect(m.revpar).toBeCloseTo(20000 / 27)
  })

  it('returns null instead of dividing by zero', () => {
    expect(metrics({ available_nights: 0, occupied_nights: 0, accommodation_revenue: 0 })).toEqual({ occupancy: null, adr: null, revpar: null })
  })

  it('aggregates portfolio totals by summing nights, not averaging percentages', () => {
    const total = sumPerformance([
      perf({ available_nights: 30, occupied_nights: 30, accommodation_revenue: 300000 }),
      perf({ available_nights: 10, occupied_nights: 0 }),
    ])
    // (30 + 0) / (30 + 10) = 75%, not the 50% average of 100% and 0%.
    expect(metrics(total).occupancy).toBe(75)
  })
})

const b = (o: Partial<BookingOverview>) =>
  ({ status: 'confirmed', nights: 2, total_amount: 10000, booking_source: 'direct', ...o }) as BookingOverview

describe('booking summary', () => {
  it('excludes inquiries, counts cancellations, and excludes cancelled value and nights', () => {
    const s = summarizeBookings([
      b({}),
      b({ booking_source: 'airbnb', nights: 3, total_amount: 15000 }),
      b({ status: 'cancelled', total_amount: 99999 }),
      b({ status: 'inquiry' }),
    ])
    expect(s).toMatchObject({ inquiries: 1, bookings: 3, kept: 2, cancelled: 1, nights: 5, valueCents: 2500000, avgStay: 2.5 })
    expect(s.bySource.find((r) => r.key === 'direct')).toMatchObject({ count: 2, nights: 2, value: 1000000 })
  })
})
