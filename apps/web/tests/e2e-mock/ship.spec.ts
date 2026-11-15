import { expect, test } from '@playwright/test'
import { blockUnmockedApi, signIn } from './helpers'

test('ship lists the canned order and then its carton', async ({ page }) => {
  await signIn(page, 'Store')
  await blockUnmockedApi(page)
  await page.route('**/api/cartons**', async (route) => {
    await route.fulfill({
      json: {
        cartons: [{ carton: 'CTN-1', packed: 3, shipped: 0, pieceIds: ['piece-qc'], lastPackedAt: '2026-01-15T04:30:00.000Z' }],
      },
    })
  })

  await page.goto('/ship')
  await expect(page.getByRole('heading', { name: 'Ship a carton' })).toBeVisible()
  await page.getByRole('button', { name: /HF-1042/ }).click()
  await expect(page.getByRole('button', { name: /CTN-1/ })).toBeVisible()
})
