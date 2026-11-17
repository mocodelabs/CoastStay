import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { Database } from '../../src/types/database'
import { env } from '../integration/env'
import { cleanup } from '../integration/global-setup'
import { E2E, FIXTURE_FILE } from './fixtures'

/**
 * Creates a fresh test business with an owner and a caretaker (no properties yet), so the owner
 * journey starts from the real first-run state.
 */
export default async function globalSetup() {
  await cleanup()
  const admin = createClient<Database>(env.url, env.secretKey, { auth: { persistSession: false } })

  for (const u of [E2E.owner, E2E.cleaner, E2E.outsider]) {
    const { error } = await admin.auth.admin.createUser({
      email: u.email,
      password: E2E.password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
    })
    if (error) throw error
  }

  const ownerClient = createClient<Database>(env.url, env.publishableKey, { auth: { persistSession: false } })
  await ownerClient.auth.signInWithPassword({ email: E2E.owner.email, password: E2E.password })
  await admin.from('platform_settings').update({ allow_self_service_orgs: true }).eq('id', true)
  try {
    const org = await ownerClient.rpc('create_organization', { org_name: E2E.business })
    if (org.error) throw org.error
    const invite = await ownerClient.rpc('create_invitation', { org: org.data, invite_email: E2E.cleaner.email, invite_role: 'housekeeping' })
    if (invite.error) throw invite.error
    const cleanerClient = createClient<Database>(env.url, env.publishableKey, { auth: { persistSession: false } })
    await cleanerClient.auth.signInWithPassword({ email: E2E.cleaner.email, password: E2E.password })
    const accepted = await cleanerClient.rpc('accept_invitation', { invite_token: invite.data[0]!.token })
    if (accepted.error) throw accepted.error

    // A second, unrelated business for isolation checks.
    const outsiderClient = createClient<Database>(env.url, env.publishableKey, { auth: { persistSession: false } })
    await outsiderClient.auth.signInWithPassword({ email: E2E.outsider.email, password: E2E.password })
    const other = await outsiderClient.rpc('create_organization', { org_name: 'Other Coast Ltd' })
    if (other.error) throw other.error
    const prop = await outsiderClient
      .from('properties')
      .insert({ organization_id: other.data, name: 'Private Villa', standard_nightly_rate: 5000 })
      .select('id')
      .single()
    if (prop.error) throw prop.error
    mkdirSync('tests/e2e/.auth', { recursive: true })
    writeFileSync(FIXTURE_FILE, JSON.stringify({ orgId: org.data, otherPropertyId: prop.data.id }))
  } finally {
    // Platform default since migration 21: anyone may sign up and start a trial.
    await admin.from('platform_settings').update({ allow_self_service_orgs: true }).eq('id', true)
  }
}
