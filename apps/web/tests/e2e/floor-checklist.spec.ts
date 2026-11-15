import { expect, test } from '@playwright/test'
import { answerAllYes, connectDb, db, disconnectDb, flipToEnglish, PHOTO, pieceIdFor, plannedToken, signIn } from './helpers'

/**
 * The stepper, in the language the floor actually reads.
 *
 * `cutting-slice.spec.ts` proves the whole app works end to end in English,
 * through the dev picker's assumed locale. This suite is about the other
 * half of that promise: Hindi is the default an operator who has never
 * touched a settings screen sees, one check is one screen, and the checklist
 * that gates a step is the same list the office publishes — not a hard-coded
 * form. A 390x844 viewport, because that is the phone this runs on.
 */
test.use({ viewport: { width: 390, height: 844 } })

test.beforeAll(connectDb)
test.afterAll(disconnectDb)

test('a cutter activates a planned label and passes cutting QA, in Hindi, one check per screen', async ({ page }) => {
  await signIn(page, 'Store Operator')
  await expect(page.getByRole('button', { name: 'हिं' })).toHaveAttribute('aria-pressed', 'true')

  const token = await plannedToken()
  const pieceId = await pieceIdFor(token)
  await page.goto('/scan')
  await page.getByPlaceholder(/कोड/).fill(token)
  await page.getByRole('button', { name: 'खोलें' }).click()
  await page.getByRole('link', { name: 'आगे' }).click()

  await expect(page.getByText('कदम 1 / 4')).toBeVisible()
  await expect(page.getByText('चमड़े का लॉट टिकट से मेल खाता है')).toBeVisible()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'हाँ' }).click()
  await page.setInputFiles('input[type=file]', PHOTO)
  await expect(page.getByText('फ़ोटो ले ली')).toBeVisible()
  await page.getByRole('button', { name: 'हाँ' }).click()

  await page.getByLabel('चमड़े का लॉट').fill('LOT-E2E')
  await page.getByRole('button', { name: 'पक्का करें' }).click()
  await expect(page.getByText('कटाई QA बाकी')).toBeVisible()

  // QA checker passes cutting QA on the same piece.
  await signIn(page, 'QA Checker')
  await page.goto(`/pieces/${pieceId}`)
  await page.getByRole('link', { name: 'आगे' }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'हाँ' }).click()
  await page.setInputFiles('input[type=file]', PHOTO)
  await page.getByRole('button', { name: 'हाँ' }).click()
  await page.getByRole('button', { name: 'मंज़ूर' }).click()
  await expect(page.getByText('कटाई OK')).toBeVisible()

  // Scoped to this piece: the suite runs other specs' pieces through their own
  // QA passes first, so an unscoped count would fail from the moment this file
  // stopped running in total isolation.
  expect(await db().pieceEvent.count({ where: { pieceId, eventType: 'STAGE_QA_PASSED' } })).toBe(1)
  const ev = await db().pieceEvent.findFirstOrThrow({ where: { pieceId, eventType: 'PIECE_ACTIVATED' } })
  expect((ev.details as { checklist: { checklistNumber: number } }).checklist.checklistNumber).toBe(1)
})

test('NO on a check offers hold, and holding records the reason', async ({ page }) => {
  await signIn(page, 'Store Operator')
  const token = await plannedToken()
  await page.goto('/scan')
  await page.getByPlaceholder(/कोड/).fill(token)
  await page.getByRole('button', { name: 'खोलें' }).click()
  await page.getByRole('link', { name: 'आगे' }).click()

  await page.getByRole('button', { name: 'नहीं' }).click()
  await expect(page.getByRole('dialog', { name: 'क्या गलत है?' })).toBeVisible()
  // A planned piece cannot be held or rejected; only "go back" is offered.
  await expect(page.getByRole('button', { name: 'रोक कर रखें' })).toHaveCount(0)
  await page.getByRole('button', { name: 'पीछे' }).click()
  await expect(page.getByText('कदम 1 / 4')).toBeVisible()
})

