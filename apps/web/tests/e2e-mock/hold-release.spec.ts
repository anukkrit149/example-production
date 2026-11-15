import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

test('hold stays disarmed until a reason and a photo are both present', async ({ page }) => {
  await signIn(page, 'QA Checker')
  await page.goto('/pieces/piece-cut-ok')
  await page.getByText('More', { exact: true }).click()
  await page.getByRole('button', { name: 'Put on hold' }).click()
  const confirm = page.getByRole('button', { name: 'Confirm hold' })
  await expect(confirm).toBeDisabled()
  await expect(page.getByText('A reason and a photo are needed.')).toBeVisible()
  await page.getByLabel('Reason').fill('shade is wrong')
  await expect(page.getByText('A reason and a photo are needed.')).toHaveCount(0)
  await expect(confirm).toBeDisabled()
})

test('release stays disarmed until a reason and a photo are both present', async ({ page }) => {
  await signIn(page, 'QA Checker')
  await page.goto('/pieces/piece-hold')
  await page.getByRole('button', { name: 'Release hold' }).click()
  const confirm = page.getByRole('button', { name: 'Confirm release' })
  await expect(confirm).toBeDisabled()
  await expect(page.getByText('A reason and a photo are needed.')).toBeVisible()
  await page.getByLabel('Reason').fill('shade is right')
  await expect(page.getByText('A reason and a photo are needed.')).toHaveCount(0)
  await expect(confirm).toBeDisabled()
})
