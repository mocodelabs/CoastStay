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
let manager: TestUser
let cleaner: TestUser
let orgId: string
let propertyId: string
let unitId: string
let guestId: string

beforeAll(async () => {
  await allowOrgCreation(true)
  owner = await createUser('ops-owner')
  orgId = await createOrg(owner, 'Lamu Lodges')
  const p = await createProperty(owner.client, orgId)
  propertyId = p.property.id
  unitId = p.unitId
  guestId = (await createGuest(owner.client, orgId)).id
  manager = await addMember(owner, orgId, 'manager', { propertyIds: [propertyId] })
  cleaner = await addMember(owner, orgId, 'housekeeping', { propertyIds: [propertyId] })
})

afterAll(() => allowOrgCreation(false))

async function turnoverTasks(bookingId: string) {
  const { data } = await owner.client.from('housekeeping_tasks').select('*').eq('booking_id', bookingId)
  return data ?? []
}

describe('turnover task generation', () => {
  it('creates exactly one cleaning task per stay, with the default checklist', async () => {
    const b = await createBooking(owner.client, { orgId, propertyId, unitId, guestId, ...futureWindow(2) })
    const id = b.data!.id
    let tasks = await turnoverTasks(id)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ task_type: 'turnover_clean', status: 'pending', generation_key: `turnover:${id}` })

    const { count } = await owner.client
      .from('housekeeping_checklist_items')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', tasks[0]!.id)
    expect(count).toBe(13)

    // Repeated processing (check in, check out, notes edits) never duplicates it.
    await owner.client.from('bookings').update({ status: 'checked_in' }).eq('id', id)
    await owner.client.from('bookings').update({ internal_notes: 'VIP' }).eq('id', id)
    await owner.client.from('bookings').update({ status: 'checked_out' }).eq('id', id)
    tasks = await turnoverTasks(id)
    expect(tasks).toHaveLength(1)
    // …and checkout does not complete it.
    expect(tasks[0]!.status).toBe('pending')
  })

  it('does not create tasks for inquiries, and cancels the pending task when a stay is cancelled', async () => {
    const inquiry = await createBooking(owner.client, { orgId, propertyId, unitId, guestId, ...futureWindow(), status: 'inquiry' })
    expect(await turnoverTasks(inquiry.data!.id)).toHaveLength(0)

    const b = await createBooking(owner.client, { orgId, propertyId, unitId, guestId, ...futureWindow() })
    await owner.client.from('bookings').update({ status: 'cancelled' }).eq('id', b.data!.id)
    const [task] = await turnoverTasks(b.data!.id)
    expect(task!.status).toBe('cancelled')
  })

  it('brings the clean forward when a guest checks out early', async () => {
    const b = await createBooking(owner.client, { orgId, propertyId, unitId, guestId, ...futureWindow(5) })
    const [before] = await turnoverTasks(b.data!.id)
    expect(new Date(before!.scheduled_at).getTime()).toBeGreaterThan(Date.now())
    await owner.client.from('bookings').update({ status: 'checked_in' }).eq('id', b.data!.id)
    await owner.client.from('bookings').update({ status: 'checked_out' }).eq('id', b.data!.id)
    const [after] = await turnoverTasks(b.data!.id)
    expect(new Date(after!.scheduled_at).getTime()).toBeLessThanOrEqual(Date.now() + 1000)
    expect(after!.status).toBe('pending')
    expect(new Date(after!.due_at!).getTime()).toBeGreaterThanOrEqual(new Date(after!.scheduled_at).getTime())
  })

  it('reschedules the pending task when the check-out date moves', async () => {
    const w = futureWindow(2)
    const b = await createBooking(owner.client, { orgId, propertyId, unitId, guestId, ...w })
    const [before] = await turnoverTasks(b.data!.id)
    const later = new Date(`${w.checkOut}T00:00:00Z`)
    later.setUTCDate(later.getUTCDate() + 1)
    await owner.client.from('bookings').update({ check_out_date: later.toISOString().slice(0, 10) }).eq('id', b.data!.id)
    const [after] = await turnoverTasks(b.data!.id)
    expect(new Date(after!.scheduled_at).getTime() - new Date(before!.scheduled_at).getTime()).toBe(86_400_000)
  })
})

