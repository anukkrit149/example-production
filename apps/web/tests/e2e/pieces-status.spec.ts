import { expect, test } from '@playwright/test'
import {
  activatePiece,
  answerAllYes,
  connectDb,
  db,
  disconnectDb,
  flipToEnglish,
  PHOTO,
  signIn,
} from './helpers'

test.beforeAll(connectDb)
test.afterAll(disconnectDb)

/**
 * Pieces Status end to end: the door from Home, the stage chips, the search
 * box, a row opening the detail, and the On hold chip picking up a piece the
 * detail's own hold flow just put there.
 */
test('Pieces status: filter, search, open a row, and see a held piece under On hold', async ({ page }) => {
  await signIn(page, 'Store Operator')
  await flipToEnglish(page)

  await page.getByRole('link', { name: 'Pieces status' }).click()
  await expect(page).toHaveURL(/\/pieces$/)
  await expect(page.getByRole('heading', { name: 'Pieces status' })).toBeVisible()

  const pieceId = await activatePiece(page, {
    style: 'LJ-204',
    size: 'M',
    shade: 'BLK-02',
    lot: 'LOT-PS-1',
  })
  const piece = await db().piece.findUniqueOrThrow({ where: { id: pieceId } })
  const rowNameRe = new RegExp(`LJ-204 M · BLK-02 #${String(piece.serial).padStart(4, '0')}`)

  await page.goto('/pieces')

  // --- Filter: Cutting shows the freshly activated piece --------------------
  await page.getByRole('button', { name: 'Cutting', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cutting', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('link', { name: rowNameRe })).toBeVisible()

  // --- Search: the last six characters of the token isolate this one row ----
  // Scoped to the row list itself: the header carries its own links (the
  // lockup, Home), which `getByRole('link')` unscoped would also pick up.
  const suffix = piece.qrToken.slice(-6)
  await page.getByLabel('Code or style').fill(suffix)
  const rowList = page.getByRole('list').last()
  await expect(rowList.getByRole('link', { name: rowNameRe })).toBeVisible()
  await expect(rowList.getByRole('link')).toHaveCount(1)

  // --- Open the row -> the piece detail --------------------------------------
  await page.getByRole('link', { name: rowNameRe }).click()
  await expect(page).toHaveURL(new RegExp(`/pieces/${pieceId}$`))

  // --- Hold with a reason and a photo, from More -----------------------------
  // `hold` needs CUT_OK, not CUT_PENDING_QA, so pass cutting QA first. The
  // phone changes hands to QA for the pass, same as the floor-checklist hold
  // case, then back to the store operator for the hold itself.
  await signIn(page, 'QA Checker')
  await flipToEnglish(page)
  await page.goto(`/pieces/${pieceId}`)
  await page.getByRole('link', { name: 'Next' }).click()
  await answerAllYes(page)
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByText('Cut OK', { exact: true })).toBeVisible()

  await signIn(page, 'Store Operator')
  await flipToEnglish(page)
  await page.goto(`/pieces/${pieceId}`)
  await page.getByText('More', { exact: true }).click()
  await page.getByRole('button', { name: 'Put on hold', exact: true }).click()

  const holdConfirm = page.getByRole('button', { name: 'Confirm hold', exact: true })
  await expect(holdConfirm).toBeDisabled()
  await page.getByLabel('Reason').fill('Checking the shade under Pieces Status e2e')
  await page.setInputFiles('input[type=file]', PHOTO)
  await expect(page.getByText(/^Photo taken \(1\)$/)).toBeVisible()
  await expect(holdConfirm).toBeEnabled()
  await holdConfirm.click()
  await expect(page.locator('section').getByText('On hold', { exact: true })).toBeVisible()

  // --- Back to /pieces, On hold chip shows it --------------------------------
  await page.goto('/pieces')
  await page.getByRole('button', { name: 'On hold', exact: true }).click()
  await expect(page.getByRole('button', { name: 'On hold', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('link', { name: rowNameRe })).toBeVisible()
})
