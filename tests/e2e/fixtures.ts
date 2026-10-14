import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

export const E2E = {
  password: 'Coast-e2e-2026',
  business: 'E2E Coastal Stays',
  owner: { email: 'e2e-owner@coaststay.test', name: 'Wanjiku Kamau' },
  cleaner: { email: 'e2e-cleaner@coaststay.test', name: 'Juma Said' },
  outsider: { email: 'e2e-outsider@coaststay.test', name: 'Other Owner' },
} as const

export const FIXTURE_FILE = 'tests/e2e/.auth/fixture.json'

export function fixture(): { orgId: string; otherPropertyId: string } {
  return JSON.parse(readFileSync(FIXTURE_FILE, 'utf8'))
}

export async function signIn(page: Page, email: string, password: string = E2E.password) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

/** Fails if the page scrolls horizontally (mobile layout check). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}
