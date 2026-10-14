import { expect, test } from '@playwright/test'
import { E2E, signIn } from './fixtures'

/** Calendar date in Nairobi, `days` from today, as YYYY-MM-DD. */
function nairobiDate(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(d)
}

const CHECK_IN = nairobiDate(30)
const CHECK_OUT = nairobiDate(33)

test.describe.serial('owner journey', () => {
  test('from first sign-in to a monthly report', async ({ page }) => {
    // 1. Sign in → first-run dashboard
    await signIn(page, E2E.owner.email)
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Wanjiku/ })).toBeVisible()
    await expect(page.getByText('Add your first property')).toBeVisible()

    // 2. Create a property
    await page.getByRole('link', { name: 'Add property' }).first().click()
    await page.getByLabel('Property name').fill('E2E Villa')
    await page.getByLabel('Maximum guests').fill('4')
    await page.getByLabel('Standard nightly rate (KES)').fill('10000')
    await page.getByLabel('Cleaning fee (KES)').fill('2000')
    await page.getByRole('button', { name: 'Create property' }).click()
    await expect(page.getByRole('heading', { name: 'E2E Villa' })).toBeVisible()

    // 3. Add a rentable unit
    await page.getByRole('tab', { name: /Units/ }).click()
    await page.getByRole('button', { name: 'Add unit' }).click()
    const unitDialog = page.getByRole('dialog')
    await unitDialog.getByLabel('Unit name').fill('Garden Cottage')
    await unitDialog.getByRole('button', { name: 'Add unit' }).click()
    await expect(page.getByText('Garden Cottage')).toBeVisible()

    // 4. Create a guest
    await page.goto('/guests')
    await page.getByRole('button', { name: 'New guest' }).click()
    const guestDialog = page.getByRole('dialog')
    await guestDialog.getByLabel('Full name').fill('Amani Mwangi')
    await guestDialog.getByLabel('Phone / WhatsApp').fill('0712 000 111')
    await expect(guestDialog.getByText('Saved as +254712000111')).toBeVisible()
    await guestDialog.getByRole('button', { name: 'Add guest' }).click()
    await expect(page.getByRole('heading', { name: 'Amani Mwangi' })).toBeVisible()

    // 5. Create a reservation with 6. a deposit
    await page.getByRole('link', { name: 'New booking' }).first().click()
    await expect(page.getByText('Amani Mwangi')).toBeVisible()
    await page.getByRole('combobox', { name: 'Unit', exact: true }).selectOption({ label: 'Garden Cottage' })
    await page.getByRole('textbox', { name: 'Check-in', exact: true }).fill(CHECK_IN)
    await page.getByRole('textbox', { name: 'Check-out', exact: true }).fill(CHECK_OUT)
    await expect(page.getByText('Available for these dates')).toBeVisible()
    await expect(page.getByText('KES 32,000.00')).toBeVisible() // 3 × 10,000 + 2,000 cleaning
    await page.getByRole('checkbox', { name: 'Record a deposit now' }).click()
    await page.getByLabel('Amount received').fill('10000')
    await page.getByRole('combobox', { name: 'Method', exact: true }).selectOption({ label: 'Cash' })
    await page.getByRole('button', { name: 'Create booking' }).click()
    await expect(page.getByText('Booking created.')).toBeVisible()
    await expect(page.getByText('Part paid')).toBeVisible()
    const bookingUrl = page.url()
    const reference = (await page.getByRole('heading', { level: 1 }).innerText()).match(/CS-\d{4}-[A-Z0-9]{5}/)![0]

    // 7. See it on the calendar
    await page.goto(`/calendar?view=week&date=${CHECK_IN}`)
    await expect(page.getByRole('button', { name: /Amani Mwangi/ })).toBeVisible()

    // 8. Record the remaining payment
    await page.goto(bookingUrl)
    await page.getByRole('button', { name: 'Record', exact: true }).click()
    const payDialog = page.getByRole('dialog')
    await expect(payDialog.getByLabel('Type')).toHaveValue('balance')
    await expect(payDialog.getByLabel('Amount (KES)')).toHaveValue('22000.00')
    await payDialog.getByLabel('Method').selectOption({ label: 'M-Pesa' })
    await payDialog.getByLabel('Transaction reference').fill('SJK4H7XQ2P')
    await payDialog.getByRole('button', { name: 'Record' }).click()
    await expect(page.getByText('Paid', { exact: true })).toBeVisible()

    // 9. Check in (early-arrival warning shown) and 10. check out
    await page.getByRole('button', { name: 'Check in' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('early check-in')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Check in' }).click()
    await expect(page.getByText('Checked in', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Check out' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Check out' }).click()
    await expect(page.getByText('Checked out', { exact: true })).toBeVisible()

    // 11. Complete the automatically created housekeeping task
    await page.goto('/housekeeping')
    await page.getByRole('link', { name: /Turnover clean — E2E Villa \/ Garden Cottage/ }).first().click()
    await expect(page.getByText(`Departure of booking ${reference}`)).toBeVisible()
    await expect(page.getByText('0/13 done')).toBeVisible()
    await page.getByRole('button', { name: 'Start' }).click()
    await page.getByRole('checkbox', { name: 'Strip and replace linen' }).click()
    await expect(page.getByText('1/13 done')).toBeVisible()
    await page.getByRole('button', { name: 'Mark complete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible()

    // 12. Record a property expense
    await page.goto('/finances?tab=expenses')
    await page.getByRole('button', { name: 'Record expense' }).click()
    const expDialog = page.getByRole('dialog')
    await expDialog.getByLabel('Description').fill('Laundry for turnover')
    await expDialog.getByLabel('Category').selectOption({ label: 'Laundry' })
    await expDialog.getByLabel('Property').selectOption({ label: 'E2E Villa' })
    await expDialog.getByLabel('Amount (KES)').fill('1500')
    await expDialog.getByRole('button', { name: 'Record expense' }).click()
    await expect(page.getByText('Laundry for turnover')).toBeVisible()

    // 13. Monthly report: this month's cash, and the stay month's occupancy
    await page.goto('/reports?tab=monthly')
    const thisMonth = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' }).format(new Date())
    const row = page.getByRole('row', { name: new RegExp(thisMonth) })
    await expect(row).toContainText('KES 32,000') // collected
    await expect(row).toContainText('KES 1,500') // expenses
    await expect(row).toContainText('KES 30,500') // estimated operating income

    const stayMonthStart = `${CHECK_IN.slice(0, 7)}-01`
    await page.goto(`/reports?tab=performance&from=${stayMonthStart}&to=${CHECK_OUT}`)
    await expect(page.getByRole('row', { name: /E2E Villa/ })).toBeVisible()
    await expect(page.getByText('Property performance')).toBeVisible()
  })
})
