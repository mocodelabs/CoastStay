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
  type TestUser,
} from './fixtures'

let owner: TestUser
let orgId: string
let propertyId: string
let unitId: string
let guestId: string

const base = () => ({ orgId, propertyId, unitId, guestId })

beforeAll(async () => {
  await allowOrgCreation(true)
  owner = await createUser('bk-owner')
  orgId = await createOrg(owner, 'Kilifi Bay Homes')
  const p = await createProperty(owner.client, orgId, { max_guests: 4 })
  propertyId = p.property.id
  unitId = p.unitId
  guestId = (await createGuest(owner.client, orgId)).id
})

afterAll(() => allowOrgCreation(false))

describe('booking creation', () => {
  it('derives nights, totals, reference and balance in the database', async () => {
    const w = futureWindow(7)
    const { data, error } = await owner.client
      .from('bookings')
      .insert({
        ...{ organization_id: orgId, property_id: propertyId, unit_id: unitId, guest_id: guestId },
        check_in_date: w.checkIn,
        check_out_date: w.checkOut,
        nightly_rate: 12500,
        cleaning_fee: 3000,
        additional_fees: 1500.5,
        discount_amount: 5000,
      })
      .select()
      .single()
    expect(error).toBeNull()
    expect(data).toMatchObject({
      nights: 7,
      accommodation_amount: 87500,
      total_amount: 87000.5,
      amount_paid: 0,
      balance_due: 87000.5,
      currency: 'KES',
      status: 'confirmed',
      created_by: owner.id,
    })
    expect(data!.booking_reference).toMatch(/^CS-\d{4}-[A-HJ-NP-Z2-9]{5}$/)
    expect(data!.confirmed_at).not.toBeNull()
  })

  it('rejects invalid dates, over-capacity stays and negative totals', async () => {
    const w = futureWindow()
    const backwards = await createBooking(owner.client, { ...base(), checkIn: w.checkOut, checkOut: w.checkIn })
    expect(backwards.error).not.toBeNull()

    const crowded = await createBooking(owner.client, { ...base(), ...futureWindow(), adults: 5 })
    expect(crowded.error?.message).toMatch(/sleeps at most 4/)

    const negative = await owner.client
      .from('bookings')
      .insert({
        organization_id: orgId,
        property_id: propertyId,
        unit_id: unitId,
        guest_id: guestId,
        ...(() => {
          const x = futureWindow(1)
          return { check_in_date: x.checkIn, check_out_date: x.checkOut }
        })(),
        nightly_rate: 1000,
        discount_amount: 5000,
      })
      .select()
    expect(negative.error).not.toBeNull()
  })

  it('does not let clients write payment totals directly', async () => {
    const b = await createBooking(owner.client, { ...base(), ...futureWindow() })
    const { error } = await owner.client.from('bookings').update({ amount_paid: 999999 }).eq('id', b.data!.id)
    expect(error?.message).toMatch(/calculated from recorded transactions/)
  })
})

describe('double-booking prevention', () => {
  it('rejects overlapping active reservations on the same unit', async () => {
    const w = futureWindow(5)
    const first = await createBooking(owner.client, { ...base(), ...w })
    expect(first.error).toBeNull()
    const overlap = await createBooking(owner.client, {
      ...base(),
      checkIn: w.checkIn,
      checkOut: w.checkOut,
      status: 'pending',
    })
    expect(overlap.error?.code).toBe('23P01')
    expect(overlap.error?.message).toMatch(/overlap/)
  })

  it('allows a same-day turnover (check-out day is free)', async () => {
    const w = futureWindow(3)
    expect((await createBooking(owner.client, { ...base(), ...w })).error).toBeNull()
    const next = futureWindowStartingAt(w.checkOut, 2)
    expect((await createBooking(owner.client, { ...base(), ...next })).error).toBeNull()
  })

  it('ignores inquiries and frees dates when a booking is cancelled', async () => {
    const w = futureWindow(4)
    const inquiry = await createBooking(owner.client, { ...base(), ...w, status: 'inquiry' })
    expect(inquiry.error).toBeNull()
    const confirmed = await createBooking(owner.client, { ...base(), ...w })
    expect(confirmed.error).toBeNull()

    // The inquiry can no longer be confirmed into the occupied slot.
    const promote = await owner.client.from('bookings').update({ status: 'confirmed' }).eq('id', inquiry.data!.id)
    expect(promote.error?.code).toBe('23P01')

    const cancel = await owner.client
      .from('bookings')
      .update({ status: 'cancelled', cancellation_reason: 'Guest changed plans' })
      .eq('id', confirmed.data!.id)
    expect(cancel.error).toBeNull()
    const promoteAgain = await owner.client.from('bookings').update({ status: 'confirmed' }).eq('id', inquiry.data!.id)
    expect(promoteAgain.error).toBeNull()
  })

  it('is safe under concurrent requests', async () => {
    const w = futureWindow(3)
    const attempts = await Promise.all(
      Array.from({ length: 6 }, () => createBooking(owner.client, { ...base(), ...w })),
    )
    const succeeded = attempts.filter((a) => !a.error)
    const conflicted = attempts.filter((a) => a.error?.code === '23P01')
    expect(succeeded).toHaveLength(1)
    expect(conflicted).toHaveLength(5)
  })

  it('prevents bookings over blocks and blocks over bookings', async () => {
    const w = futureWindow(3)
    const block = await owner.client
      .from('property_blocks')
      .insert({ organization_id: orgId, property_id: propertyId, unit_id: unitId, start_date: w.checkIn, end_date: w.checkOut, reason: 'owner_use' })
      .select()
      .single()
    expect(block.error).toBeNull()
    expect(block.data!.created_by).toBe(owner.id)
    const clash = await createBooking(owner.client, { ...base(), ...w })
    expect(clash.error?.code).toBe('23P01')

    const w2 = futureWindow(3)
    expect((await createBooking(owner.client, { ...base(), ...w2 })).error).toBeNull()
    const blockClash = await owner.client
      .from('property_blocks')
      .insert({ organization_id: orgId, property_id: propertyId, unit_id: unitId, start_date: w2.checkIn, end_date: w2.checkOut })
      .select()
    expect(blockClash.error?.code).toBe('23P01')
  })

  it('allows the same dates on a different unit of the property', async () => {
    const { data: unit2 } = await owner.client
      .from('property_units')
      .insert({ organization_id: orgId, property_id: propertyId, name: 'Garden cottage' })
      .select()
      .single()
    const w = futureWindow(2)
    expect((await createBooking(owner.client, { ...base(), ...w })).error).toBeNull()
    expect((await createBooking(owner.client, { ...base(), unitId: unit2!.id, ...w })).error).toBeNull()
  })

  it('validates a date change against other stays', async () => {
    const a = futureWindow(3)
    const b = futureWindow(3)
    await createBooking(owner.client, { ...base(), ...a })
    const second = await createBooking(owner.client, { ...base(), ...b })
    const move = await owner.client
      .from('bookings')
      .update({ check_in_date: a.checkIn, check_out_date: a.checkOut })
      .eq('id', second.data!.id)
    expect(move.error?.code).toBe('23P01')
  })
})

