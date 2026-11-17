import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import type { Database } from '../../src/types/database'
import { env } from '../integration/env'
import { E2E, fixture, signIn } from './fixtures'

const admin = createClient<Database>(env.url, env.secretKey, { auth: { persistSession: false } })
const reference = `E2E${Date.now().toString(36).toUpperCase()}`

async function userId(email: string) {
  const { data } = await admin.from('profiles').select('id').eq('email', email).single()
  return data!.id
}

test.describe('landing page', () => {
  test('signed-out visitors see the product, pricing and contacts', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/welcome$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Run your BNB with calm, clear control.' })).toBeVisible()
    const pricing = page.locator('#pricing')
    await expect(pricing.getByText('KES 2,999')).toBeVisible()
    await expect(pricing.getByText('KES 32,900')).toBeVisible()
    await expect(pricing.getByText('Save KES 3,088 a year')).toBeVisible()
    await expect(page.getByText('0721 609 317')).toBeVisible()
    await expect(page.getByText('mocodelabs@gmail.com')).toBeVisible()
    await page.screenshot({ path: 'test-results/landing.png', fullPage: true })

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])

    await page.getByRole('link', { name: 'Start your 14-day free trial' }).click()
    await expect(page).toHaveURL(/\/signup$/)
    await expect(page.getByText('Start your 14-day free trial')).toBeVisible()
  })
})

test.describe('subscription', () => {
  test.afterAll(async () => {
    await admin.from('platform_admins').delete().eq('user_id', await userId(E2E.outsider.email))
  })

  test('owner sees the trial and submits a payment; a platform admin approves it', async ({ browser }) => {
    const ownerPage = await browser.newPage()
    await signIn(ownerPage, E2E.owner.email)
    await expect(ownerPage.getByText(/Free trial: \d+ days left\./)).toBeVisible()
    await ownerPage.getByRole('link', { name: 'Choose a plan' }).click()
    await expect(ownerPage).toHaveURL(/\/settings\/billing$/)
    await expect(ownerPage.getByText('Free trial', { exact: true })).toBeVisible()

    await ownerPage.getByText('Monthly', { exact: true }).click()
    await ownerPage.getByRole('textbox', { name: /Transaction reference/ }).fill(reference)
    await ownerPage.getByRole('button', { name: /I’ve paid KES 2,999/ }).click()
    await expect(ownerPage.getByText('Awaiting confirmation', { exact: true })).toBeVisible()
    await ownerPage.screenshot({ path: 'test-results/billing.png', fullPage: true })

    // The caretaker sees neither the billing page nor the renew link.
    const cleanerPage = await browser.newPage()
    await signIn(cleanerPage, E2E.cleaner.email)
    await cleanerPage.goto('/settings/billing')
    await expect(cleanerPage.getByText('You don’t have access to this page')).toBeVisible()
    await cleanerPage.close()

    // Platform admin approves.
    await admin.from('platform_admins').insert({ user_id: await userId(E2E.outsider.email) })
    const opsPage = await browser.newPage()
    await signIn(opsPage, E2E.outsider.email)
    await opsPage.goto('/platform')
    await expect(opsPage.getByRole('heading', { name: 'Platform billing' })).toBeVisible()
    const row = opsPage.getByRole('listitem').filter({ hasText: reference })
    await expect(row).toContainText(E2E.business)
    await opsPage.screenshot({ path: 'test-results/platform.png', fullPage: true })
    await row.getByRole('button', { name: 'Approve' }).click()
    await expect(opsPage.getByText(`${E2E.business} activated.`)).toBeVisible()
    await opsPage.close()

    await ownerPage.reload()
    await expect(ownerPage.getByText('Active · Monthly')).toBeVisible()
    await expect(ownerPage.getByText('Confirmed', { exact: true })).toBeVisible()
    await expect(ownerPage.getByText(/Free trial:/)).toHaveCount(0)
    await ownerPage.close()
  })

  test('an expired business is read-only with a clear explanation', async ({ page }) => {
    const { orgId } = fixture()
    const { data: before } = await admin.from('subscriptions').select('*').eq('organization_id', orgId).single()
    // Start without a payment waiting (that would replace the renew link with an "awaiting" note).
    await admin.from('subscription_payment_requests').update({ status: 'rejected' }).eq('organization_id', orgId).eq('status', 'pending')
    await admin
      .from('subscriptions')
      .update({ trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(), current_period_end: null })
      .eq('organization_id', orgId)
    try {
      await signIn(page, E2E.owner.email)
      await expect(page.getByRole('alert').filter({ hasText: 'read-only until you renew' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Renew now' })).toBeVisible()

      await page.goto('/guests')
      await page.getByRole('button', { name: 'New guest' }).click()
      await page.getByRole('textbox', { name: /Full name/ }).fill('Blocked Guest')
      await page.getByRole('textbox', { name: /Phone \/ WhatsApp/ }).fill('0712 345 678')
      await page.getByRole('dialog').getByRole('button', { name: 'Add guest' }).click()
      await expect(page.getByText(/subscription has ended, so this business is read-only/).first()).toBeVisible()
      await page.screenshot({ path: 'test-results/expired.png' })
    } finally {
      await admin
        .from('subscriptions')
        .update({ trial_ends_at: before!.trial_ends_at, current_period_end: before!.current_period_end })
        .eq('organization_id', orgId)
    }
  })
})
