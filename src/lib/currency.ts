/**
 * Money helpers. Amounts travel between the database (numeric(12,2)) and the UI as decimal
 * strings or JSON numbers; all arithmetic is done in integer cents to avoid floating-point error.
 */

export type Cents = number

const DECIMAL_RE = /^([+-])?(\d+)(?:\.(\d+))?$/

/** Parses a decimal amount ("1,250.5", 1250.5, "-3") into integer cents, rounding half away from zero. */
export function toCents(value: string | number | null | undefined): Cents {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid amount')
    // Numbers from JSON are short decimals (e.g. 1250.5); toFixed(3) keeps them exact before rounding.
    value = value.toFixed(3)
  }
  const cleaned = value.replace(/[\s,]/g, '').replace(/^KES/i, '')
  const match = DECIMAL_RE.exec(cleaned)
  if (!match) throw new Error(`Invalid amount: ${value}`)
  const [, sign, whole = '0', fraction = ''] = match
  const frac3 = (fraction + '000').slice(0, 3)
  let cents = Number(whole) * 100 + Number(frac3.slice(0, 2))
  if (Number(frac3[2]) >= 5) cents += 1
  if (!Number.isSafeInteger(cents)) throw new Error('Amount too large')
  return sign === '-' ? -cents : cents
}

/** Formats cents as a plain decimal string suitable for the database ("1250.50"). */
export function centsToDecimal(cents: Cents): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${sign}${whole}.${frac}`
}

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: string, decimals: boolean): Intl.NumberFormat {
  const key = `${currency}:${decimals}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    })
    formatters.set(key, f)
  }
  return f
}

/** "KES 12,500.00" — accepts cents. Use `compact` to drop decimals for whole amounts (KPIs). */
export function formatCents(cents: Cents, currency = 'KES', opts: { compact?: boolean } = {}): string {
  const whole = cents % 100 === 0
  const out = formatter(currency, !(opts.compact && whole)).format(cents / 100)
  // Normalize the non-breaking space Intl inserts after the currency code.
  return out.replace(/ /g, ' ')
}

/** Formats a decimal value straight from the database. */
export function formatMoney(value: string | number | null | undefined, currency = 'KES', opts: { compact?: boolean } = {}): string {
  return formatCents(toCents(value), currency, opts)
}

export function sumCents(values: Array<string | number | null | undefined>): Cents {
  return values.reduce<Cents>((acc, v) => acc + toCents(v), 0)
}

/** Percentage of a cents amount, rounded to the nearest cent (e.g. a 30% deposit). */
export function percentOf(cents: Cents, percent: number): Cents {
  return Math.round((cents * Math.round(percent * 100)) / 10000)
}
