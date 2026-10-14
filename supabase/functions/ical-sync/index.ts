// CoastStay — iCal availability sync (Supabase Edge Function, Deno).
//
// POST /functions/v1/ical-sync
//   x-sync-secret: <ICAL_SYNC_SECRET>          → syncs every active feed (pg_cron scheduler)
//   Authorization: Bearer <user access token>  → syncs { feed_id } if that user may manage it (owner)
//
// The gateway's JWT check is off for this function (supabase/config.toml) so the scheduler does not
// need a privileged key: it presents a dedicated, rotatable secret instead, and user tokens are
// verified here with Supabase Auth.
//
// Fetching happens only here, on the server, so private feed URLs never reach browsers.
// Reconciliation is done transactionally by public.sync_calendar_feed().

import { createClient } from 'npm:@supabase/supabase-js@2'
import { parseICal, safeError } from '../_shared/ical.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
// Shared with the scheduler (Vault secret `ical_sync_secret`). Unset or short → scheduler disabled.
const SYNC_SECRET = Deno.env.get('ICAL_SYNC_SECRET') ?? ''
// Local development only: allow http:// feeds (e.g. a test file served from the host).
const ALLOW_HTTP = Deno.env.get('ICAL_ALLOW_HTTP') === 'true'
const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 15_000

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } })

async function fetchFeed(url: string): Promise<string> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && !(ALLOW_HTTP && parsed.protocol === 'http:')) throw new Error('Feed URL must use https')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { accept: 'text/calendar, text/plain;q=0.9' } })
    if (!res.ok) throw new Error(`Feed returned HTTP ${res.status}`)
    const reader = res.body?.getReader()
    if (!reader) throw new Error('Empty response')
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new Error('Feed is larger than 2 MB')
      chunks.push(value)
    }
    const all = new Uint8Array(size)
    let offset = 0
    for (const c of chunks) {
      all.set(c, offset)
      offset += c.byteLength
    }
    return new TextDecoder().decode(all)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Feed timed out')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info' },
    })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const body = (await req.json().catch(() => ({}))) as { feed_id?: string }
  const presentedSecret = req.headers.get('x-sync-secret')

  let feeds: Array<{ id: string; url: string }>
  if (presentedSecret !== null) {
    if (SYNC_SECRET.length < 32 || !timingSafeEqual(presentedSecret, SYNC_SECRET)) return json({ error: 'Unauthorized' }, 401)
    const q = service.from('calendar_feeds').select('id, url').eq('is_active', true)
    const { data, error } = body.feed_id ? await q.eq('id', body.feed_id) : await q
    if (error) return json({ error: 'Could not load feeds' }, 500)
    feeds = data
  } else {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth } = token ? await service.auth.getUser(token) : { data: { user: null } }
    if (!auth.user) return json({ error: 'Unauthorized' }, 401)
    if (!body.feed_id) return json({ error: 'feed_id is required' }, 400)
    // RLS: only owners (integrations.manage) can read a feed row.
    const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
    const { data, error } = await user.from('calendar_feeds').select('id, url').eq('id', body.feed_id).maybeSingle()
    if (error || !data) return json({ error: 'Feed not found or not permitted' }, 403)
    feeds = [data]
  }

  const results = []
  for (const feed of feeds) {
    let events: ReturnType<typeof parseICal> = []
    let fetchError: string | null = null
    try {
      events = parseICal(await fetchFeed(feed.url))
    } catch (e) {
      fetchError = safeError(e, feed.url)
    }
    const { data, error } = await service.rpc('sync_calendar_feed', { feed_id: feed.id, events, fetch_error: fetchError })
    results.push({ feed_id: feed.id, ...(error ? { status: 'error', error: 'Sync failed' } : data) })
  }
  return json({ synced: results.length, results })
})
