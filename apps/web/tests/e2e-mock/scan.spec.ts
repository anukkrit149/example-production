import { expect, test } from '@playwright/test'
import { blockUnmockedApi, signIn } from './helpers'

test('an unknown code warns, and a known code opens that piece', async ({ page }) => {
  await signIn(page, 'QA Checker')
  await blockUnmockedApi(page)
  await page.route('**/api/scan/**', async (route) => {
    const token = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '')
    if (token === 'HF-P-PLANAAAA') {
      await route.fulfill({ json: { id: 'piece-planned' } })
      return
    }
    await route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'missing' } } })
  })

  await page.goto('/scan')
  await page.getByLabel('Type the code instead').fill('HF-P-ABCDEFGH')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.getByText('No piece has this code')).toBeVisible()

  await page.getByLabel('Type the code instead').fill('HF-P-PLANAAAA')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page).toHaveURL(/\/pieces\/piece-planned$/)
  await expect(page.getByText('Planned', { exact: true }).first()).toBeVisible()
})
