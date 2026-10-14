import { describe, expect, it } from 'vitest'
import { renderTemplate } from '@/lib/templates'

describe('renderTemplate', () => {
  it('fills known placeholders', () => {
    const r = renderTemplate('Hello {{guest_name}}, ref {{ booking_reference }} at {{property_name}}.', {
      guest_name: 'Amina',
      booking_reference: 'CS-2610-K7XQP',
      property_name: 'Diani Villa',
    })
    expect(r).toEqual({ text: 'Hello Amina, ref CS-2610-K7XQP at Diani Villa.', missing: [], unknown: [] })
  })

  it('leaves missing values visible and reports them', () => {
    const r = renderTemplate('Balance: {{balance_due}}', { balance_due: '' })
    expect(r.text).toBe('Balance: {{balance_due}}')
    expect(r.missing).toEqual(['balance_due'])
  })

  it('reports unknown placeholders without replacing them', () => {
    const r = renderTemplate('Hi {{nickname}}', {})
    expect(r.unknown).toEqual(['nickname'])
    expect(r.text).toBe('Hi {{nickname}}')
  })

  it('does not treat values as further templates', () => {
    const r = renderTemplate('{{guest_name}}', { guest_name: '{{wifi_password}}' })
    expect(r.text).toBe('{{wifi_password}}')
  })

  it('collapses runs of blank lines', () => {
    expect(renderTemplate('A\n\n\n\nB', {}).text).toBe('A\n\nB')
  })
})
