import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addMember,
  allowOrgCreation,
  createBooking,
  createGuest,
  createOrg,
  createProperty,
  createUser,
  futureWindow,
  today,
  type TestUser,
} from './fixtures'

let owner: TestUser
let other: TestUser
let orgId: string
let propertyId: string
let unitId: string

beforeAll(async () => {
  await allowOrgCreation(true)
  owner = await createUser('pc-owner')
  other = await createUser('pc-other')
  orgId = await createOrg(owner, 'Mtwapa Creek Homes')
  await createOrg(other, 'Elsewhere Ltd')
  const p = await createProperty(owner.client, orgId)
  propertyId = p.property.id
  unitId = p.unitId
})

afterAll(() => allowOrgCreation(false))

function payload(extra: Record<string, unknown> = {}) {
  const w = futureWindow(3)
  return {
    organization_id: orgId,
    client_request_id: crypto.randomUUID(),
    new_guest: { full_name: 'Juma Mwinyi', phone: '+254722000111', email: null },
    property_id: propertyId,
    unit_id: unitId,
    check_in_date: w.checkIn,
    check_out_date: w.checkOut,
    adults: 2,
    nightly_rate: '9000',
    cleaning_fee: '1500',
    status: 'confirmed',
    initial_payment: { amount: '5000', payment_type: 'deposit', payment_method: 'cash', payment_date: today() },
    ...extra,
  }
}

describe('create_booking RPC', () => {
  it('creates guest, booking and deposit atomically, and is retry-safe', async () => {
    const p = payload()
    const first = await owner.client.rpc('create_booking', { payload: p })
    expect(first.error).toBeNull()
    const retry = await owner.client.rpc('create_booking', { payload: p })
    expect(retry.data).toBe(first.data)

    const { data: b } = await owner.client.from('bookings').select('total_amount, amount_paid, balance_due, guest_id').eq('id', first.data!).single()
    expect(b).toMatchObject({ total_amount: 28500, amount_paid: 5000, balance_due: 23500 })
    const { count } = await owner.client.from('guests').select('*', { count: 'exact', head: true }).eq('full_name', 'Juma Mwinyi')
    expect(count).toBe(1)
  })

  it('rolls everything back when any part fails', async () => {
    const before = await owner.client.from('guests').select('*', { count: 'exact', head: true }).eq('organization_id', orgId)
    // A refund as the first transaction is invalid → booking and new guest must not persist.
    const bad = await owner.client.rpc('create_booking', {
      payload: payload({
        new_guest: { full_name: 'Rollback Guest' },
        initial_payment: { amount: '100', payment_type: 'refund', payment_method: 'cash', payment_date: today() },
      }),
    })
    expect(bad.error).not.toBeNull()
    const after = await owner.client.from('guests').select('*', { count: 'exact', head: true }).eq('organization_id', orgId)
    expect(after.count).toBe(before.count)
  })

  it('runs with the caller’s permissions (no privilege escalation)', async () => {
    const hk = await addMember(owner, orgId, 'housekeeping', { propertyIds: [propertyId] })
    const r = await hk.client.rpc('create_booking', { payload: payload() })
    expect(r.error).not.toBeNull()
    const foreign = await other.client.rpc('create_booking', { payload: payload() })
    expect(foreign.error).not.toBeNull()
  })
})

