import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { permissionsFor, type Role } from '@/lib/permissions'
import {
  addMember,
  admin,
  allowOrgCreation,
  anonClient,
  createBooking,
  createGuest,
  createOrg,
  createProperty,
  createUser,
  futureWindow,
  type TestUser,
} from './fixtures'

let ownerA: TestUser
let ownerB: TestUser
let orgA: string
let orgB: string
let propertyA: string
let unitA: string
let guestA: string
let bookingA: string

beforeAll(async () => {
  await allowOrgCreation(true)
  ownerA = await createUser('owner-a')
  ownerB = await createUser('owner-b')
  orgA = await createOrg(ownerA, 'Diani Shores')
  orgB = await createOrg(ownerB, 'Watamu Retreats')
  const p = await createProperty(ownerA.client, orgA)
  propertyA = p.property.id
  unitA = p.unitId
  guestA = (await createGuest(ownerA.client, orgA)).id
  const w = futureWindow()
  const b = await createBooking(ownerA.client, { orgId: orgA, propertyId: propertyA, unitId: unitA, guestId: guestA, ...w })
  if (b.error) throw b.error
  bookingA = b.data.id
})

afterAll(async () => {
  await allowOrgCreation(false)
})

describe('organization bootstrap', () => {
  it('makes the creator the owner and seeds defaults', async () => {
    const { data: members } = await ownerA.client.from('organization_members').select('role, user_id').eq('organization_id', orgA)
    expect(members).toEqual([{ role: 'owner', user_id: ownerA.id }])

    const { count: categories } = await ownerA.client
      .from('expense_categories')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgA)
    expect(categories).toBe(10)

    const { data: tpl } = await ownerA.client.from('checklist_templates').select('items').eq('organization_id', orgA).single()
    expect((tpl!.items as unknown[]).length).toBe(13)

    const { count: templates } = await ownerA.client
      .from('communication_templates')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgA)
    expect(templates).toBe(9)
  })

  it('blocks extra organizations when self-service creation is disabled', async () => {
    await allowOrgCreation(false)
    const stranger = await createUser('stranger')
    const { data: can } = await stranger.client.rpc('can_create_organization')
    expect(can).toBe(false)
    const { error } = await stranger.client.rpc('create_organization', { org_name: 'Sneaky Stays' })
    expect(error?.message).toMatch(/disabled/)
    await allowOrgCreation(true)
  })
})

describe('organization isolation', () => {
  it('hides every record of another organization, even by id', async () => {
    const c = ownerB.client
    const checks = await Promise.all([
      c.from('organizations').select('id').eq('id', orgA),
      c.from('properties').select('id').eq('id', propertyA),
      c.from('property_units').select('id').eq('id', unitA),
      c.from('guests').select('id').eq('id', guestA),
      c.from('bookings').select('id').eq('id', bookingA),
      c.from('booking_payments').select('id').eq('organization_id', orgA),
      c.from('housekeeping_tasks').select('id').eq('organization_id', orgA),
      c.from('expense_categories').select('id').eq('organization_id', orgA),
      c.from('communication_templates').select('id').eq('organization_id', orgA),
      c.from('unit_occupancy').select('id').eq('organization_id', orgA),
      c.from('audit_logs').select('id').eq('organization_id', orgA),
      c.from('organization_members').select('id').eq('organization_id', orgA),
    ])
    for (const r of checks) {
      expect(r.error).toBeNull()
      expect(r.data).toEqual([])
    }
  })

  it('rejects writes into another organization', async () => {
    const c = ownerB.client
    const prop = await c.from('properties').insert({ organization_id: orgA, name: 'Hijack Villa' }).select()
    expect(prop.error?.code).toBe('42501')

    const upd = await c.from('bookings').update({ internal_notes: 'pwned' }).eq('id', bookingA).select()
    expect(upd.data).toEqual([])

    const guest = await c.from('guests').insert({ organization_id: orgA, full_name: 'Intruder' }).select()
    expect(guest.error?.code).toBe('42501')

    // Referencing another org's property from your own org fails the composite foreign key.
    const { property: propB, unitId: unitB } = await createProperty(c, orgB)
    const guestB = await createGuest(c, orgB)
    const cross = await createBooking(c, { orgId: orgB, propertyId: propertyA, unitId: unitA, guestId: guestB.id, ...futureWindow() })
    expect(cross.error).not.toBeNull()
    const ok = await createBooking(c, { orgId: orgB, propertyId: propB.id, unitId: unitB, guestId: guestB.id, ...futureWindow() })
    expect(ok.error).toBeNull()
  })

  it('gives anonymous visitors nothing', async () => {
    const anon = anonClient()
    const r = await anon.from('bookings').select('id')
    expect(r.data ?? []).toEqual([])
    const rpc = await anon.rpc('create_organization', { org_name: 'Anon Inc' })
    expect(rpc.error).not.toBeNull()
  })
})

