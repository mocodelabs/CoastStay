import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { E2E, signIn } from './fixtures'

async function audit(page: Page, name: string) {
  await page.waitForLoadState('networkidle')
  // Audit the loaded screen, not its skeleton.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map((v) => `${name}: ${v.id} — ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')})`),
  ).toEqual([])
}

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  test('public pages', async ({ page }) => {
    for (const path of ['/login', '/signup', '/forgot-password']) {
      await page.goto(path)
      await audit(page, path)
    }
  })

  test('main owner screens', async ({ page }) => {
    // 17 screens, each loaded and fully audited: budget per screen, not one default timeout for all.
    test.setTimeout(240_000)
    await signIn(page, E2E.owner.email)
    for (const path of [
      '/',
      '/properties',
      '/bookings',
      '/bookings/new',
      '/calendar?view=month',
      '/guests',
      '/finances',
      '/housekeeping',
      '/maintenance',
      '/inventory',
      '/reports',
      '/reports?tab=performance',
      '/messages',
      '/settings/business',
      '/settings/staff',
      '/settings/templates',
      '/settings/notifications',
    ]) {
      await page.goto(path)
      await audit(page, path)
    }
  })

  test('detail pages with real data (after the owner journey)', async ({ page }) => {
    await signIn(page, E2E.owner.email)
    await page.goto('/bookings')
    await page.getByRole('link', { name: 'Amani Mwangi' }).first().click()
    await expect(page.getByText('Payments')).toBeVisible()
    await audit(page, 'booking detail')
    await page.getByRole('link', { name: 'Confirmation' }).click()
    await audit(page, 'booking confirmation')
    await page.goto('/properties')
    await page.getByRole('link', { name: /E2E Villa/ }).first().click()
    await audit(page, 'property detail')
    await page.goto('/housekeeping')
    await page.getByRole('link', { name: /Turnover clean/ }).first().click()
    await audit(page, 'task detail')
    await page.goto('/guests')
    await page.getByRole('link', { name: 'Amani Mwangi' }).first().click()
    await audit(page, 'guest detail')
    // Dialogs
    await page.goto('/finances?tab=expenses')
    await page.getByRole('button', { name: 'Record expense' }).click()
    await audit(page, 'expense dialog')
  })
})
