import { expect, test } from '@playwright/test'
import { connectDb, db, disconnectDb, signIn } from './helpers'

test.beforeAll(connectDb)
test.afterAll(disconnectDb)

/**
 * The office side of the gate the floor is held to: find a list on the
 * timeline, change it, watch the draft save itself, review the diff, flip
 * through it as the operator will, publish, and then give one program its
 * own version and take it back.
 */
test('an admin edits, reviews and publishes a factory default, then customises it for one program', async ({ page }) => {
  await signIn(page, 'Admin')

  // Index: tabs and the timeline.
  await page.goto('/checklists')
  await expect(page.getByRole('navigation', { name: 'Category' }).getByRole('link', { name: 'jacket' })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('navigation', { name: 'Category' }).getByRole('link', { name: 'bag' }).click()
  await expect(page).toHaveURL(/category=bag/)
  await page.getByRole('navigation', { name: 'Category' }).getByRole('link', { name: 'jacket' }).click()
  const chip = page.getByRole('link', { name: 'jacket Stitching qa' })
  await expect(chip).toContainText('5 items · v1')
  await chip.click()
  await expect(page).toHaveURL(/\/checklists\/[0-9a-f-]+$/)

  // Editor: add an item; the draft saves itself.
  const status = page.getByRole('status')
  await expect(status).toHaveText('Saved')
  await page.getByRole('button', { name: 'Add item' }).click()
  await expect(status).toHaveText('Fill in both texts to save')
  await page.getByLabel('English').fill('Lining sits flat')
  await page.getByLabel('Hindi').fill('लाइनिंग सीधी है')
  await page.getByRole('radio', { name: 'inspect' }).click()
  await expect(status).toHaveText('Saved', { timeout: 10_000 })
  await expect(page.getByRole('list', { name: 'Items' }).getByRole('listitem')).toHaveCount(6)

  // Review: the diff names the addition; flip-through walks the cards; publish makes v2.
  await page.getByRole('link', { name: 'Review & publish' }).click()
  await expect(page).toHaveURL(/\/publish$/)
  await expect(page.getByRole('list', { name: 'Changes' }).getByRole('listitem').filter({ hasText: 'Added' })).toContainText('Lining sits flat')
  await page.getByRole('button', { name: 'Next →' }).click()
  await expect(page.getByLabel('Phone preview 2 of 6')).toBeVisible()
  await page.getByRole('button', { name: 'Publish version 2' }).click()
  await expect(page).toHaveURL(/\/checklists\/[0-9a-f-]+$/)
  await expect(page.getByText('Live: v2')).toBeVisible()
  await page.goto(page.url() + '/publish')
  await expect(page.getByText('Nothing to publish')).toBeVisible()
  await expect(page.getByLabel('History').getByRole('listitem').first()).toContainText('v2')
  await expect(page.getByLabel('History').getByRole('listitem').first()).toContainText('by Admin')

  // Program: summary, then the program timeline; customise, trim, publish v1 of the override.
  const program = await db().program.findFirstOrThrow()
  await page.goto(`/programs/${program.id}`)
  await expect(page.getByText('Factory defaults throughout')).toBeVisible()
  await page.getByRole('link', { name: 'Manage checklists' }).click()
  await expect(page).toHaveURL(/\/checklists$/)
  const cell = page.getByLabel('jacket Stitching qa')
  await expect(cell).toContainText('Default · 6 items')
  await cell.getByRole('button', { name: 'Customise' }).click()
  await expect(page).toHaveURL(/\/checklists\/[0-9a-f-]+$/)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(program.name)
  await page.getByRole('button', { name: 'Remove item 6' }).click()
  await expect(status).toHaveText('Saved', { timeout: 10_000 })
  await page.getByRole('link', { name: 'Review & publish' }).click()
  // The override has never been published, so the review compares the draft
  // with the factory default it was copied from (v2): one item removed, the
  // other five unchanged.
  await expect(page.getByText('Changes from the factory default v2: 1 of 6 items')).toBeVisible()
  const overrideChanges = page.getByRole('list', { name: 'Changes' }).getByRole('listitem')
  await expect(overrideChanges).toHaveCount(6)
  await expect(overrideChanges.filter({ hasText: 'Removed' })).toContainText('Lining sits flat')
  await expect(overrideChanges.filter({ hasText: 'Unchanged' })).toHaveCount(5)
  await page.getByRole('button', { name: 'Publish version 1' }).click()
  await expect(page.getByText('Live: v1')).toBeVisible()

  // Back on the program: the chip is custom; revert restores the default.
  await page.goto(`/programs/${program.id}`)
  await expect(page.getByText('1 customised for this program')).toBeVisible()
  await page.getByRole('link', { name: 'Manage checklists' }).click()
  await expect(page.getByLabel('jacket Stitching qa')).toContainText('Custom v1 · 5 items')
  await page.getByLabel('jacket Stitching qa').getByRole('button', { name: 'Revert' }).click()
  await expect(page.getByLabel('jacket Stitching qa')).toContainText('Default · 6 items')

  // The floor resolves the factory v2 again.
  const resolved = await db().checklist.findFirstOrThrow({ where: { scopeKey: 'qa|stitching|jacket|' }, include: { versions: { where: { publishedAt: { not: null } }, orderBy: { number: 'desc' }, take: 1 } } })
  expect(resolved.versions[0]!.number).toBe(2)
})

/**
 * A measurement question: unit, min and max in the editor, the phone preview's
 * numeric field, and the publish diff naming the range on the added item.
 */
test('an admin adds a measurement item and the publish diff shows its range', async ({ page }) => {
  await signIn(page, 'Admin')

  await page.goto('/checklists')
  const chip = page.getByRole('link', { name: 'jacket Cutting qa' })
  await expect(chip).toContainText('5 items · v1')
  await chip.click()
  await expect(page).toHaveURL(/\/checklists\/[0-9a-f-]+$/)

  const status = page.getByRole('status')
  await expect(status).toHaveText('Saved')
  await page.getByRole('button', { name: 'Add item' }).click()
  await expect(status).toHaveText('Fill in both texts to save')
  await page.getByLabel('English').fill('Chest width')
  await page.getByLabel('Hindi').fill('छाती की चौड़ाई')
  await page.getByLabel('Kind').selectOption('measure')
  await expect(status).toHaveText('Fill in both texts to save')
  await page.getByLabel('Unit').fill('cm')
  await page.getByLabel('Min').fill('44')
  await page.getByLabel('Max').fill('46')
  await expect(status).toHaveText('Saved', { timeout: 10_000 })
  await expect(page.getByRole('list', { name: 'Items' }).getByRole('listitem')).toHaveCount(6)

  await page.getByRole('link', { name: 'Review & publish' }).click()
  await expect(page).toHaveURL(/\/publish$/)
  const added = page.getByRole('list', { name: 'Changes' }).getByRole('listitem').filter({ hasText: 'Added' })
  await expect(added).toContainText('Chest width')
  await expect(added).toContainText('44–46 cm')
})
