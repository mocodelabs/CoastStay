/**
 * Phone normalization for Kenya-first businesses. Local mobile formats become E.164 (+254…);
 * other international numbers are accepted when written with a leading + or 00.
 */

export type PhoneResult =
  | { ok: true; e164: string; isKenyanMobile: boolean }
  | { ok: false; reason: string }

const KE_MOBILE = /^[17]\d{8}$/ // 7XXXXXXXX (Safaricom/Airtel/Telkom) and 1XXXXXXXX (011x/010x)

export function normalizePhone(input: string | null | undefined): PhoneResult {
  if (!input || !input.trim()) return { ok: false, reason: 'Enter a phone number.' }
  let s = input.trim().replace(/[\s\-().]/g, '')
  if (s.startsWith('00')) s = '+' + s.slice(2)
  if (/[^+\d]/.test(s) || s.lastIndexOf('+') > 0) {
    return { ok: false, reason: 'Phone numbers can only contain digits and a leading +.' }
  }

  let national: string | null = null
  if (s.startsWith('+254')) national = s.slice(4)
  else if (s.startsWith('254') && s.length === 12) national = s.slice(3)
  else if (s.startsWith('0') && s.length === 10) national = s.slice(1)
  else if (!s.startsWith('+') && s.length === 9) national = s

  if (national !== null) {
    if (national.startsWith('0')) national = national.slice(1) // +2540712… typo
    if (KE_MOBILE.test(national)) return { ok: true, e164: `+254${national}`, isKenyanMobile: true }
    return { ok: false, reason: 'This is not a valid Kenyan mobile number (e.g. 0712 345 678).' }
  }

  if (s.startsWith('+')) {
    const digits = s.slice(1)
    if (/^[1-9]\d{6,14}$/.test(digits)) return { ok: true, e164: s, isKenyanMobile: false }
    return { ok: false, reason: 'International numbers need a country code and 7–15 digits.' }
  }
  return { ok: false, reason: 'Use a Kenyan number (0712 345 678) or an international number starting with +.' }
}

/** Display form: +254 712 345 678 for Kenyan mobiles, otherwise the E.164 string. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '—'
  const m = /^\+254(\d{3})(\d{3})(\d{3})$/.exec(e164)
  return m ? `+254 ${m[1]} ${m[2]} ${m[3]}` : e164
}

/** WhatsApp click-to-chat link with a correctly encoded prefilled message. */
export function whatsappLink(e164: string, message?: string): string {
  const digits = e164.replace(/\D/g, '')
  const text = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${digits}${text}`
}
