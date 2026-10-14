import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone, whatsappLink } from '@/lib/phone'

describe('normalizePhone', () => {
  it.each([
    ['0712345678', '+254712345678'],
    ['0712 345 678', '+254712345678'],
    ['0712-345-678', '+254712345678'],
    ['712345678', '+254712345678'],
    ['254712345678', '+254712345678'],
    ['+254712345678', '+254712345678'],
    ['+254 712 345 678', '+254712345678'],
    ['00254712345678', '+254712345678'],
    ['+2540712345678', '+254712345678'],
    ['0110123456', '+254110123456'],
    ['0101234567', '+254101234567'],
  ])('converts %s to %s', (input, expected) => {
    const r = normalizePhone(input)
    expect(r).toEqual({ ok: true, e164: expected, isKenyanMobile: true })
  })

  it('accepts international guests with a country code', () => {
    expect(normalizePhone('+44 7700 900123')).toEqual({ ok: true, e164: '+447700900123', isKenyanMobile: false })
    expect(normalizePhone('0049 30 1234567')).toEqual({ ok: true, e164: '+49301234567', isKenyanMobile: false })
  })

  it.each(['', '   ', '0201234567', '071234567', '07123456789', '+254812345678', 'abc', '07a2345678', '12+345'])(
    'rejects %s',
    (input) => {
      expect(normalizePhone(input).ok).toBe(false)
    },
  )
})

describe('phone display and WhatsApp', () => {
  it('formats Kenyan numbers for display', () => {
    expect(formatPhone('+254712345678')).toBe('+254 712 345 678')
    expect(formatPhone('+447700900123')).toBe('+447700900123')
    expect(formatPhone(null)).toBe('—')
  })

  it('builds an encoded wa.me link', () => {
    expect(whatsappLink('+254712345678', 'Habari! Check-in 14:00 & Wi-Fi: "Coast"')).toBe(
      'https://wa.me/254712345678?text=Habari!%20Check-in%2014%3A00%20%26%20Wi-Fi%3A%20%22Coast%22',
    )
    expect(whatsappLink('+254712345678')).toBe('https://wa.me/254712345678')
  })
})