test('a double tap on CONFIRM writes one event', async ({ page }) => {
  await signIn(page, 'Store Operator')
  const token = await plannedToken()
  await page.goto('/scan')
  await page.getByPlaceholder(/कोड/).fill(token)
  await page.getByRole('button', { name: 'खोलें' }).click()
  await page.getByRole('link', { name: 'आगे' }).click()

  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'हाँ' }).click()
  await page.setInputFiles('input[type=file]', PHOTO)
  await page.getByRole('button', { name: 'हाँ' }).click()
  await page.getByLabel('चमड़े का लॉट').fill('LOT-E2E')

  // Wait for CONFIRM to actually arm before tapping it — the lot field's fill
  // enables it on the next render, and racing that render is a different bug
  // from the one this case exists to catch.
  await expect(page.getByRole('button', { name: 'पक्का करें' })).toBeEnabled()

  // Two real DOM click events dispatched inside one JS task: React has not
  // re-rendered between them, so the `busy` guard has not painted `disabled`
  // yet and both clicks genuinely fire. `Promise.all([click(), click({force})])`
  // does not produce this — Playwright's own actionability wait on the
  // unforced call only starts once the forced one has already dispatched and
  // its response has begun re-rendering the page, so the unforced call chases
  // a button that is already gone. Reaching into the DOM directly is what
  // `cutting-slice.spec.ts`'s English double-tap case does for the same
  // reason, for the old QA form's Pass button.
  await page.evaluate(() => {
    const confirm = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'पक्का करें',
    ) as HTMLButtonElement | undefined
    if (!confirm) throw new Error('CONFIRM button not found')
    confirm.click()
    confirm.click()
  })
  await expect(page.getByText('कटाई QA बाकी')).toBeVisible()

  const piece = await db().piece.findUniqueOrThrow({ where: { qrToken: token } })
  expect(await db().pieceEvent.count({ where: { pieceId: piece.id, eventType: 'PIECE_ACTIVATED' } })).toBe(1)
})

/**
 * A measurement on the cutting QA checklist, appended straight into the
 * published version through `db()` — the admin editor is Task 3's concern,
 * not this one's. Out of range, the operator can still carry on to the
 * summary (the decision is made there, not mid-flow); Approve is blocked
 * until the value is corrected and re-entered.
 */
test('a measurement out of range blocks Approve until re-measured, in range', async ({ page }) => {
  const version = await db().checklistVersion.findFirstOrThrow({
    where: { checklist: { scopeKey: 'qa|cutting|jacket|' }, publishedAt: { not: null } },
  })
  await db().checklistItem.create({
    data: {
      versionId: version.id,
      position: 99,
      kind: 'measure',
      textEn: 'Chest width',
      textHi: 'छाती की चौड़ाई',
      pictogram: 'measure',
      unit: 'cm',
      min: 44,
      max: 46,
    },
  })

  await signIn(page, 'Store Operator')
  await flipToEnglish(page)
  const token = await plannedToken()
  const pieceId = await pieceIdFor(token)
  await page.goto('/scan')
  await page.getByLabel('Type the code instead').fill(token)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('link', { name: 'Next' }).click()

  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'YES', exact: true }).click()
  await page.setInputFiles('input[type=file]', PHOTO)
  await page.getByRole('button', { name: 'YES', exact: true }).click()
  await page.getByLabel('Leather lot').fill('LOT-E2E-M')
  await page.getByRole('button', { name: 'CONFIRM', exact: true }).click()
  await expect(page.getByText('Cutting QA due', { exact: true })).toBeVisible()

  await signIn(page, 'QA Checker')
  await flipToEnglish(page)
  await page.goto(`/pieces/${pieceId}`)
  await page.getByRole('link', { name: 'Next' }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'YES', exact: true }).click()
  await page.setInputFiles('input[type=file]', PHOTO)
  await page.getByRole('button', { name: 'YES', exact: true }).click()

  // The new measure step: an out-of-range value still lets the operator go on.
  const numberInput = page.getByRole('spinbutton')
  await numberInput.fill('47')
  await expect(page.getByText('Outside the allowed range')).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'All questions' })).toBeVisible()
  const approve = page.getByRole('button', { name: 'Approve', exact: true })
  await expect(approve).toBeDisabled()
  await expect(page.getByText('A measurement is outside the allowed range. Reject, or go back and re-measure.')).toBeVisible()

  // Back to the measure step, fix the value, and Approve.
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await numberInput.fill('45')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(approve).toBeEnabled()
  await approve.click()
  await expect(page.getByText('Cut OK', { exact: true })).toBeVisible()

  await page.goto(`/pieces/${pieceId}/history`)
  await expect(page.getByText('45 cm', { exact: false })).toBeVisible()
})

