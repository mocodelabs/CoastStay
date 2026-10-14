import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, admin, allowOrgCreation, createBooking, createGuest, createOrg, createProperty, createUser, type TestUser } from './fixtures'

let owner: TestUser
let orgId: string
let propertyId: string
let unitId: string
let feedId: string

beforeAll(async () => {
  await allowOrgCreation(true)
  owner = await createUser('cal-owner')
  orgId = await createOrg(owner, 'Watamu Sync Villas')
  const p = await createProperty(owner.client, orgId)
  propertyId = p.property.id
  unitId = p.unitId
  const feed = await owner.client
    .from('calendar_feeds')
    .insert({ organization_id: orgId, property_id: propertyId, unit_id: unitId, name: 'Airbnb', source: 'airbnb', url: 'https://www.airbnb.com/calendar/ical/123.ics?s=secret' })
    .select()
    .single()
  if (feed.error) throw feed.error
  feedId = feed.data.id
})

afterAll(() => allowOrgCreation(false))

const sync = (events: Array<{ uid: string; start: string; end: string; summary?: string }>, fetchError?: string) =>
  admin.rpc('sync_calendar_feed', { feed_id: feedId, events, fetch_error: fetchError })

async function blocks() {
  const { data } = await owner.client.from('property_blocks').select('start_date, end_date, reason').eq('unit_id', unitId).order('start_date')
  return data
}

describe('calendar feed sync', () => {
  it('imports events as availability blocks, idempotently', async () => {
    const events = [
      { uid: 'a@airbnb.com', start: '2031-03-01', end: '2031-03-04', summary: 'Reserved' },
      { uid: 'b@airbnb.com', start: '2031-03-10', end: '2031-03-12', summary: 'Airbnb (Not available)' },
    ]
    const first = await sync(events)
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ status: 'ok', created: 2, conflicts: 0 })
    const again = await sync(events)
    expect(again.data).toMatchObject({ created: 0, updated: 0, removed: 0 })
    expect(await blocks()).toEqual([
      { start_date: '2031-03-01', end_date: '2031-03-04', reason: 'external_calendar' },
      { start_date: '2031-03-10', end_date: '2031-03-12', reason: 'external_calendar' },
    ])
    // Imported dates now block direct bookings.
    const guest = await createGuest(owner.client, orgId)
    const clash = await createBooking(owner.client, { orgId, propertyId, unitId, guestId: guest.id, checkIn: '2031-03-02', checkOut: '2031-03-05' })
    expect(clash.error?.code).toBe('23P01')
  })

  it('moves blocks when dates change and releases them when the event disappears', async () => {
    const r = await sync([{ uid: 'a@airbnb.com', start: '2031-03-02', end: '2031-03-05', summary: 'Reserved' }])
    expect(r.data).toMatchObject({ updated: 1, removed: 1 })
    expect(await blocks()).toEqual([{ start_date: '2031-03-02', end_date: '2031-03-05', reason: 'external_calendar' }])
  })

  it('flags conflicts with existing stays instead of overriding them, and notifies managers', async () => {
    const guest = await createGuest(owner.client, orgId, 'Direct Guest')
    const direct = await createBooking(owner.client, { orgId, propertyId, unitId, guestId: guest.id, checkIn: '2031-04-01', checkOut: '2031-04-05' })
    expect(direct.error).toBeNull()
    const r = await sync([
      { uid: 'a@airbnb.com', start: '2031-03-02', end: '2031-03-05', summary: 'Reserved' },
      { uid: 'c@airbnb.com', start: '2031-04-03', end: '2031-04-06', summary: 'Reserved' },
    ])
    expect(r.data).toMatchObject({ conflicts: 1 })
    const { data: ev } = await owner.client.from('external_calendar_events').select('status').eq('external_uid', 'c@airbnb.com').single()
    expect(ev!.status).toBe('conflict')
    const { data: booking } = await owner.client.from('bookings').select('status').eq('id', direct.data!.id).single()
    expect(booking!.status).toBe('confirmed')
    const { data: notes } = await owner.client.from('notifications').select('title').eq('organization_id', orgId).like('title', 'Calendar conflict%')
    expect(notes).toHaveLength(1)
  })

  it('records fetch errors on the feed', async () => {
    await sync([], 'Feed returned HTTP 403')
    const { data } = await owner.client.from('calendar_feeds').select('last_status, last_error').eq('id', feedId).single()
    expect(data).toEqual({ last_status: 'error', last_error: 'Feed returned HTTP 403' })
  })

  it('protects feeds and the sync entry point', async () => {
    const manager = await addMember(owner, orgId, 'manager', { propertyIds: [propertyId], label: 'cal-manager' })
    // Private feed URLs are owner-only.
    expect((await manager.client.from('calendar_feeds').select('url')).data).toEqual([])
    // Only the server (service role) may run a sync.
    const userSync = await owner.client.rpc('sync_calendar_feed', { feed_id: feedId, events: [] })
    expect(userSync.error).not.toBeNull()
    // Staff can't edit imported blocks by hand.
    const { data: blk } = await owner.client.from('property_blocks').select('id').eq('reason', 'external_calendar').eq('unit_id', unitId).limit(1).single()
    const del = await owner.client.from('property_blocks').delete().eq('id', blk!.id)
    expect(del.error?.message).toMatch(/external calendar/)
  })

  it('releases imported dates when the owner removes the feed', async () => {
    const before = await owner.client.from('property_blocks').select('id').eq('reason', 'external_calendar').eq('unit_id', unitId)
    expect(before.data!.length).toBeGreaterThan(0)
    const del = await owner.client.from('calendar_feeds').delete().eq('id', feedId)
    expect(del.error).toBeNull()
    const after = await owner.client.from('property_blocks').select('id').eq('reason', 'external_calendar').eq('unit_id', unitId)
    expect(after.data).toEqual([])
  })
})
