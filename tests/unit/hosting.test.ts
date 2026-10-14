import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, headersFile, securityHeaders, vercelConfig } from '../../deploy/security-headers'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('hosting configuration', () => {
  it('committed host files match deploy/security-headers.ts (run `npm run hosting:config`)', () => {
    expect(JSON.parse(read('vercel.json'))).toEqual(vercelConfig())
    expect(read('public/_headers').replace(/\r\n/g, '\n')).toBe(headersFile())
  })

  it('CSP allows only first-party scripts and the Supabase API', () => {
    const csp = contentSecurityPolicy()
    expect(csp).toContain("script-src 'self';")
    expect(csp).not.toMatch(/script-src[^;]*unsafe/)
    expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
  })

  it('pins a local Supabase origin for previews', () => {
    const csp = contentSecurityPolicy(['http://127.0.0.1:56321', 'ws://127.0.0.1:56321'])
    expect(csp).toContain("connect-src 'self' http://127.0.0.1:56321 ws://127.0.0.1:56321")
    expect(csp).toContain('img-src \'self\' data: blob: http://127.0.0.1:56321')
  })

  it('sends the baseline hardening headers', () => {
    const h = securityHeaders()
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(h['Strict-Transport-Security']).toMatch(/max-age=\d+/)
  })
})