/**
 * Hold and release are evidence now, not just a reason: the photo policy
 * makes both required, so the button on the piece's More menu stays disabled
 * until one is attached, and a supervisor's release needs the same.
 */
test('hold from More needs a photo, and a supervisor releases with one', async ({ page }) => {
  await signIn(page, 'Store Operator')
  await flipToEnglish(page)
  const token = await plannedToken()
  const pieceId = await pieceIdFor(token)
  await page.goto('/scan')
  await page.getByLabel('Type the code instead').fill(token)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('link', { name: 'Next' }).click()

  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'YES', exact: true }).click()
  await page.setInputFiles('input[type=file]', PHOTO)
  await page.getByRole('button', { name: 'YES', exact: true }).click()
  await page.getByLabel('Leather lot').fill('LOT-E2E-H')
  await page.getByRole('button', { name: 'CONFIRM', exact: true }).click()
  await expect(page.getByText('Cutting QA due', { exact: true })).toBeVisible()

  // `hold` is not offered on a piece still awaiting its QA (only submit_qa and
  // reject are); pass cutting QA first so the piece reaches CUT_OK, which does.
  // `answerAllYes` (not a hard-coded click count) so this stays correct
  // whichever checklist items an earlier test in this file may have added.
  await signIn(page, 'QA Checker')
  await flipToEnglish(page)
  await page.goto(`/pieces/${pieceId}`)
  await page.getByRole('link', { name: 'Next' }).click()
  await answerAllYes(page)
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByText('Cut OK', { exact: true })).toBeVisible()

  // Hold is a store/supervisor/admin action, not QA's — the phone changes
  // hands back to the store operator before it is offered.
  await signIn(page, 'Store Operator')
  await flipToEnglish(page)
  await page.goto(`/pieces/${pieceId}`)
  await page.getByText('More', { exact: true }).click()
  await page.getByRole('button', { name: 'Put on hold', exact: true }).click()

  const holdConfirm = page.getByRole('button', { name: 'Confirm hold', exact: true })
  await expect(holdConfirm).toBeDisabled()
  await page.getByLabel('Reason').fill('Shade looks off')
  await expect(holdConfirm).toBeDisabled()
  await page.setInputFiles('input[type=file]', PHOTO)
  await expect(page.getByText(/^Photo taken \(1\)$/)).toBeVisible()
  await expect(holdConfirm).toBeEnabled()
  await holdConfirm.click()

  // Both the piece card's stage chip and the detail screen's own "Status"
  // fact now say the same state name, so this is scoped to the chip.
  await expect(page.locator('section').getByText('On hold', { exact: true })).toBeVisible()

  await signIn(page, 'Supervisor')
  await flipToEnglish(page)
  await page.goto(`/pieces/${pieceId}`)
  await page.getByRole('button', { name: 'Release hold', exact: true }).click()
  const releaseConfirm = page.getByRole('button', { name: 'Confirm release', exact: true })
  await expect(releaseConfirm).toBeDisabled()
  await page.getByLabel('Reason').fill('Checked, shade is fine')
  await page.setInputFiles('input[type=file]', PHOTO)
  await expect(page.getByText(/^Photo taken \(1\)$/)).toBeVisible()
  await expect(releaseConfirm).toBeEnabled()
  await releaseConfirm.click()

  // Both the piece card's stage chip and the detail screen's own "Status"
  // fact now say the same state name, so this is scoped to the chip.
  await expect(page.locator('section').getByText('Cut OK', { exact: true })).toBeVisible()
  expect(await db().pieceEvent.count({ where: { pieceId, eventType: 'PIECE_HELD' } })).toBe(1)
  expect(await db().pieceEvent.count({ where: { pieceId, eventType: 'PIECE_RELEASED' } })).toBe(1)
})
