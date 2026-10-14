// Local demo data for exploring CoastStay. LOCAL STACK ONLY — refuses any other URL.
//
//   npm run seed:dev            (after `npm run db:reset` on an empty database)
//
// Creates a demo business, an owner, a manager and a caretaker (password below), two properties,
// guests, bookings in several states with payments, an expense, a maintenance request and stock.
// Everything goes through the normal API as the demo users, so all database rules apply.

import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

// Keys come from the running local stack (`npx supabase status`) so none are committed.
function localStatus() {
  try {
    const out = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return JSON.parse(out.slice(out.indexOf('{')))
  } catch {
    console.error('Local Supabase is not running — start it with `npx supabase start`.')
    process.exit(1)
  }
}
const status = process.env.SEED_SUPABASE_SECRET_KEY && process.env.SEED_SUPABASE_PUBLISHABLE_KEY ? {} : localStatus()

const URL_ = process.env.SEED_SUPABASE_URL ?? status.API_URL ?? 'http://127.0.0.1:56321'
const PUBLISHABLE = process.env.SEED_SUPABASE_PUBLISHABLE_KEY ?? status.PUBLISHABLE_KEY
const SECRET = process.env.SEED_SUPABASE_SECRET_KEY ?? status.SECRET_KEY
const PASSWORD = 'Coast-dev-2026'

if (!['127.0.0.1', 'localhost'].includes(new URL(URL_).hostname)) {
  console.error('seed-dev only runs against a local Supabase stack.')
  process.exit(1)
}

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } })
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data
}
const day = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date(Date.now() + n * 86_400_000))

async function user(email, name) {
  const existing = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existing.data) throw new Error(`${email} already exists — reset the database first (npm run db:reset).`)
  must(await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } }), `create ${email}`)
  const c = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } })
  must(await c.auth.signInWithPassword({ email, password: PASSWORD }), `sign in ${email}`)
  return c
}

const owner = await user('owner@coaststay-dev.test', 'Zawadi Mwangi')
const orgId = must(await owner.rpc('create_organization', { org_name: 'Pwani Holiday Homes', org_contact_phone: '+254712345678', org_contact_email: 'owner@coaststay-dev.test' }), 'org')

async function invite(email, name, role, extra = {}) {
  const c = await user(email, name)
  const inv = must(await owner.rpc('create_invitation', { org: orgId, invite_email: email, invite_role: role, ...extra }), `invite ${email}`)
  must(await c.rpc('accept_invitation', { invite_token: inv[0].token }), `accept ${email}`)
  const { data } = await admin.from('profiles').select('id').eq('email', email).single()
  return data.id
}

const villa = must(
  await owner.from('properties').insert({
    organization_id: orgId, name: 'Diani Palm Villa', property_type: 'villa', location_name: 'Diani Beach', county: 'Kwale',
    bedrooms: 3, bathrooms: 2.5, max_guests: 6, standard_nightly_rate: 15000, cleaning_fee: 3500,
    amenities: ['Wi-Fi', 'Swimming pool', 'Beach access', 'Air conditioning'],
    check_in_instructions: 'Collect keys from the caretaker at the gate.', wifi_name: 'PalmVilla-Guest', wifi_password: 'karibu2026',
  }).select().single(),
  'villa',
)
const apartments = must(
  await owner.from('properties').insert({
    organization_id: orgId, name: 'Nyali Ocean Apartments', property_type: 'apartment', location_name: 'Nyali', county: 'Mombasa',
    bedrooms: 1, bathrooms: 1, max_guests: 2, standard_nightly_rate: 6500, cleaning_fee: 1500, amenities: ['Wi-Fi', 'Ocean view'],
  }).select().single(),
  'apartments',
)
const villaUnit = must(await owner.from('property_units').select('id').eq('property_id', villa.id).single(), 'villa unit').id
// Two separate apartments instead of one whole-property unit.
must(await owner.from('property_units').update({ name: 'Apartment A1' }).eq('property_id', apartments.id).eq('is_default', true), 'A1')
const a2 = must(await owner.from('property_units').insert({ organization_id: orgId, property_id: apartments.id, name: 'Apartment A2', nightly_rate_override: 7000 }).select().single(), 'A2')
const a1 = must(await owner.from('property_units').select('id').eq('property_id', apartments.id).eq('is_default', true).single(), 'a1')

