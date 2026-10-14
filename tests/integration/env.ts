import { execSync } from 'node:child_process'

/**
 * Local Supabase connection for integration and e2e tests. Keys are read from the running local
 * stack (`npx supabase status`) so none are committed; override with TEST_SUPABASE_* variables.
 * Local keys only work against a local stack and grant nothing on hosted projects.
 */
function localStatus(): Record<string, string> {
  try {
    const out = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>
  } catch {
    throw new Error('Local Supabase is not running — start it with `npx supabase start`.')
  }
}

const needsStatus = !process.env.TEST_SUPABASE_PUBLISHABLE_KEY || !process.env.TEST_SUPABASE_SECRET_KEY
const status = needsStatus ? localStatus() : {}

export const env = {
  url: process.env.TEST_SUPABASE_URL ?? status.API_URL ?? 'http://127.0.0.1:56321',
  publishableKey: process.env.TEST_SUPABASE_PUBLISHABLE_KEY ?? status.PUBLISHABLE_KEY!,
  secretKey: process.env.TEST_SUPABASE_SECRET_KEY ?? status.SECRET_KEY!,
}