describe('staff invitations', () => {
  it('only owners can invite', async () => {
    const finance = await addMember(ownerA, orgA, 'finance')
    const { error } = await finance.client.rpc('create_invitation', {
      org: orgA,
      invite_email: 'someone@coaststay.test',
      invite_role: 'owner',
    })
    expect(error?.code).toBe('42501')
  })

  it('requires the invited email address and can only be used once', async () => {
    const invitee = await createUser('invitee')
    const other = await createUser('other')
    const { data } = await ownerA.client.rpc('create_invitation', {
      org: orgA,
      invite_email: invitee.email,
      invite_role: 'housekeeping',
    })
    const token = data![0]!.token

    const preview = await anonClient().rpc('get_invitation', { invite_token: token })
    expect(preview.data?.[0]).toMatchObject({ organization_name: 'Diani Shores', role: 'housekeeping', state: 'open' })

    const wrong = await other.client.rpc('accept_invitation', { invite_token: token })
    expect(wrong.error?.message).toMatch(/different email/)

    const ok = await invitee.client.rpc('accept_invitation', { invite_token: token })
    expect(ok.error).toBeNull()
    expect(ok.data).toBe(orgA)

    const again = await invitee.client.rpc('accept_invitation', { invite_token: token })
    expect(again.error?.message).toMatch(/already been used/)

    const bogus = await invitee.client.rpc('accept_invitation', { invite_token: 'not-a-real-token' })
    expect(bogus.error?.message).toMatch(/not valid/)
  })

  it('never exposes token hashes to non-owners', async () => {
    const manager = await addMember(ownerA, orgA, 'manager')
    const { data } = await manager.client.from('organization_invitations').select('token_hash')
    expect(data).toEqual([])
  })
})

describe('membership safeguards', () => {
  it('keeps at least one active owner', async () => {
    const { data: me } = await ownerA.client
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgA)
      .eq('user_id', ownerA.id)
      .single()
    // Self-change is blocked outright…
    const self = await ownerA.client.from('organization_members').update({ role: 'manager' }).eq('id', me!.id)
    expect(self.error?.message).toMatch(/your own role|at least one active owner/)
    // …and even a privileged path cannot remove the last owner.
    const del = await admin.from('organization_members').delete().eq('id', me!.id)
    expect(del.error?.message).toMatch(/at least one active owner/)

    // With a second owner present, the self-escalation/self-lockout guard still applies.
    const coOwner = await addMember(ownerA, orgA, 'owner', { label: 'co-owner' })
    const coSelf = await coOwner.client
      .from('organization_members')
      .update({ role: 'manager' })
      .eq('organization_id', orgA)
      .eq('user_id', coOwner.id)
    expect(coSelf.error?.message).toMatch(/your own role/)
  })

  it('stops non-owners from changing roles', async () => {
    const manager = await addMember(ownerA, orgA, 'manager')
    const hk = await addMember(ownerA, orgA, 'housekeeping')
    const { data } = await manager.client
      .from('organization_members')
      .update({ role: 'owner' })
      .eq('organization_id', orgA)
      .eq('user_id', hk.id)
      .select()
    expect(data).toEqual([])
  })

  it('suspending a member revokes their data access immediately', async () => {
    const finance = await addMember(ownerA, orgA, 'finance')
    const before = await finance.client.from('bookings').select('id').eq('id', bookingA)
    expect(before.data).toHaveLength(1)
    const { error } = await ownerA.client
      .from('organization_members')
      .update({ status: 'suspended' })
      .eq('organization_id', orgA)
      .eq('user_id', finance.id)
    expect(error).toBeNull()
    const after = await finance.client.from('bookings').select('id').eq('id', bookingA)
    expect(after.data).toEqual([])
  })
})

describe('permission matrix', () => {
  it('database permissions match the UI matrix for every role', async () => {
    const cases: Array<[Role, boolean]> = [
      ['owner', false],
      ['manager', false],
      ['manager', true],
      ['housekeeping', false],
      ['finance', false],
    ]
    for (const [role, finances] of cases) {
      const user = role === 'owner' ? ownerA : await addMember(ownerA, orgA, role, { canViewFinances: finances })
      const { data, error } = await user.client.rpc('my_permissions', { org: orgA })
      expect(error).toBeNull()
      expect(new Set(data)).toEqual(permissionsFor(role, finances))
    }
  })
})