const cleanerId = await invite('cleaner@coaststay-dev.test', 'Baraka Otieno', 'housekeeping', { invite_property_ids: [villa.id, apartments.id] })
await invite('manager@coaststay-dev.test', 'Fatma Ali', 'manager', { invite_property_ids: [apartments.id] })
must(await owner.from('properties').update({ caretaker_id: cleanerId }).eq('id', villa.id), 'caretaker')

const guests = must(
  await owner.from('guests').insert([
    { organization_id: orgId, full_name: 'Amina Hassan', phone: '+254712000111', country: 'Kenya' },
    { organization_id: orgId, full_name: 'Thomas Becker', phone: '+491701234567', email: 'thomas@example.com', country: 'Germany' },
    { organization_id: orgId, full_name: 'Wanjiru Kariuki', phone: '+254722333444', country: 'Kenya', preferences: 'Ground floor, extra towels' },
  ]).select(),
  'guests',
)

async function booking(guest, propertyId, unitId, ci, co, rate, extra = {}) {
  const id = must(
    await owner.rpc('create_booking', {
      payload: {
        organization_id: orgId, client_request_id: crypto.randomUUID(), guest_id: guest.id, property_id: propertyId, unit_id: unitId,
        check_in_date: ci, check_out_date: co, adults: 2, nightly_rate: String(rate), cleaning_fee: '2000', status: 'confirmed', ...extra,
      },
    }),
    'booking',
  )
  return id
}
const pay = async (bookingId, amount, type, method = 'mpesa', ref = null) =>
  must(await owner.from('booking_payments').insert({ organization_id: orgId, booking_id: bookingId, amount, payment_type: type, payment_method: method, payment_date: day(0), transaction_reference: ref }), 'payment')

// Arriving today (deposit paid), in house, upcoming direct + Airbnb, and an inquiry.
const b1 = await booking(guests[0], villa.id, villaUnit, day(0), day(4), 15000)
await pay(b1, 20000, 'deposit', 'mpesa', 'SJK4H7XQ2P')
const b2 = await booking(guests[1], apartments.id, a1.id, day(-2), day(3), 6500, { booking_source: 'airbnb', external_reference: 'HMABC123XY' })
await pay(b2, 34500, 'payment', 'platform_payout')
must(await owner.from('bookings').update({ status: 'checked_in' }).eq('id', b2), 'check in b2')
const b3 = await booking(guests[2], apartments.id, a2.id, day(5), day(8), 7000, { booking_source: 'whatsapp' })
await pay(b3, 5000, 'deposit', 'cash')
await booking(guests[0], villa.id, villaUnit, day(12), day(15), 15000, { status: 'inquiry' })

must(await owner.from('expenses').insert([
  { organization_id: orgId, property_id: villa.id, category: 'utilities', description: 'KPLC tokens', amount: 4500, expense_date: day(0), payment_method: 'mpesa' },
  { organization_id: orgId, property_id: apartments.id, category: 'cleaning', description: 'Laundry service', amount: 2800, expense_date: day(0), payment_method: 'cash' },
  { organization_id: orgId, category: 'platform_fees', description: 'Airbnb host fee', amount: 1035, expense_date: day(0), payment_method: 'platform_payout' },
]), 'expenses')

must(await owner.from('maintenance_requests').insert({
  organization_id: orgId, property_id: villa.id, title: 'Pool pump making noise', category: 'pool', priority: 'high', target_date: day(2), assigned_to: cleanerId,
}), 'maintenance')

const soap = must(await owner.from('inventory_items').insert({ organization_id: orgId, property_id: villa.id, name: 'Bath soap', category: 'toiletries', unit_of_measure: 'bars', minimum_quantity: 10, unit_cost: 60 }).select().single(), 'item')
must(await owner.from('inventory_movements').insert({ organization_id: orgId, inventory_item_id: soap.id, movement_type: 'receipt', quantity: 12, reference: 'Naivas receipt' }), 'receipt')
must(await owner.from('inventory_movements').insert({ organization_id: orgId, inventory_item_id: soap.id, movement_type: 'consumption', quantity: -4 }), 'consume')

await owner.rpc('run_reminders', { target_org: orgId })

console.log(`Seeded "Pwani Holiday Homes". Sign in at http://localhost:5203 with:
  owner@coaststay-dev.test    (owner)
  manager@coaststay-dev.test  (property manager, Nyali only)
  cleaner@coaststay-dev.test  (caretaker)
  password: ${PASSWORD}`)