describe('status workflow', () => {
  it('follows inquiry → confirmed → checked in → checked out and then locks pricing', async () => {
    const b = await createBooking(owner.client, { ...base(), ...futureWindow(), status: 'inquiry' })
    const id = b.data!.id
    const bad = await owner.client.from('bookings').update({ status: 'checked_in' }).eq('id', id)
    expect(bad.error?.message).toMatch(/cannot move from inquiry to checked_in/)

    for (const status of ['confirmed', 'checked_in', 'checked_out'] as const) {
      const r = await owner.client.from('bookings').update({ status }).eq('id', id).select().single()
      expect(r.error).toBeNull()
    }
    const { data } = await owner.client.from('bookings').select('checked_in_at, checked_out_at').eq('id', id).single()
    expect(data!.checked_in_at).not.toBeNull()
    expect(data!.checked_out_at).not.toBeNull()

    const reprice = await owner.client.from('bookings').update({ nightly_rate: 1 }).eq('id', id)
    expect(reprice.error?.message).toMatch(/locked/)
  })

  it('never reopens a cancelled booking', async () => {
    const b = await createBooking(owner.client, { ...base(), ...futureWindow() })
    await owner.client.from('bookings').update({ status: 'cancelled' }).eq('id', b.data!.id)
    const reopen = await owner.client.from('bookings').update({ status: 'checked_in' }).eq('id', b.data!.id)
    expect(reopen.error).not.toBeNull()
  })
})

describe('property-scoped staff', () => {
  it('managers only see and book their assigned properties', async () => {
    const other = await createProperty(owner.client, orgId)
    const manager = await addMember(owner, orgId, 'manager', { propertyIds: [propertyId] })

    const { data: visible } = await manager.client.from('properties').select('id').eq('organization_id', orgId)
    expect(visible!.map((p) => p.id)).toEqual([propertyId])

    const guest = await createGuest(manager.client, orgId, 'Managed Guest')
    const blocked = await createBooking(manager.client, {
      orgId,
      propertyId: other.property.id,
      unitId: other.unitId,
      guestId: guest.id,
      ...futureWindow(),
    })
    expect(blocked.error?.code).toBe('42501')
    const allowed = await createBooking(manager.client, { ...base(), guestId: guest.id, ...futureWindow() })
    expect(allowed.error).toBeNull()
  })

  it('housekeeping staff cannot read guests, bookings or payments', async () => {
    const hk = await addMember(owner, orgId, 'housekeeping', { propertyIds: [propertyId] })
    const [guests, bookings, payments, props] = await Promise.all([
      hk.client.from('guests').select('id').eq('organization_id', orgId),
      hk.client.from('bookings').select('id').eq('organization_id', orgId),
      hk.client.from('booking_payments').select('id').eq('organization_id', orgId),
      hk.client.from('properties').select('id').eq('organization_id', orgId),
    ])
    expect(guests.data).toEqual([])
    expect(bookings.data).toEqual([])
    expect(payments.data).toEqual([])
    expect(props.data!.map((p) => p.id)).toEqual([propertyId])
  })
})

function futureWindowStartingAt(checkIn: string, nights: number) {
  const start = new Date(`${checkIn}T00:00:00Z`)
  const end = new Date(start.getTime() + nights * 86_400_000)
  return { checkIn, checkOut: end.toISOString().slice(0, 10) }
}
