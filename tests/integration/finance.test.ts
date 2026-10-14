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
  futureWindow,
  today,
  type Client,
  type TestUser,
} from './fixtures'

let owner: TestUser
let finance: TestUser
let orgId: string
let propertyId: string
let unitId: string
let guestId: string

beforeAll(async () => {
  await allowOrgCreation(true)
  owner = await createUser('fin-owner')
  orgId = await createOrg(owner, 'Malindi Sands')
  const p = await createProperty(owner.client, orgId)
  propertyId = p.property.id
  unitId = p.unitId
  guestId = (await createGuest(owner.client, orgId)).id
  finance = await addMember(owner, orgId, 'finance')
})

afterAll(() => allowOrgCreation(false))

/** 3 nights × 10,000 + 2,500 cleaning = 32,500 */
async function newBooking() {
  const b = await createBooking(owner.client, { orgId, propertyId, unitId, guestId, ...futureWindow(3) })
  if (b.error) throw b.error
  return b.data
}

function pay(
  client: Client,
  bookingId: string,
  amount: number,
  type: 'deposit' | 'balance' | 'payment' | 'refund' | 'adjustment_credit' | 'adjustment_debit',
  extra: Record<string, unknown> = {},
) {
  return client
    .from('booking_payments')
    .insert({
      organization_id: orgId,
      booking_id: bookingId,
      amount,
      payment_type: type,
      payment_method: 'mpesa',
      payment_date: today(),
      ...extra,
    })
    .select()
    .single()
}

async function totals(bookingId: string) {
  const { data } = await owner.client
    .from('bookings')
    .select('total_amount, amount_paid, amount_refunded, adjustment_total, balance_due')
    .eq('id', bookingId)
    .single()
  return data!
}

describe('payments and balances', () => {
  it('tracks deposits and partial payments until the balance is cleared', async () => {
    const b = await newBooking()
    const dep = await pay(finance.client, b.id, 10000, 'deposit', { transaction_reference: `sk${Date.now()}a` })
    expect(dep.error).toBeNull()
    expect(dep.data).toMatchObject({ status: 'recorded', recorded_by: finance.id, currency: 'KES', property_id: propertyId })
    expect(dep.data!.transaction_reference).toBe(dep.data!.transaction_reference!.toUpperCase())
    expect(await totals(b.id)).toMatchObject({ total_amount: 32500, amount_paid: 10000, balance_due: 22500 })

    await pay(finance.client, b.id, 22500, 'balance')
    expect(await totals(b.id)).toMatchObject({ amount_paid: 32500, balance_due: 0 })
  })

  it('records refunds separately and caps them at the net amount received', async () => {
    const b = await newBooking()
    await pay(owner.client, b.id, 20000, 'deposit')
    const tooMuch = await pay(owner.client, b.id, 20000.01, 'refund')
    expect(tooMuch.error?.message).toMatch(/cannot exceed the net amount received/)
    const ok = await pay(owner.client, b.id, 5000, 'refund')
    expect(ok.error).toBeNull()
    expect(await totals(b.id)).toMatchObject({ amount_paid: 20000, amount_refunded: 5000, balance_due: 17500 })
  })

  it('handles cancellation fees: overpayment becomes a credit owed to the guest', async () => {
    const b = await newBooking()
    await pay(owner.client, b.id, 15000, 'deposit')
    const cancel = await owner.client
      .from('bookings')
      .update({ status: 'cancelled', cancellation_fee: 5000, cancellation_reason: 'Late cancellation' })
      .eq('id', b.id)
    expect(cancel.error).toBeNull()
    expect((await totals(b.id)).balance_due).toBe(-10000)
    await pay(owner.client, b.id, 10000, 'refund', { payment_method: 'mpesa' })
    expect((await totals(b.id)).balance_due).toBe(0)
  })

  it('applies non-cash adjustments', async () => {
    const b = await newBooking()
    await pay(owner.client, b.id, 1000, 'adjustment_credit')
    await pay(owner.client, b.id, 250, 'adjustment_debit')
    expect(await totals(b.id)).toMatchObject({ adjustment_total: -750, balance_due: 31750, amount_paid: 0 })
  })
})

