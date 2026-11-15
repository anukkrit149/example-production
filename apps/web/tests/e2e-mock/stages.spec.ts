import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

/**
 * Each row is a canned piece. The status and the next-step sentence are the
 * words the screen must show for that script. They are not computed here.
 */
const STAGES: Array<[id: string, status: string, next: string]> = [
  ['piece-planned', 'Planned', 'Start cutting'],
  ['piece-cut-pending', 'Cutting QA due', 'Do the QA'],
  ['piece-cut-ok', 'Cut OK', 'Hand to worker'],
  ['piece-pasting', 'With pasting', 'Take back'],
  ['piece-paste-qa', 'Pasting QA due', 'Do the QA'],
  ['piece-paste-ok', 'Paste OK', 'Hand to worker'],
  ['piece-stitching', 'With stitching', 'Take back'],
  ['piece-stitch-qa', 'Stitching QA due', 'Do the QA'],
  ['piece-stitch-ok', 'Stitch OK', 'Hand to worker'],
  ['piece-finishing', 'With finishing', 'Take back'],
  ['piece-finish-qa', 'Finishing QA due', 'Do the QA'],
  ['piece-finish-ok', 'Finish OK', 'Do the QA'],
  ['piece-qc', 'QC passed', 'Pack'],
  ['piece-hold', 'On hold', 'Release hold'],
]

test('Pieces status lists the canned style', async ({ page }) => {
  await signIn(page, 'QA Checker')
  await page.goto('/pieces')
  await expect(page.getByRole('heading', { name: 'Pieces status' })).toBeVisible()
  await expect(page.getByText('HF-JKT-01').first()).toBeVisible()
})

for (const [id, status, next] of STAGES) {
  test(`${id} shows ${status} and next step ${next}`, async ({ page }) => {
    await signIn(page, 'QA Checker')
    await page.goto(`/pieces/${id}`)
    await expect(page.getByText(status, { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('definition').filter({ hasText: next })).toBeVisible()
  })
}
