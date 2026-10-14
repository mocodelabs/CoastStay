import { env } from './env'

// Safety: integration tests create and mutate data. Refuse to run against anything but a local stack.
const host = new URL(env.url).hostname
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  throw new Error(`Integration tests must run against a local Supabase stack, not ${host}.`)
}
