import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addMember,
  admin,
  allowOrgCreation,
  createBooking,
  createGuest,
  createOrg,
  createProperty,
  createUser,
  today,
  type TestUser,
} from './fixtures'

let owner: TestUser
let orgId: string
let propertyId: string
let unitId: string
let guestId: string

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

beforeAll(async () => {
  await allowOrgCreation(true)
  owner = await createUser('pd-owner')
  orgId = await createOrg(owner, 'Kikambala Cottages')
  const p = await createProperty(owner.client, orgId, { standard_nightly_rate: 10000, cleaning_fee: 0 })
  propertyId = p.property.id
  unitId = p.unitId
  guestId = (await createGuest(owner.client, orgId, 'Halima Omar')).id
})

afterAll(() => allowOrgCreation(false))

describe('reports', () => {
  it('splits a stay across months by night and computes occupancy, ADR and RevPAR inputs', async () => {
    // 4 nights: 29, 30 Nov (2 in November) and 1, 2 Dec (2 in December), 10,000/night + 2,000 fees.
    const b = await owner.client
      .from('bookings')
      .insert({
        organization_id: orgId,
        property_id: propertyId,
        unit_id: unitId,
        guest_id: guestId,
        check_in_date: '2030-11-29',
        check_out_date: '2030-12-03',
        nightly_rate: 10000,
        additional_fees: 2000,
        status: 'confirmed',
      })
      .select()
      .single()
    expect(b.error).toBeNull()
    // A 3-night owner block in November reduces available nights.
    await owner.client
      .from('property_blocks')
      .insert({ organization_id: orgId, property_id: propertyId, unit_id: unitId, start_date: '2030-11-10', end_date: '2030-11-13', reason: 'owner_use' })

    const nov = await owner.client.rpc('report_property_performance', { org: orgId, from_date: '2030-11-01', to_date: '2030-11-30' })
    expect(nov.error).toBeNull()
    expect(nov.data![0]).toMatchObject({
      unit_count: 1,
      available_nights: 27, // 30 − 3 blocked
      blocked_nights: 3,
      occupied_nights: 2,
      accommodation_revenue: 20000,
      reservation_value: 21000, // (40,000 + 2,000) / 4 × 2
    })
    const dec = await owner.client.rpc('report_property_performance', { org: orgId, from_date: '2030-12-01', to_date: '2030-12-31' })
    expect(dec.data![0]).toMatchObject({ occupied_nights: 2, accommodation_revenue: 20000, reservation_value: 21000 })

    const monthly = await owner.client.rpc('report_monthly', { org: orgId, first_month: '2030-11-01', months: 2 })
    expect(monthly.data!.map((m) => [m.month, m.occupied_nights, m.reservation_value])).toEqual([
      ['2030-11-01', 2, 21000],
      ['2030-12-01', 2, 21000],
    ])
  })

  it('excludes cancelled and pending stays from occupancy', async () => {
    const pend = await createBooking(owner.client, { orgId, propertyId, unitId, guestId, checkIn: '2031-02-01', checkOut: '2031-02-03', status: 'pending' })
    const canc = await createBooking(owner.client, { orgId, propertyId, unitId, guestId, checkIn: '2031-02-10', checkOut: '2031-02-12' })
    await owner.client.from('bookings').update({ status: 'cancelled' }).eq('id', canc.data!.id)
    const r = await owner.client.rpc('report_property_performance', { org: orgId, from_date: '2031-02-01', to_date: '2031-02-28' })
    expect(r.data![0]!.occupied_nights).toBe(0)
    expect(r.data![0]!.reservation_value).toBe(20000 + 2500) // pending counts as reservation value
    void pend
  })

  it('gives today’s operational snapshot', async () => {
    const t = today()
    await createBooking(owner.client, { orgId, propertyId, unitId, guestId, checkIn: t, checkOut: addDays(t, 2) })
    const { data, error } = await owner.client.rpc('dashboard_today', { org: orgId })
    expect(error).toBeNull()
    expect(data![0]).toMatchObject({ today: t, properties: 1, active_units: 1, occupied_units: 1, available_units: 0, arrivals: 1 })
  })

  it('reports nothing about other organizations', async () => {
    const stranger = await createUser('pd-stranger')
    const r = await stranger.client.rpc('report_property_performance', { org: orgId, from_date: '2030-11-01', to_date: '2030-11-30' })
    expect(r.data).toEqual([])
  })
})