describe('housekeeping workflow and permissions', () => {
  it('lets a cleaner progress their own task but not edit details or sign off inspections', async () => {
    const b = await createBooking(owner.client, { orgId, propertyId, unitId, guestId, ...futureWindow() })
    const [task] = await turnoverTasks(b.data!.id)
    await manager.client
      .from('housekeeping_tasks')
      .update({ assigned_to: cleaner.id, inspection_required: true })
      .eq('id', task!.id)

    const rename = await cleaner.client.from('housekeeping_tasks').update({ title: 'Nap' }).eq('id', task!.id)
    expect(rename.error?.message).toMatch(/Only a manager/)

    const start = await cleaner.client.from('housekeeping_tasks').update({ status: 'in_progress' }).eq('id', task!.id).select().single()
    expect(start.data!.started_at).not.toBeNull()

    const { data: items } = await cleaner.client.from('housekeeping_checklist_items').select('id').eq('task_id', task!.id)
    const tick = await cleaner.client
      .from('housekeeping_checklist_items')
      .update({ is_completed: true })
      .eq('id', items![0]!.id)
      .select()
      .single()
    expect(tick.data).toMatchObject({ is_completed: true, completed_by: cleaner.id })

    const selfComplete = await cleaner.client.from('housekeeping_tasks').update({ status: 'completed' }).eq('id', task!.id)
    expect(selfComplete.error).not.toBeNull()
    expect((await cleaner.client.from('housekeeping_tasks').update({ status: 'awaiting_inspection' }).eq('id', task!.id)).error).toBeNull()

    const signOff = await manager.client
      .from('housekeeping_tasks')
      .update({ status: 'completed', completion_notes: 'Spotless' })
      .eq('id', task!.id)
      .select()
      .single()
    expect(signOff.data).toMatchObject({ status: 'completed', inspected_by: manager.id })
    expect(signOff.data!.completed_at).not.toBeNull()
  })

  it('removing a staff member keeps their completed work and just unassigns it', async () => {
    const temp = await addMember(owner, orgId, 'housekeeping', { propertyIds: [propertyId], label: 'temp-cleaner' })
    const b = await createBooking(owner.client, { orgId, propertyId, unitId, guestId, ...futureWindow() })
    const [task] = await turnoverTasks(b.data!.id)
    await owner.client.from('housekeeping_tasks').update({ assigned_to: temp.id }).eq('id', task!.id)
    await temp.client.from('housekeeping_tasks').update({ status: 'in_progress' }).eq('id', task!.id)
    expect((await temp.client.from('housekeeping_tasks').update({ status: 'completed' }).eq('id', task!.id)).error).toBeNull()

    const removed = await owner.client.from('organization_members').delete().eq('organization_id', orgId).eq('user_id', temp.id)
    expect(removed.error).toBeNull()
    const [after] = await turnoverTasks(b.data!.id)
    expect(after).toMatchObject({ status: 'completed', assigned_to: null })
  })

  it('hides tasks of unassigned properties from caretakers', async () => {
    const other = await createProperty(owner.client, orgId)
    await owner.client.from('housekeeping_tasks').insert({
      organization_id: orgId,
      property_id: other.property.id,
      unit_id: other.unitId,
      title: 'Deep clean',
      task_type: 'deep_clean',
      scheduled_at: new Date().toISOString(),
    })
    const { data } = await cleaner.client.from('housekeeping_tasks').select('property_id').eq('organization_id', orgId)
    expect(data!.every((t) => t.property_id === propertyId)).toBe(true)
  })
})