describe('helpers for screens', () => {
  it('unit_conflicts reports overlaps without exposing other organizations', async () => {
    const guest = await createGuest(owner.client, orgId)
    const w = futureWindow(4)
    const b = await createBooking(owner.client, { orgId, propertyId, unitId, guestId: guest.id, ...w })
    const mine = await owner.client.rpc('unit_conflicts', { target_unit: unitId, from_date: w.checkIn, to_date: w.checkOut })
    expect(mine.data).toHaveLength(1)
    expect(mine.data![0]).toMatchObject({ source_type: 'booking', booking_id: b.data!.id })
    const ignoring = await owner.client.rpc('unit_conflicts', {
      target_unit: unitId,
      from_date: w.checkIn,
      to_date: w.checkOut,
      ignore_booking: b.data!.id,
    })
    expect(ignoring.data).toEqual([])
    const spy = await other.client.rpc('unit_conflicts', { target_unit: unitId, from_date: w.checkIn, to_date: w.checkOut })
    expect(spy.data).toEqual([])
  })

  it('housekeeping_schedule gives caretakers operational details only', async () => {
    const guest = await createGuest(owner.client, orgId, 'Fatuma Ali Said')
    const start = new Date()
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const ci = iso(new Date(start.getTime() + 200 * 86_400_000))
    const co = iso(new Date(start.getTime() + 203 * 86_400_000))
    await createBooking(owner.client, { orgId, propertyId, unitId, guestId: guest.id, checkIn: ci, checkOut: co })
    const hk = await addMember(owner, orgId, 'housekeeping', { propertyIds: [propertyId] })
    const { data, error } = await hk.client.rpc('housekeeping_schedule', { org: orgId, from_date: ci, to_date: co })
    expect(error).toBeNull()
    const row = data!.find((r) => r.check_in_date === ci)!
    expect(row.guest_first_name).toBe('Fatuma')
    expect(Object.keys(row)).not.toContain('guest_phone')
    expect(Object.keys(row)).not.toContain('total_amount')

    const outsider = await other.client.rpc('housekeeping_schedule', { org: orgId, from_date: ci, to_date: co })
    expect(outsider.data).toEqual([])
  })

  it('bookings_overview respects RLS of the caller', async () => {
    const mine = await owner.client.from('bookings_overview').select('id').eq('organization_id', orgId)
    expect(mine.data!.length).toBeGreaterThan(0)
    const theirs = await other.client.from('bookings_overview').select('id').eq('organization_id', orgId)
    expect(theirs.data).toEqual([])
    const hk = await addMember(owner, orgId, 'housekeeping', { propertyIds: [propertyId] })
    expect((await hk.client.from('bookings_overview').select('id').eq('organization_id', orgId)).data).toEqual([])
  })
})

describe('finance_summary', () => {
  it('summarizes cash in, refunds, reversals and operating expenses for the period', async () => {
    const org2 = await createOrg(owner, `Summary Test ${Date.now()}`)
    const { property, unitId: u } = await createProperty(owner.client, org2)
    const guest = await createGuest(owner.client, org2)
    const b = await createBooking(owner.client, { orgId: org2, propertyId: property.id, unitId: u, guestId: guest.id, ...futureWindow(2) })
    const pay = (amount: number, payment_type: 'deposit' | 'refund') =>
      owner.client
        .from('booking_payments')
        .insert({ organization_id: org2, booking_id: b.data!.id, amount, payment_type, payment_method: 'cash', payment_date: today() })
        .select()
        .single()
    await pay(10000, 'deposit')
    await pay(4000, 'deposit')
    await pay(1000, 'refund')
    await owner.client.from('booking_payments').insert({
      organization_id: org2,
      booking_id: b.data!.id,
      amount: 4000,
      payment_type: 'reversal',
      payment_method: 'cash',
      payment_date: today(),
      reverses_payment_id: (await owner.client.from('booking_payments').select('id').eq('booking_id', b.data!.id).eq('amount', 4000).single()).data!.id,
    })
    await owner.client.from('expenses').insert([
      { organization_id: org2, property_id: property.id, category: 'utilities', description: 'Power', amount: 2500, expense_date: today() },
      { organization_id: org2, property_id: property.id, category: 'cleaning', description: 'Voided', amount: 999, expense_date: today() },
    ])
    await owner.client.from('expenses').update({ status: 'void', void_reason: 'Duplicate' }).eq('description', 'Voided').eq('organization_id', org2)
    // Exclude a category from operating income.
    await owner.client.from('expense_categories').update({ include_in_operating_income: false }).eq('organization_id', org2).eq('code', 'other')
    await owner.client.from('expenses').insert({ organization_id: org2, property_id: property.id, category: 'other', description: 'Owner drawings', amount: 700, expense_date: today() })

    const { data, error } = await owner.client.rpc('finance_summary', { org: org2, from_date: today(), to_date: today() })
    expect(error).toBeNull()
    expect(data![0]).toMatchObject({
      payments_received: 10000,
      refunds: 1000,
      net_collected: 9000,
      expenses_operating: 2500,
      expenses_total: 3200,
      estimated_operating_income: 6500,
    })
    // 2 nights × 10,000 + 2,500 cleaning = 22,500; net received 9,000
    expect(data![0]!.outstanding_balance).toBe(13500)

    const outsider = await other.client.rpc('finance_summary', { org: org2, from_date: today(), to_date: today() })
    expect(outsider.data![0]).toMatchObject({ payments_received: 0, outstanding_balance: 0 })
  })
})

