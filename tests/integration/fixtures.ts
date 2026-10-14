import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { env } from './env'

export type Client = SupabaseClient<Database>
export type Role = Database['public']['Enums']['member_role']

const PASSWORD = 'Coast-test-2026'
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let counter = 0

/** Service-role client: fixtures only. Never used by the application. */
export const admin: Client = createClient<Database>(env.url, env.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export function anonClient(): Client {
  return createClient<Database>(env.url, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export interface TestUser {
  id: string
  email: string
  client: Client
}

export async function createUser(label: string, fullName = label): Promise<TestUser> {
  const email = `${label}-${runId}-${++counter}@coaststay.test`.toLowerCase()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error) throw error
  const client = anonClient()
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw signInError
  return { id: data.user.id, email, client }
}

export async function allowOrgCreation(allow: boolean) {
  const { error } = await admin.from('platform_settings').update({ allow_self_service_orgs: allow }).eq('id', true)
  if (error) throw error
}

export async function createOrg(owner: TestUser, name = `Test Stays ${runId}`): Promise<string> {
  const { data, error } = await owner.client.rpc('create_organization', { org_name: name })
  if (error) throw error
  return data
}

/** Invites a user through the real invitation flow and accepts it as that user. */
export async function addMember(
  owner: TestUser,
  orgId: string,
  role: Role,
  opts: { canViewFinances?: boolean; propertyIds?: string[]; label?: string } = {},
): Promise<TestUser> {
  const user = await createUser(opts.label ?? role)
  const { data, error } = await owner.client.rpc('create_invitation', {
    org: orgId,
    invite_email: user.email,
    invite_role: role,
    invite_can_view_finances: opts.canViewFinances ?? false,
    invite_property_ids: opts.propertyIds ?? [],
  })
  if (error) throw error
  const token = data[0]!.token
  const { error: acceptError } = await user.client.rpc('accept_invitation', { invite_token: token })
  if (acceptError) throw acceptError
  return user
}

export async function createProperty(
  client: Client,
  orgId: string,
  overrides: Partial<Database['public']['Tables']['properties']['Insert']> = {},
) {
  const { data, error } = await client
    .from('properties')
    .insert({
      organization_id: orgId,
      name: `Villa ${runId}-${++counter}`,
      slug: '',
      max_guests: 4,
      standard_nightly_rate: 10000,
      cleaning_fee: 2500,
      ...overrides,
    })
    .select()
    .single()
  if (error) throw error
  // The default unit is created by an AFTER trigger, so it is not visible in the insert's own
  // RETURNING snapshot — read it in a second query.
  const { data: unit, error: unitError } = await client
    .from('property_units')
    .select('id')
    .eq('property_id', data.id)
    .eq('is_default', true)
    .single()
  if (unitError) throw unitError
  return { property: data, unitId: unit.id }
}

export async function createGuest(client: Client, orgId: string, name = 'Amina Hassan') {
  const { data, error } = await client
    .from('guests')
    .insert({ organization_id: orgId, full_name: name, phone: '+254712345678' })
    .select()
    .single()
  if (error) throw error
  return data
}

let dayOffset = 400

/** A fresh, non-overlapping date window far in the future for each booking test. */
export function futureWindow(nights = 3): { checkIn: string; checkOut: string } {
  const start = new Date(Date.UTC(2027, 0, 1) + dayOffset * 86_400_000)
  dayOffset += nights + 10
  const end = new Date(start.getTime() + nights * 86_400_000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { checkIn: iso(start), checkOut: iso(end) }
}

export async function createBooking(
  client: Client,
  args: {
    orgId: string
    propertyId: string
    unitId: string
    guestId: string
    checkIn: string
    checkOut: string
    status?: Database['public']['Enums']['booking_status']
    nightlyRate?: number
    adults?: number
  },
) {
  return client
    .from('bookings')
    .insert({
      organization_id: args.orgId,
      property_id: args.propertyId,
      unit_id: args.unitId,
      guest_id: args.guestId,
      check_in_date: args.checkIn,
      check_out_date: args.checkOut,
      nightly_rate: args.nightlyRate ?? 10000,
      cleaning_fee: 2500,
      adults: args.adults ?? 2,
      status: args.status ?? 'confirmed',
      booking_reference: '',
    })
    .select()
    .single()
}

export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date())
}
