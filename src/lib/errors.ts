/**
 * Converts Supabase/PostgREST/Auth errors into safe, human-readable messages. Messages raised by
 * CoastStay's own database rules are written for end users and are shown as-is; anything else
 * (constraint names, SQL details) is replaced by a generic message.
 */

interface ErrorLike {
  code?: string
  message?: string
  hint?: string | null
  details?: string | null
  status?: number
  name?: string
}

// SQLSTATEs our triggers/RPCs raise with user-facing text.
const APP_CODES = new Set(['P0001', 'P0002', '23514', '23P01', '22023', '42501', '23505', '23503'])

const RAW_DB_PATTERNS = [
  /violates row-level security/i,
  /duplicate key value/i,
  /violates (check|foreign key|not-null|exclusion) constraint/i,
  /permission denied for/i,
  /relation .* does not exist/i,
  /invalid input syntax/i,
  /column .* does not exist/i,
]

export const GENERIC_ERROR = 'Something went wrong. Please try again.'

export function toUserMessage(error: unknown): string {
  if (!error) return GENERIC_ERROR
  if (typeof error === 'string') return error
  const e = error as ErrorLike
  const message = e.message ?? ''

  if (e.name === 'TypeError' && /fetch/i.test(message)) {
    return 'Network problem — check your internet connection and try again.'
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return 'Network problem — check your internet connection and try again.'
  }

  // Supabase Auth errors
  if (e.name === 'AuthApiError' || e.name === 'AuthWeakPasswordError' || e.name?.startsWith('Auth')) {
    if (/invalid login credentials/i.test(message)) return 'Incorrect email or password.'
    if (/email not confirmed/i.test(message)) return 'Please confirm your email address first — check your inbox.'
    if (/already registered/i.test(message)) return 'An account with this email already exists. Sign in instead.'
    if (/rate limit/i.test(message)) return 'Too many attempts. Please wait a few minutes and try again.'
    if (/password/i.test(message)) return message
    return message || GENERIC_ERROR
  }

  if (e.code === '23P01') return 'These dates overlap an existing reservation or block for this unit.'
  if (e.code && APP_CODES.has(e.code) && message && !RAW_DB_PATTERNS.some((re) => re.test(message))) {
    return message
  }
  if (/violates row-level security|permission denied/i.test(message) || e.code === '42501') {
    return 'You do not have permission to do that.'
  }
  if (e.code === '23505' || /duplicate key/i.test(message)) return 'A record with these details already exists.'
  if (e.code === '23503') return 'This record is linked to other records and cannot be changed that way.'
  if (e.code === 'PGRST116') return 'Record not found, or you do not have access to it.'
  return GENERIC_ERROR
}

/** Error hint set by our database rules (e.g. 'unit_unavailable', 'capacity_exceeded'). */
export function errorHint(error: unknown): string | undefined {
  const e = error as ErrorLike | undefined
  return e?.hint ?? undefined
}
