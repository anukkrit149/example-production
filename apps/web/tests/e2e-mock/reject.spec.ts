import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

test('reject stays disarmed until a reason is chosen', async ({ page }) => {
  await signIn(page, 'QA Checker')
  await page.goto('/pieces/piece-cut-ok/reject')
  const reject = page.getByRole('button', { name: 'Reject this piece' })
  await expect(reject).toBeDisabled()
  await page.getByRole('radio', { name: 'Cut defect' }).click()
  await expect(reject).toBeEnabled()
})
