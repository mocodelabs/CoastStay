import { expect, test } from '@playwright/test'
import { E2E, fixture, signIn } from './fixtures'

test.describe('validation failures', () => {
  test('wrong password shows a friendly error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(E2E.owner.email)
    await page.getByLabel('Password').fill('not-the-password-1')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.')
    await expect(page).toHaveURL(/\/login/)
  })

  test('property form explains missing and invalid values', async ({ page }) => {
    await signIn(page, E2E.owner.email)
    await page.goto('/properties/new')
    await page.getByLabel('Latitude').fill('123')
    await page.getByRole('button', { name: 'Create property' }).click()
    await expect(page.getByText('Enter the property name.')).toBeVisible()
    await expect(page.getByText('Enter nightly rate.')).toBeVisible()
    await expect(page.getByText(/between -90 and 90/)).toBeVisible()
    await expect(page).toHaveURL(/\/properties\/new/)
  })

  test('booking form rejects bad dates and invalid M-Pesa codes', async ({ page }) => {
    await signIn(page, E2E.owner.email)
    await page.goto('/bookings/new')
    await page.getByRole('button', { name: /New guest/ }).click()
    await page.getByLabel('Full name').fill('Validation Guest')
    await page.getByRole('textbox', { name: 'Check-in', exact: true }).fill('2031-05-10')
    await page.getByRole('textbox', { name: 'Check-out', exact: true }).fill('2031-05-08')
    await page.getByRole('checkbox', { name: 'Record a deposit now' }).click()
    await page.getByLabel('Amount received').fill('1000')
    await page.getByLabel('Transaction reference').fill('abc')
    await page.getByRole('button', { name: 'Create booking' }).click()
    await expect(page.getByText('Check-out must be after check-in.')).toBeVisible()
    await expect(page.getByText(/M-Pesa codes are 8–12 letters/)).toBeVisible()
    await expect(page.getByText('Some details need attention')).toBeVisible()
    await expect(page).toHaveURL(/\/bookings\/new/)
  })
})

test.describe('unauthorized access', () => {
  test('caretakers only see their areas and are blocked from others by URL', async ({ page }) => {
    await signIn(page, E2E.cleaner.email)
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'Housekeeping' })).toBeVisible()
    for (const hidden of ['Bookings', 'Guests', 'Finances', 'Reports']) {
      await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0)
    }
    for (const path of ['/finances', '/bookings', '/guests', '/reports', '/settings/staff']) {
      await page.goto(path)
      await expect(page.getByText('You don’t have access to this page')).toBeVisible()
    }
  })

  test('another business’s records cannot be opened by changing the id', async ({ page }) => {
    const { otherPropertyId } = fixture()
    await signIn(page, E2E.owner.email)
    await page.goto(`/properties/${otherPropertyId}`)
    await expect(page.getByText('We couldn’t load this')).toBeVisible()
    await expect(page.getByText('Private Villa')).toHaveCount(0)
  })

  test('signed-out visitors are sent to sign in and returned afterwards', async ({ page }) => {
    await page.goto('/finances?tab=expenses')
    await expect(page).toHaveURL(/\/login\?next=/)
    await page.getByLabel('Email').fill(E2E.owner.email)
    await page.getByLabel('Password').fill(E2E.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/finances\?tab=expenses/)
  })
})

test.describe('empty states', () => {
  test('caretaker with nothing assigned sees helpful empty states', async ({ page }) => {
    await signIn(page, E2E.cleaner.email)
    await page.goto('/properties')
    await expect(page.getByText('No properties have been assigned to you yet.')).toBeVisible()
    await page.goto('/inventory')
    await expect(page.getByText('No stock items yet')).toBeVisible()
    await page.goto('/maintenance')
    await expect(page.getByText('No open maintenance requests')).toBeVisible()
  })
})
