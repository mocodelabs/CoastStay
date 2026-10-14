/** Message template rendering with `{{placeholder}}` tokens. */

export const TEMPLATE_PLACEHOLDERS = [
  'guest_name',
  'property_name',
  'property_address',
  'check_in_date',
  'check_out_date',
  'check_in_time',
  'check_out_time',
  'booking_reference',
  'total_amount',
  'balance_due',
  'last_payment_amount',
  'check_in_instructions',
  'check_out_instructions',
  'directions',
  'wifi_name',
  'wifi_password',
  'business_name',
  'business_phone',
] as const

export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number]
export type TemplateVars = Partial<Record<TemplatePlaceholder, string | null | undefined>>

const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/g

export interface RenderResult {
  text: string
  /** Known placeholders with no value — left visible so staff can fill them in. */
  missing: string[]
  /** Tokens that are not recognised placeholders. */
  unknown: string[]
}

export function renderTemplate(body: string, vars: TemplateVars): RenderResult {
  const missing = new Set<string>()
  const unknown = new Set<string>()
  const known = new Set<string>(TEMPLATE_PLACEHOLDERS)
  const text = body.replace(TOKEN_RE, (token, key: string) => {
    if (!known.has(key)) {
      unknown.add(key)
      return token
    }
    const value = vars[key as TemplatePlaceholder]
    if (value === null || value === undefined || String(value).trim() === '') {
      missing.add(key)
      return token
    }
    return String(value)
  })
  // Drop lines that consisted only of an empty optional block (e.g. blank instructions).
  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), missing: [...missing], unknown: [...unknown] }
}
