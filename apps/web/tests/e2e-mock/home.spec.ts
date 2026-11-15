import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

test('a QA checker sees the three doors and no admin links', async ({ page }) => {
  await signIn(page, 'QA Checker')
  await expect(page.getByRole('heading', { name: 'What are you doing?' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Production line' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pieces status' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Inventory' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Codes' })).toHaveCount(0)
})

test('an admin sees Codes and Labels on Home', async ({ page }) => {
  await signIn(page, 'Admin')
  await expect(page.getByRole('link', { name: 'Codes' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Labels' })).toBeVisible()
})
