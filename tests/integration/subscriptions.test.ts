import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PLANS, TRIAL_DAYS } from '@/lib/plans'
import { addMember, admin, allowOrgCreation, anonClient, createGuest, createOrg, createProperty, createUser, type TestUser } from './fixtures'

let owner: TestUser
let manager: TestUser
let platformAdmin: TestUser
let org: string
let propertyId: string

async function setDates(orgId: string, dates: { trial_ends_at?: string; current_period_end?: string | null }) {
  const { error } = await admin.from('subscriptions').update(dates).eq('organization_id', orgId)
  if (error) throw error
}
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()
let refCounter = 0
const ref = () => `TST${Date.now().toString(36).toUpperCase()}${++refCounter}`

beforeAll(async () => {
  await allowOrgCreation(true)
  owner = await createUser('sub-owner')
  org = await createOrg(owner, 'Nanyuki Cabins')
  manager = await addMember(owner, org, 'manager')
  propertyId = (await createProperty(owner.client, org)).property.id
  platformAdmin = await createUser('platform-admin')
  const { error } = await admin.from('platform_admins').insert({ user_id: platformAdmin.id })
  if (error) throw error
})

afterAll(async () => {
  await allowOrgCreation(true)
})

describe('plans', () => {
  it('database prices match the prices the app shows', async () => {
    const { data } = await anonClient().from('subscription_plans').select('code, name, price').order('sort_order')
    expect(data!.map((p) => ({ code: p.code, name: p.name, price: Number(p.price) }))).toEqual(
      PLANS.map((p) => ({ code: p.code, name: p.name, price: p.price })),
    )
  })
})

describe('trial', () => {
  it(`starts a ${TRIAL_DAYS}-day trial when a business is created`, async () => {
    const { data } = await owner.client.rpc('subscription_status', { org })
    const s = data![0]!
    expect(s.state).toBe('trialing')
    expect(s.days_left).toBe(TRIAL_DAYS)
    expect(s.can_manage).toBe(true)
    expect(s.plan).toBeNull()
  })

  it('lets every member see the state, but only the owner manage billing', async () => {
    const { data } = await manager.client.rpc('subscription_status', { org })
    expect(data![0]!.state).toBe('trialing')
    expect(data![0]!.can_manage).toBe(false)
    const outsider = await createUser('sub-outsider')
    const { data: none } = await outsider.client.rpc('subscription_status', { org })
    expect(none).toEqual([])
  })
})

describe('read-only after expiry', () => {
  it('blocks changes to operational records but keeps everything readable', async () => {
    await setDates(org, { trial_ends_at: daysFromNow(-1), current_period_end: null })
    const { data: s } = await owner.client.rpc('subscription_status', { org })
    expect(s![0]!.state).toBe('expired')

    const insert = await owner.client.from('guests').insert({ organization_id: org, full_name: 'Late Guest', phone: '+254700000001' })
    expect(insert.error?.hint).toBe('subscription_inactive')
    expect(insert.error?.message).toMatch(/read-only/)

    const update = await owner.client.from('properties').update({ name: 'Renamed' }).eq('id', propertyId).select()
    expect(update.error?.hint).toBe('subscription_inactive')

    const { data: props } = await owner.client.from('properties').select('id, name').eq('id', propertyId)
    expect(props).toHaveLength(1)
  })

  it('still lets the owner renew while expired', async () => {
    const { error } = await owner.client.rpc('request_subscription_payment', {
      org,
      plan_code: 'monthly',
      pay_method: 'mpesa',
      pay_reference: ref(),
    })
    expect(error).toBeNull()
  })

  it('does not stop the business from being deleted', async () => {
    const tmpOwner = await createUser('sub-delete')
    const tmpOrg = await createOrg(tmpOwner, 'Short Lived Stays')
    await createGuest(tmpOwner.client, tmpOrg)
    await setDates(tmpOrg, { trial_ends_at: daysFromNow(-3) })
    const del = await admin.from('organizations').delete().eq('id', tmpOrg)
    expect(del.error).toBeNull()
  })
})

