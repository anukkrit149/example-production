import { expect, test } from '@playwright/test'
import { blockUnmockedApi, signIn } from './helpers'

test('a recorded delivery is listed, and the receive wizard opens on the goods photo', async ({ page }) => {
  await signIn(page, 'Store')
  await page.goto('/inventory')
  await expect(page.getByRole('heading', { name: 'Store inventory' })).toBeVisible()
  await expect(page.getByText('HIDE-1').first()).toBeVisible()
  await page.getByRole('link', { name: 'Received a delivery' }).click()
  await expect(page.getByRole('paragraph').filter({ hasText: 'Photo of the goods' })).toBeVisible()
})

test('a short count shows the shortage from the canned result', async ({ page }) => {
  await signIn(page, 'Store')
  await blockUnmockedApi(page)
  await page.route('**/api/inventory/receipts/rcpt-1/count', async (route) => {
    await route.fulfill({
      json: {
        receipt: {
          hasDiscrepancy: true,
          lines: [{ itemId: 'item-hide', code: 'HIDE-1', variance: -2 }],
        },
      },
    })
  })

  await page.goto('/inventory/receipts/rcpt-1/count')
  await page.getByLabel('Counted HIDE-1').fill('8')
  await page.getByRole('button', { name: 'CONFIRM' }).click()
  await expect(page.getByRole('heading', { name: 'Counted' })).toBeVisible()
  await expect(page.getByText('HIDE-1 short by 2')).toBeVisible()
})
