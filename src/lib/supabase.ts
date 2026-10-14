import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigured = Boolean(url && publishableKey)

/**
 * Browser client. Uses only the publishable key; every query is authorized by Row Level Security.
 * Privileged operations live in database functions or Edge Functions — never put a service-role
 * or secret key in a VITE_* variable.
 */
export const supabase = createClient<Database>(url || 'http://127.0.0.1:54321', publishableKey || 'missing-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Implicit flow lets password-reset links work even when opened in a different browser/app.
    flowType: 'implicit',
    storageKey: 'coaststay-auth',
  },
})

export function appUrl(path = ''): string {
  const base = import.meta.env.VITE_APP_URL || window.location.origin
  return `${base.replace(/\/$/, '')}${path}`
}