describe('reminders and notifications', () => {
  it('notifies the right people once, and prepares the guest message once', async () => {
    const org = await createOrg(owner, `Reminder Test ${Date.now()}`)
    const { property, unitId: u } = await createProperty(owner.client, org)
    const other = await createProperty(owner.client, org)
    const guest = await owner.client
      .from('guests')
      .insert({ organization_id: org, full_name: 'Neema Wanjiru', phone: '+254733000222' })
      .select()
      .single()
    const cleaner = await addMember(owner, org, 'housekeeping', { propertyIds: [property.id], label: 'rem-cleaner' })
    const otherCleaner = await addMember(owner, org, 'housekeeping', { propertyIds: [other.property.id], label: 'rem-other' })
    const finance = await addMember(owner, org, 'finance', { label: 'rem-finance' })
    const tomorrow = addDays(today(), 1)
    const b = await createBooking(owner.client, { orgId: org, propertyId: property.id, unitId: u, guestId: guest.data!.id, checkIn: tomorrow, checkOut: addDays(tomorrow, 3) })

    const first = await owner.client.rpc('run_reminders', { target_org: org })
    expect(first.error).toBeNull()
    expect(first.data![0]!.notifications).toBeGreaterThan(0)
    await owner.client.rpc('run_reminders', { target_org: org })

    const arrivals = async (c: TestUser) =>
      (await c.client.from('notifications').select('title').eq('organization_id', org).eq('notification_type', 'upcoming_check_in')).data
    expect(await arrivals(owner)).toEqual([{ title: 'Arrival tomorrow: Neema Wanjiru' }])
    expect(await arrivals(cleaner)).toHaveLength(1)
    expect(await arrivals(otherCleaner)).toEqual([])
    expect(await arrivals(finance)).toEqual([])

    // Balance is due (arrival within the 3-day window) → finance hears about it, cleaners don't.
    const overdue = await finance.client.from('notifications').select('id').eq('organization_id', org).eq('notification_type', 'overdue_balance')
    expect(overdue.data).toHaveLength(1)
    expect((await cleaner.client.from('notifications').select('id').eq('notification_type', 'overdue_balance').eq('organization_id', org)).data).toEqual([])

    const msgs = await owner.client.from('communication_logs').select('template_key, status, body, recipient').eq('booking_id', b.data!.id)
    expect(msgs.data!.map((x) => x.template_key).sort()).toEqual(['balance_due', 'check_in_instructions'])
    const checkIn = msgs.data!.find((x) => x.template_key === 'check_in_instructions')!
    expect(checkIn).toMatchObject({ status: 'prepared', recipient: '+254733000222' })
    expect(checkIn.body).toContain('Hello Neema')
    expect(checkIn.body).not.toContain('{{guest_name}}')
  })

  it('respects notification preferences', async () => {
    const org = await createOrg(owner, `Prefs Test ${Date.now()}`)
    const { property, unitId: u } = await createProperty(owner.client, org)
    const guest = await owner.client.from('guests').insert({ organization_id: org, full_name: 'Quiet Guest' }).select().single()
    await owner.client
      .from('organization_settings')
      .update({ notification_preferences: { upcoming_check_in: false, overdue_balance: false } })
      .eq('organization_id', org)
    const tomorrow = addDays(today(), 1)
    await createBooking(owner.client, { orgId: org, propertyId: property.id, unitId: u, guestId: guest.data!.id, checkIn: tomorrow, checkOut: addDays(tomorrow, 1) })
    await owner.client.rpc('run_reminders', { target_org: org })
    const { data } = await owner.client.from('notifications').select('notification_type').eq('organization_id', org)
    expect(data!.filter((n) => ['upcoming_check_in', 'overdue_balance'].includes(n.notification_type))).toEqual([])
    // Guest without a phone: the message is logged as skipped, never sent.
    const logs = await owner.client.from('communication_logs').select('status, error').eq('organization_id', org).eq('template_key', 'check_in_instructions')
    expect(logs.data).toEqual([{ status: 'skipped', error: 'Guest has no phone number' }])
  })

  it('only owners can trigger a sweep, and only for their own business', async () => {
    const manager = await addMember(owner, orgId, 'manager', { propertyIds: [propertyId], label: 'rem-manager' })
    expect((await manager.client.rpc('run_reminders', { target_org: orgId })).error?.code).toBe('42501')
    expect((await owner.client.rpc('run_reminders')).error?.code).toBe('42501')
    // The scheduler path (no user) processes every organization.
    const all = await admin.rpc('run_reminders')
    expect(all.error).toBeNull()
  })

  it('notifies a caretaker when a task is assigned to them, and lets them mark notifications read', async () => {
    const cleaner = await addMember(owner, orgId, 'housekeeping', { propertyIds: [propertyId], label: 'assign-cleaner' })
    const task = await owner.client
      .from('housekeeping_tasks')
      .insert({ organization_id: orgId, property_id: propertyId, unit_id: unitId, title: 'Wash curtains', task_type: 'deep_clean', scheduled_at: new Date().toISOString(), assigned_to: cleaner.id })
      .select()
      .single()
    const { data } = await cleaner.client.from('notifications').select('id, title, read_at').eq('related_entity_id', task.data!.id)
    expect(data).toEqual([{ id: expect.any(String), title: 'New task: Wash curtains', read_at: null }])
    const read = await cleaner.client.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', data![0]!.id).select().single()
    expect(read.data!.read_at).not.toBeNull()
    const tamper = await cleaner.client.from('notifications').update({ title: 'hacked' }).eq('id', data![0]!.id)
    expect(tamper.error).not.toBeNull()
    // Other users can't see it.
    expect((await owner.client.from('notifications').select('id').eq('id', data![0]!.id)).data).toEqual([])
  })

  it('lets staff mark prepared messages as sent or skipped, nothing else', async () => {
    const org = await createOrg(owner, `Outbox Test ${Date.now()}`)
    const { property, unitId: u } = await createProperty(owner.client, org)
    const g = await owner.client.from('guests').insert({ organization_id: org, full_name: 'Prepared Guest', phone: '+254700111222' }).select().single()
    const tomorrow = addDays(today(), 1)
    await createBooking(owner.client, { orgId: org, propertyId: property.id, unitId: u, guestId: g.data!.id, checkIn: tomorrow, checkOut: addDays(tomorrow, 2) })
    await owner.client.rpc('run_reminders', { target_org: org })
    const prepared = await owner.client.from('communication_logs').select('id').eq('organization_id', org).eq('status', 'prepared').limit(1).single()
    const id = prepared.data!.id
    expect((await owner.client.from('communication_logs').update({ body: 'edited' }).eq('id', id)).error).not.toBeNull()
    expect((await owner.client.from('communication_logs').update({ status: 'opened' }).eq('id', id)).error).toBeNull()
    expect((await owner.client.from('communication_logs').update({ status: 'prepared' }).eq('id', id)).error).not.toBeNull()
  })
})