describe('maintenance', () => {
  it('lets caretakers report issues but only managers assign, cost and close them', async () => {
    const r = await cleaner.client
      .from('maintenance_requests')
      .insert({
        organization_id: orgId,
        property_id: propertyId,
        title: 'AC dripping in master bedroom',
        priority: 'high',
        category: 'air_conditioning',
        estimated_cost: 999999,
        status: 'closed',
      })
      .select()
      .single()
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ status: 'reported', estimated_cost: null, reported_by: cleaner.id })

    const cost = await cleaner.client.from('maintenance_requests').update({ actual_cost: 1 }).eq('id', r.data!.id).select()
    expect(cost.data ?? []).toEqual([])

    const assign = await manager.client
      .from('maintenance_requests')
      .update({ assigned_to: cleaner.id, estimated_cost: 3500 })
      .eq('id', r.data!.id)
      .select()
      .single()
    expect(assign.data).toMatchObject({ status: 'assigned', estimated_cost: 3500 })

    // The assignee can progress the work…
    expect((await cleaner.client.from('maintenance_requests').update({ status: 'in_progress' }).eq('id', r.data!.id)).error).toBeNull()
    // …but not change costs or close it.
    const sneaky = await cleaner.client.from('maintenance_requests').update({ actual_cost: 10 }).eq('id', r.data!.id)
    expect(sneaky.error?.message).toMatch(/Only a manager/)
    const close = await cleaner.client.from('maintenance_requests').update({ status: 'closed' }).eq('id', r.data!.id)
    expect(close.error?.message).toMatch(/Only a manager/)

    const resolved = await manager.client
      .from('maintenance_requests')
      .update({ status: 'resolved', actual_cost: 4200, resolution_notes: 'Replaced drain pipe' })
      .eq('id', r.data!.id)
      .select()
      .single()
    expect(resolved.data!.resolved_at).not.toBeNull()
  })
})

describe('inventory', () => {
  it('derives stock from movements and refuses negative stock', async () => {
    const item = await manager.client
      .from('inventory_items')
      .insert({ organization_id: orgId, property_id: propertyId, name: 'Toilet rolls', unit_of_measure: 'rolls', minimum_quantity: 10, quantity_on_hand: 500 })
      .select()
      .single()
    expect(item.error).toBeNull()
    expect(item.data!.quantity_on_hand).toBe(0)

    const move = (client: typeof owner.client, movement_type: 'receipt' | 'consumption' | 'adjustment', quantity: number) =>
      client
        .from('inventory_movements')
        .insert({ organization_id: orgId, inventory_item_id: item.data!.id, movement_type, quantity })
        .select()
        .single()

    expect((await move(manager.client, 'receipt', 24)).data!.balance_after).toBe(24)
    expect((await move(cleaner.client, 'consumption', -4)).data!.balance_after).toBe(20)
    const over = await move(cleaner.client, 'consumption', -21)
    expect(over.error?.message).toMatch(/Not enough stock/)
    const wrongSign = await move(cleaner.client, 'consumption', 5)
    expect(wrongSign.error).not.toBeNull()

    // Caretakers can't adjust or receive stock; direct quantity edits are blocked for everyone.
    expect((await move(cleaner.client, 'adjustment', 100)).error?.code).toBe('42501')
    expect((await move(cleaner.client, 'receipt', 100)).error?.code).toBe('42501')
    const direct = await owner.client.from('inventory_items').update({ quantity_on_hand: 999 }).eq('id', item.data!.id)
    expect(direct.error?.message).toMatch(/only through stock movements/)

    const { data: recon } = await owner.client
      .from('inventory_reconciliation')
      .select('quantity_on_hand, ledger_quantity, difference')
      .eq('inventory_item_id', item.data!.id)
      .single()
    expect(recon).toEqual({ quantity_on_hand: 20, ledger_quantity: 20, difference: 0 })

    const del = await owner.client.from('inventory_movements').delete().eq('inventory_item_id', item.data!.id).select()
    expect(del.data).toEqual([])
  })
})