describe('ledger integrity', () => {
  it('never allows editing or deleting a recorded transaction', async () => {
    const b = await newBooking()
    const p = await pay(owner.client, b.id, 5000, 'deposit')
    const edit = await owner.client.from('booking_payments').update({ amount: 50000 }).eq('id', p.data!.id)
    expect(edit.error?.message).toMatch(/cannot be edited/)

    const del = await owner.client.from('booking_payments').delete().eq('id', p.data!.id).select()
    expect(del.data).toEqual([])
    const still = await owner.client.from('booking_payments').select('id').eq('id', p.data!.id)
    expect(still.data).toHaveLength(1)

    // Notes remain editable for context.
    const note = await owner.client.from('booking_payments').update({ notes: 'Paid at reception' }).eq('id', p.data!.id)
    expect(note.error).toBeNull()
  })

  it('corrects mistakes with a single reversal per transaction', async () => {
    const b = await newBooking()
    const p = await pay(owner.client, b.id, 8000, 'deposit')
    const rev = await owner.client
      .from('booking_payments')
      .insert({
        organization_id: orgId,
        booking_id: b.id,
        amount: 1, // ignored: reversals always mirror the original amount
        payment_type: 'reversal',
        payment_method: 'cash',
        payment_date: today(),
        reverses_payment_id: p.data!.id,
        notes: 'Entered on the wrong booking',
      })
      .select()
      .single()
    expect(rev.error).toBeNull()
    expect(rev.data).toMatchObject({ amount: 8000, payment_method: 'mpesa' })
    expect(await totals(b.id)).toMatchObject({ amount_paid: 0, balance_due: 32500 })

    const twice = await owner.client
      .from('booking_payments')
      .insert({
        organization_id: orgId,
        booking_id: b.id,
        amount: 8000,
        payment_type: 'reversal',
        payment_method: 'mpesa',
        payment_date: today(),
        reverses_payment_id: p.data!.id,
      })
      .select()
    expect(twice.error).not.toBeNull()
  })

  it('refuses reversing a payment that a refund depends on', async () => {
    const b = await newBooking()
    const p = await pay(owner.client, b.id, 10000, 'deposit')
    await pay(owner.client, b.id, 4000, 'refund')
    const rev = await owner.client
      .from('booking_payments')
      .insert({
        organization_id: orgId,
        booking_id: b.id,
        amount: 10000,
        payment_type: 'reversal',
        payment_method: 'mpesa',
        payment_date: today(),
        reverses_payment_id: p.data!.id,
      })
      .select()
    expect(rev.error?.message).toMatch(/Reverse the related refund first/)
  })

  it('rejects duplicate M-Pesa confirmation codes', async () => {
    const b = await newBooking()
    const code = `QK${Date.now().toString(36).toUpperCase()}`
    expect((await pay(owner.client, b.id, 1000, 'deposit', { transaction_reference: code })).error).toBeNull()
    const dup = await pay(owner.client, b.id, 1000, 'deposit', { transaction_reference: code.toLowerCase() })
    expect(dup.error?.code).toBe('23505')
  })

  it('does not let staff mark a manual entry as verified', async () => {
    const b = await newBooking()
    const v = await pay(owner.client, b.id, 1000, 'deposit', { status: 'verified', verified_at: new Date().toISOString() })
    expect(v.error?.message).toMatch(/recorded or pending/)
    // A trusted integration (service role) may.
    const svc = await pay(admin, b.id, 1000, 'deposit', {
      status: 'verified',
      verified_at: new Date().toISOString(),
      verification_source: 'mpesa_callback',
    })
    expect(svc.error).toBeNull()
  })

  it('rejects future-dated payments and disabled methods', async () => {
    const b = await newBooking()
    const future = await pay(owner.client, b.id, 1000, 'deposit', { payment_date: '2099-01-01' })
    expect(future.error?.message).toMatch(/future/)

    await owner.client.from('organization_settings').update({ enabled_payment_methods: ['mpesa', 'cash'] }).eq('organization_id', orgId)
    const card = await pay(owner.client, b.id, 1000, 'deposit', { payment_method: 'card' })
    expect(card.error?.message).toMatch(/disabled/)
    await owner.client
      .from('organization_settings')
      .update({ enabled_payment_methods: ['mpesa', 'bank_transfer', 'cash', 'card', 'platform_payout', 'other'] })
      .eq('organization_id', orgId)
  })

  it('writes an audit trail for financial changes', async () => {
    const b = await newBooking()
    const p = await pay(finance.client, b.id, 3000, 'deposit')
    const { data } = await owner.client
      .from('audit_logs')
      .select('actor_id, action, entity_type')
      .eq('entity_type', 'booking_payments')
      .eq('entity_id', p.data!.id)
    expect(data).toEqual([{ actor_id: finance.id, action: 'insert', entity_type: 'booking_payments' }])
  })
})

describe('finance permissions', () => {
  it('limits who can see and record money', async () => {
    const b = await newBooking()
    await pay(owner.client, b.id, 1000, 'deposit')
    const manager = await addMember(owner, orgId, 'manager', { propertyIds: [propertyId] })
    const managerWithFinance = await addMember(owner, orgId, 'manager', { propertyIds: [propertyId], canViewFinances: true })
    const hk = await addMember(owner, orgId, 'housekeeping', { propertyIds: [propertyId] })

    expect((await manager.client.from('booking_payments').select('id').eq('booking_id', b.id)).data).toEqual([])
    expect((await managerWithFinance.client.from('booking_payments').select('id').eq('booking_id', b.id)).data).toHaveLength(1)

    expect((await pay(manager.client, b.id, 100, 'payment')).error?.code).toBe('42501')
    expect((await pay(hk.client, b.id, 100, 'payment')).error?.code).toBe('42501')
    expect((await pay(managerWithFinance.client, b.id, 100, 'payment')).error).toBeNull()
  })
})

describe('expenses', () => {
  it('records, edits and voids expenses — never deletes them', async () => {
    const e = await finance.client
      .from('expenses')
      .insert({
        organization_id: orgId,
        property_id: propertyId,
        category: 'utilities',
        description: 'KPLC tokens',
        amount: 4500,
        expense_date: today(),
        payment_method: 'mpesa',
      })
      .select()
      .single()
    expect(e.error).toBeNull()
    expect(e.data).toMatchObject({ status: 'recorded', created_by: finance.id, currency: 'KES' })

    const bad = await finance.client
      .from('expenses')
      .insert({ organization_id: orgId, category: 'not_a_category', description: 'x', amount: 1, expense_date: today() })
      .select()
    expect(bad.error).not.toBeNull()

    const noReason = await finance.client.from('expenses').update({ status: 'void' }).eq('id', e.data!.id)
    expect(noReason.error?.message).toMatch(/reason/)
    const voided = await finance.client
      .from('expenses')
      .update({ status: 'void', void_reason: 'Duplicate entry' })
      .eq('id', e.data!.id)
      .select()
      .single()
    expect(voided.data).toMatchObject({ status: 'void', voided_by: finance.id })

    const edit = await finance.client.from('expenses').update({ amount: 1 }).eq('id', e.data!.id)
    expect(edit.error?.message).toMatch(/voided/)
    const del = await owner.client.from('expenses').delete().eq('id', e.data!.id).select()
    expect(del.data).toEqual([])
  })
})
