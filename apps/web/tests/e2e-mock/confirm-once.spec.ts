import { expect, test } from '@playwright/test'
import { blockUnmockedApi, signIn } from './helpers'

test('Approve posts once, then the write button is gone', async ({ page }) => {
  await signIn(page, 'QA Checker')
  await blockUnmockedApi(page)
  let posts = 0
  await page.route('**/api/pieces/piece-cut-pending/qa', async (route) => {
    posts += 1
    await route.fulfill({
      json: { piece: { id: 'piece-cut-pending', state: 'CUT_OK' } },
    })
  })

  await page.goto('/pieces/piece-cut-pending/do/submit_qa')
  const approve = page.getByRole('button', { name: 'Approve', exact: true })
  await expect(approve).toBeEnabled()
  await approve.click()
  await expect(page.getByText('Submitted')).toBeVisible()
  await expect(approve).toHaveCount(0)
  expect(posts).toBe(1)
})
