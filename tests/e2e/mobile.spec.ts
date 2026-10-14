import { expect, test } from '@playwright/test'
import { E2E, expectNoHorizontalScroll, signIn } from './fixtures'

test.describe('mobile layout', () => {
  test('owner pages fit the phone screen and navigation works', async ({ page }) => {
    await signIn(page, E2E.owner.email)
    const bottom = page.getByRole('navigation', { name: 'Quick navigation' })
    await expect(bottom).toBeVisible()
    await expect(bottom.getByRole('link', { name: 'Bookings' })).toBeVisible()

    for (const path of ['/', '/properties', '/bookings', '/calendar', '/finances', '/housekeeping', '/reports', '/settings/profile', '/bookings/new']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expectNoHorizontalScroll(page)
    }

    // The menu sheet reaches every section.
    await page.goto('/')
    await bottom.getByRole('button', { name: 'More' }).click()
    const sheet = page.getByRole('dialog', { name: 'Navigation' })
    await sheet.getByRole('link', { name: 'Inventory' }).click()
    await expect(page).toHaveURL(/\/inventory/)
    await expect(sheet).toBeHidden()
  })

  test('caretaker sees a task-focused bottom bar', async ({ page }) => {
    await signIn(page, E2E.cleaner.email)
    const bottom = page.getByRole('navigation', { name: 'Quick navigation' })
    await expect(bottom.getByRole('link', { name: 'Housekeeping' })).toBeVisible()
    await expect(bottom.getByRole('link', { name: 'Bookings' })).toHaveCount(0)
    await expectNoHorizontalScroll(page)
  })
})
