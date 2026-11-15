import { expect, test } from '@playwright/test'
import { connectDb, disconnectDb, flipToEnglish, signIn } from './helpers'

test.beforeAll(connectDb)
test.afterAll(disconnectDb)

/**
 * The new front door: three doors, no admin strip for a checker, and a tap on
 * one of them lands where the door says it does.
 */
test('a QA checker lands on Home with three doors and no admin links', async ({ page }) => {
  await signIn(page, 'QA Checker')
  await flipToEnglish(page)

  await expect(page.getByRole('heading', { name: 'What are you doing?' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Production line' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pieces status' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Inventory' })).toBeVisible()

  // Not an admin, not store, not supervisor: no route to Codes or Labels from here.
  await expect(page.getByRole('link', { name: 'Codes' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Labels' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Production line' }).click()
  await expect(page).toHaveURL(/\/scan$/)
})

/**
 * Admin sees the two-item strip Home shows nobody else — the door to issuing
 * codes and the door to the label queue, both filed under Admin now.
 */
test('an admin sees Codes and Labels on Home, and /print-queue redirects to /admin/labels', async ({ page }) => {
  await signIn(page, 'Admin')
  await flipToEnglish(page)

  await expect(page.getByRole('link', { name: 'Codes' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Labels' })).toBeVisible()

  await page.goto('/print-queue')
  await expect(page).toHaveURL(/\/admin\/labels$/)
})