describe('payment requests', () => {
  it('only the owner can submit, and the amount comes from the plan', async () => {
    const denied = await manager.client.rpc('request_subscription_payment', {
      org,
      plan_code: 'annual',
      pay_method: 'mpesa',
      pay_reference: ref(),
    })
    expect(denied.error?.code).toBe('42501')

    const r = ref()
    const { data: id } = await owner.client.rpc('request_subscription_payment', { org, plan_code: 'annual', pay_method: 'mpesa', pay_reference: r })
    const { data: row } = await owner.client.from('subscription_payment_requests').select('amount, status, plan').eq('id', id!).single()
    expect(Number(row!.amount)).toBe(32900)
    expect(row!.status).toBe('pending')

    // Retrying the same reference returns the same request instead of a duplicate.
    const again = await owner.client.rpc('request_subscription_payment', { org, plan_code: 'annual', pay_method: 'mpesa', pay_reference: r.toLowerCase() })
    expect(again.data).toBe(id)
  })

  it('a reference cannot be claimed by another business', async () => {
    const r = ref()
    await owner.client.rpc('request_subscription_payment', { org, plan_code: 'monthly', pay_method: 'mpesa', pay_reference: r })
    const other = await createUser('sub-other')
    const otherOrg = await createOrg(other, 'Naivasha Lodges')
    const { error } = await other.client.rpc('request_subscription_payment', { org: otherOrg, plan_code: 'monthly', pay_method: 'mpesa', pay_reference: r })
    expect(error?.message).toMatch(/already been submitted/)
  })

  it('owners cannot write requests or subscriptions directly', async () => {
    const direct = await owner.client
      .from('subscription_payment_requests')
      .insert({ organization_id: org, plan: 'annual', amount: 1, method: 'mpesa', reference: ref() })
    expect(direct.error).not.toBeNull()
    await owner.client.from('subscriptions').update({ current_period_end: daysFromNow(999) }).eq('organization_id', org)
    const { data } = await admin.from('subscriptions').select('current_period_end').eq('organization_id', org).single()
    expect(data!.current_period_end).toBeNull()
  })
})

describe('platform review', () => {
  it('is limited to platform administrators', async () => {
    const list = await owner.client.rpc('platform_payment_requests')
    expect(list.error?.code).toBe('42501')
    const { data: isAdmin } = await platformAdmin.client.rpc('is_platform_admin')
    expect(isAdmin).toBe(true)
    const { data: notAdmin } = await owner.client.rpc('is_platform_admin')
    expect(notAdmin).toBe(false)
  })

  it('approving activates the plan from today when expired and reopens writes', async () => {
    await setDates(org, { trial_ends_at: daysFromNow(-1), current_period_end: null })
    const r = ref()
    const { data: id } = await owner.client.rpc('request_subscription_payment', { org, plan_code: 'monthly', pay_method: 'bank', pay_reference: r })
    const { data: reviewed, error } = await platformAdmin.client.rpc('review_subscription_payment', { request_id: id!, approve: true })
    expect(error).toBeNull()
    expect(reviewed!.status).toBe('approved')

    const { data: s } = await owner.client.rpc('subscription_status', { org })
    expect(s![0]!.state).toBe('active')
    expect(s![0]!.plan).toBe('monthly')
    expect(s![0]!.days_left).toBeGreaterThanOrEqual(28)
    expect(s![0]!.days_left).toBeLessThanOrEqual(31)

    const insert = await owner.client.from('guests').insert({ organization_id: org, full_name: 'Back Again', phone: '+254700000002' })
    expect(insert.error).toBeNull()

    const { count } = await owner.client.from('notifications').select('*', { count: 'exact', head: true }).eq('organization_id', org).eq('title', 'Subscription active')
    expect(count).toBe(1)

    const twice = await platformAdmin.client.rpc('review_subscription_payment', { request_id: id!, approve: true })
    expect(twice.error?.message).toMatch(/already been reviewed/)
  })

  it('paying during the trial adds the plan after the trial, without losing days', async () => {
    const o = await createUser('sub-early')
    const earlyOrg = await createOrg(o, 'Kisumu Lakeside')
    const { data: before } = await admin.from('subscriptions').select('trial_ends_at').eq('organization_id', earlyOrg).single()
    const { data: id } = await o.client.rpc('request_subscription_payment', { org: earlyOrg, plan_code: 'annual', pay_method: 'mpesa', pay_reference: ref() })
    await platformAdmin.client.rpc('review_subscription_payment', { request_id: id!, approve: true })
    const { data: after } = await admin.from('subscriptions').select('current_period_end').eq('organization_id', earlyOrg).single()
    const trialEnd = new Date(before!.trial_ends_at)
    const expected = new Date(trialEnd)
    expected.setUTCFullYear(expected.getUTCFullYear() + 1)
    expect(Math.abs(new Date(after!.current_period_end!).getTime() - expected.getTime())).toBeLessThan(86_400_000)
  })

  it('rejecting leaves the subscription unchanged and frees the reference', async () => {
    await setDates(org, { trial_ends_at: daysFromNow(-1), current_period_end: daysFromNow(-1) })
    const r = ref()
    const { data: id } = await owner.client.rpc('request_subscription_payment', { org, plan_code: 'monthly', pay_method: 'mpesa', pay_reference: r })
    const { data: rejected } = await platformAdmin.client.rpc('review_subscription_payment', { request_id: id!, approve: false, note: 'Not received' })
    expect(rejected!.status).toBe('rejected')
    const { data: s } = await owner.client.rpc('subscription_status', { org })
    expect(s![0]!.state).toBe('expired')
    const resubmit = await owner.client.rpc('request_subscription_payment', { org, plan_code: 'monthly', pay_method: 'mpesa', pay_reference: r })
    expect(resubmit.error).toBeNull()
  })
})
