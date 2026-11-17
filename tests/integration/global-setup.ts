import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database'
import { env } from './env'

/**
 * Removes every organization and user created by integration tests (emails on @coaststay.test),
 * so the local development database keeps working for manual testing (e.g. first-run bootstrap).
 */
const BUCKETS = ['property-photos', 'receipts', 'task-photos', 'maintenance-attachments', 'branding']

async function listRecursive(admin: ReturnType<typeof createClient<Database>>, bucket: string, prefix: string): Promise<string[]> {
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
  const out: string[] = []
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`
    // Folders have no id in storage list results.
    if (entry.id) out.push(path)
    else out.push(...(await listRecursive(admin, bucket, path)))
  }
  return out
}

export async function cleanup() {
  if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(env.url).hostname)) {
    throw new Error('Integration tests only run against a local Supabase stack.')
  }
  const admin = createClient<Database>(env.url, env.secretKey, { auth: { persistSession: false } })
  const { data: profiles, error } = await admin.from('profiles').select('id').ilike('email', '%@coaststay.test')
  if (error) throw error
  const userIds = profiles.map((p) => p.id)
  if (userIds.length === 0) return

  const { data: memberships } = await admin.from('organization_members').select('organization_id').in('user_id', userIds)
  const orgIds = [...new Set((memberships ?? []).map((m) => m.organization_id))]
  for (const id of orgIds) {
    for (const bucket of BUCKETS) {
      const paths = await listRecursive(admin, bucket, id)
      if (paths.length) await admin.storage.from(bucket).remove(paths)
    }
    const del = await admin.from('organizations').delete().eq('id', id)
    if (del.error) throw new Error(`cleanup: deleting organization ${id} failed: ${del.error.message}`)
    await admin.from('audit_logs').delete().eq('organization_id', id)
  }
  for (const id of userIds) {
    const del = await admin.auth.admin.deleteUser(id)
    if (del.error) throw new Error(`cleanup: deleting user ${id} failed: ${del.error.message}`)
  }
  // Restore the platform default (self-service sign-up with a trial, migration 21).
  await admin.from('platform_settings').update({ allow_self_service_orgs: true }).eq('id', true)
}

export async function setup() {
  await cleanup()
}

export async function teardown() {
  if (process.env.KEEP_TEST_DATA) return
  await cleanup()
}
