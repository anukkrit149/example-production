import { expect, test } from '@playwright/test'
import { connectDb, db, disconnectDb, signIn } from './helpers'

test.beforeAll(connectDb)
test.afterAll(disconnectDb)

/**
 * Cuts one seeded PLANNED piece through to `CUT_OK` — the same write path every
 * route uses (`runPieceAction`), never a direct insert into `piece_events`.
 *
 * `PIECE_ACTIVATED` alone only reaches `CUT_PENDING_QA` (see `transition` in
 * `packages/domain/src/piece-state.ts`); `labelStageFor` fires a label-print
 * request only once a stage's QA passes and the piece lands on `CUT_OK` /
 * `PASTE_OK` / etc. So "a cut" here is activation *and* its QA pass — two
 * `runPieceAction` calls, three events (activation, QA pass, label print) —
 * matching `mobile.spec.ts`'s own `packOnePiece` pattern for the same stage.
 * Of those three, only the label print is hidden from the feed by default
 * (D5): activation and the QA pass both show.
 *
 * Takes the seed piece at `index` so this suite and `mobile.spec.ts`'s own
 * `packOnePiece` (which claims `seed.pieces[0]`) never race for the same row —
 * this suite's cases run first (desktop, alphabetically before `mobile.spec.ts`'s
 * phone project, and this whole run is serial — `workers: 1`), but staying out
 * of index 0 keeps that independent of run order.
 */
async function cutPiece(pieceId: string, keyPrefix: string): Promise<{ pieceId: string; serial: number }> {
  const { runPieceAction } = (await import('@hf/server')) as typeof import('@hf/server')
  const seed = await seedDb()
  const piece = await db().piece.findUniqueOrThrow({ where: { id: pieceId } })
  const photo = async () =>
    (
      await db().attachment.create({
        data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id },
      })
    ).id
  await runPieceAction({
    pieceId: piece.id,
    user: seed.users.store,
    idempotencyKey: `${keyPrefix}-${piece.id}-act`,
    event: { type: 'PIECE_ACTIVATED', stage: 'cutting' },
    attachmentIds: [await photo()],
  })
  await runPieceAction({
    pieceId: piece.id,
    user: seed.users.qa,
    idempotencyKey: `${keyPrefix}-${piece.id}-qa`,
    event: { type: 'STAGE_QA_PASSED', stage: 'cutting' },
    attachmentIds: [await photo()],
  })
  return { pieceId: piece.id, serial: piece.serial }
}

/** `seedAll` is idempotent — every case calls it just to get the already-seeded rows back. */
async function seedDb() {
  const { seedAll } = (await import('@hf/db')) as typeof import('@hf/db')
  return seedAll(db())
}

/**
 * react-day-picker (v10) labels every day button with `date-fns`'s `"PPPP"`
 * format — `"Thursday, September 3rd, 2026"` — via its `labelDayButton`
 * default (see `labels/labelDayButton.js`), optionally prefixed `"Today, "` and
 * suffixed `", selected"`. Reproduced here rather than imported from
 * `date-fns` so the test states the exact string it expects rather than
 * trusting a second call to the same formatter to agree with the app's.
 */
function dayButtonName(year: number, month: number, day: number): string {
  const dow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const mon = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const ordinal = (n: number) => {
    if (n % 10 === 1 && n % 100 !== 11) return `${n}st`
    if (n % 10 === 2 && n % 100 !== 12) return `${n}nd`
    if (n % 10 === 3 && n % 100 !== 13) return `${n}rd`
    return `${n}th`
  }
  const d = new Date(year, month - 1, day)
  return `${dow[d.getDay()]}, ${mon[month - 1]} ${ordinal(day)}, ${year}`
}

test('the office reads the factory pulse', async ({ page }) => {
  const seed = await seedDb()
  // Jacket M, serial 2 (index 1) — clear of `mobile.spec.ts`'s `pieces[0]`
  // (jacket M serial 1). A known event before the feed is asserted on: the
  // first row must name it.
  const cut = await cutPiece(seed.pieces[1]!.id, 'overview-pulse')

  await signIn(page, 'Management') // lands on /overview now
  await expect(page).toHaveURL(/\/overview$/)
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

  const todayTab = page.getByRole('tab', { name: 'Today' })
  await expect(todayTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('img', { name: 'Throughput per hour' })).toBeVisible()

  await page.getByRole('tab', { name: 'Last 7 days' }).click()
  await expect(page).toHaveURL(/period=7d/)
  await expect(page.getByRole('tab', { name: 'Last 7 days' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'Last 7 days' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Throughput per day' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Orders at risk' })).toContainText('PO-4471')

  // Pick a day through the Popover + Calendar (D3): a day strictly before
  // today and strictly before the "now" the whole suite runs against, so the
  // picker's `disabled: { after: today }` ceiling never blocks the click.
  // Derived from the clock rather than hardcoded — from October onward the
  // calendar opens on the current month and a hardcoded September cell would
  // not exist. Kolkata is UTC+5:30; shifting the epoch by that offset before
  // reading UTC parts gives Kolkata's wall-clock date without a timezone
  // library, matching how the server resolves "today" (D-something above).
  const nowKolkata = new Date(Date.now() + 330 * 60_000)
  const targetKolkata = new Date(nowKolkata.getTime() - 2 * 24 * 60 * 60 * 1000)
  const targetYear = targetKolkata.getUTCFullYear()
  const targetMonth = targetKolkata.getUTCMonth() + 1 // 1-12
  const targetDay = targetKolkata.getUTCDate()
  // Whether "two days ago" fell in the month before the one the calendar
  // opens on (this month) — true only on the 1st or 2nd of a month.
  const crossedIntoPrevMonth = targetDay > nowKolkata.getUTCDate()

  await page.getByRole('button', { name: 'Pick a day' }).click()
  if (crossedIntoPrevMonth) {
    // react-day-picker's default previous-month nav button.
    await page.getByRole('button', { name: 'Go to the Previous Month' }).click()
  }
  const dayCell = page.getByRole('button', { name: dayButtonName(targetYear, targetMonth, targetDay) })
  await expect(dayCell).toBeVisible()
  await dayCell.click()
  const targetDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`
  await expect(page).toHaveURL(new RegExp(`date=${targetDate}`))
  // A chosen day renders as a fourth tab, named by `OverviewPeriod.label`
  // (`dayLabel`, e.g. "Thu 3 Sep") — the tab bar's own contract for "which
  // period is active" now includes a day that isn't Today/This week/Last 7 days.
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(targetYear, targetMonth - 1, targetDay).getDay()]
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][targetMonth - 1]
  const dayTab = page.getByRole('tab', { name: `${dow} ${targetDay} ${mon}` })
  await expect(dayTab).toBeVisible()
  await expect(dayTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('img', { name: 'Throughput per hour' })).toBeVisible()

  // Back to Today, where the cut above is inside the window and shows in the feed.
  await page.getByRole('tab', { name: 'Today' }).click()
  await expect(page).toHaveURL(/period=today/)

  const feedRegion = page.getByRole('region', { name: 'Activity' })
  await expect(feedRegion.getByRole('heading', { name: 'Activity' })).toBeVisible()
  // Two `aria-label="Activity"` elements exist on this page (D5's `<section>`
  // and its `<table>`) — the role disambiguates them.
  const feedTable = page.getByRole('table', { name: 'Activity' })
  const rows = feedTable.getByRole('row')
  // Header row + at least one data row.
  await expect(rows.nth(1)).toBeVisible()

  // Newest first, and label prints are hidden by default (D5): the QA pass
  // `cutPiece` wrote is the newest *visible* event, so it is the top row —
  // not the label print it triggered underneath.
  const firstDataRow = feedTable.locator('tbody tr').first()
  await expect(firstDataRow).toContainText('Stage QA passed')
  const pieceLink = firstDataRow.getByRole('link')
  await expect(pieceLink).toHaveAttribute('href', `/pieces/${cut.pieceId}`)
  await expect(firstDataRow).toContainText(String(cut.serial).padStart(4, '0'))

  // The label print is there, just hidden — the toggle (D5) reveals it.
  await expect(feedTable).not.toContainText('Label print requested')
  await page.getByRole('link', { name: 'Show label prints' }).click()
  await expect(page).toHaveURL(/labels=1/)
  const feedTableWithLabels = page.getByRole('table', { name: 'Activity' })
  await expect(feedTableWithLabels.locator('tbody tr').first()).toContainText('Label print requested')
  await page.getByRole('link', { name: 'Hide label prints' }).click()
  await expect(page).not.toHaveURL(/labels=1/)

  // Filter by event type narrows the rows through the shadcn combobox: every
  // visible data row reads "Piece activated" and nothing else appears (the
  // label print and the QA pass, both also created by the cut above, are no
  // longer shown — naming an event type wins over the default hide, per D5).
  await page.getByRole('combobox', { name: 'Event' }).click()
  await page.getByRole('option', { name: 'Piece activated' }).click()
  await expect(page).toHaveURL(/eventType=PIECE_ACTIVATED/)
  const filteredTable = page.getByRole('table', { name: 'Activity' })
  const filteredRows = filteredTable.locator('tbody tr')
  // `.count()` does not wait for the server-rendered page behind the new URL
  // to settle — a client navigation here re-renders the whole route, and a
  // bare count can snapshot mid-flight against the loading skeleton. Wait for
  // a real row first so the count that follows reflects the filtered page.
  await expect(filteredRows.first()).toBeVisible()
  const filteredCount = await filteredRows.count()
  expect(filteredCount).toBeGreaterThan(0)
  for (let i = 0; i < filteredCount; i++) await expect(filteredRows.nth(i)).toContainText('Piece activated')
})

test('the activity feed pages through more than fifty events with Load more', async ({ page }) => {
  const { runPieceAction } = (await import('@hf/server')) as typeof import('@hf/server')
  const seed = await seedDb()

  /**
   * With label prints hidden by default (D5), each cut shows only 2 of its 3
   * events (activation + QA pass; the label print stays hidden) — so clearing
   * the 50-row page needs a lot more than the 18 cuts the pre-shadcn version
   * used. Cutting 45 pieces (90 visible rows) reaches a "Load more" in a
   * single click without turning label prints on, and stays under
   * `ACTIVITY_MAX_LIMIT` (100) alongside the visible events the rest of the
   * suite writes before this test: `dashboard.spec.ts` (which runs first)
   * activates and QA-passes one piece (2) and cancels one more (1, a
   * `PIECE_CANCELLED`), and the earlier test in this file cuts one (2) — 5
   * rows, plus these 90, is 95.
   *
   * The 45 span two line items rather than one: jacket M's remaining pieces
   * (serials 3-20, 18 pieces — serial 1 is `mobile.spec.ts`'s `pieces[0]` and
   * serial 2 is the earlier test's cut) plus 27 of the bag line item's 30
   * pieces. Jacket M and jacket L share a style code (`LJ-204`) and both
   * restart their serials at 1, so a batch spanning them would print
   * identical "serial + style" text for two different pieces and — because
   * `formatKolkata`'s `timeStyle: 'short'` only has minute resolution, so two
   * events written moments apart in the same test can render an identical time
   * too — break the row-identity check below on rendered text alone. The bag
   * line item is a different style (`TB-018`), so it can never collide with a
   * jacket-M row regardless of serial number; jacket L is avoided entirely.
   */
  const jacketM = seed.lineItems.find((li) => li.size === 'M')!
  const bag = seed.lineItems.find((li) => li.size === 'ONE')!
  const jacketMPlanned = await db().piece.findMany({
    where: { lineItemId: jacketM.id, state: 'PLANNED', serial: { gte: 3 } },
    select: { id: true },
  })
  const bagPlanned = await db().piece.findMany({
    where: { lineItemId: bag.id, state: 'PLANNED', serial: { lte: 27 } },
    select: { id: true },
  })
  expect(jacketMPlanned.length, 'expected untouched PLANNED jacket-M seed pieces to cut for this test').toBe(18)
  expect(bagPlanned.length, 'expected 27 untouched PLANNED bag seed pieces to cut for this test').toBe(27)

  for (const p of [...jacketMPlanned, ...bagPlanned]) {
    const photo = async () =>
      (
        await db().attachment.create({
          data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id },
        })
      ).id
    await runPieceAction({
      pieceId: p.id,
      user: seed.users.store,
      idempotencyKey: `overview-loadmore-${p.id}-act`,
      event: { type: 'PIECE_ACTIVATED', stage: 'cutting' },
      attachmentIds: [await photo()],
    })
    await runPieceAction({
      pieceId: p.id,
      user: seed.users.qa,
      idempotencyKey: `overview-loadmore-${p.id}-qa`,
      event: { type: 'STAGE_QA_PASSED', stage: 'cutting' },
      attachmentIds: [await photo()],
    })
  }

  const totalVisible = await db().pieceEvent.count({
    where: { eventType: { notIn: ['LABEL_PRINT_REQUESTED', 'LABEL_REPRINT_REQUESTED'] } },
  })
  expect(totalVisible).toBeGreaterThan(50)
  expect(totalVisible).toBeLessThanOrEqual(100)

  await signIn(page, 'Management')
  await expect(page).toHaveURL(/\/overview$/)

  const feedTable = page.getByRole('table', { name: 'Activity' })
  const firstPageRows = feedTable.locator('tbody tr')
  await expect(firstPageRows).toHaveCount(50)

  const firstPageKeys = await firstPageRows.evaluateAll((trs) =>
    trs.map((tr) => tr.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
  )

  // "Load more" is a link to the next page's URL (`?before=<cursor>`), not a
  // client-side append — the feed is a server component. Following it replaces
  // the view with the next (older) page rather than growing the first one.
  const loadMore = page.getByRole('link', { name: 'Load more' })
  await expect(loadMore).toBeVisible()
  await loadMore.click()
  await expect(page).toHaveURL(/before=/)

  const secondPageRows = page.getByRole('table', { name: 'Activity' }).locator('tbody tr')
  const remaining = totalVisible - firstPageKeys.length
  await expect(secondPageRows).toHaveCount(Math.min(50, remaining))

  const secondPageKeys = await secondPageRows.evaluateAll((trs) =>
    trs.map((tr) => tr.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
  )
  // No duplicates across the two pages, and together they account for every event.
  const combined = [...firstPageKeys, ...secondPageKeys]
  expect(new Set(combined).size).toBe(combined.length)
  expect(combined.length).toBe(Math.min(totalVisible, 100))
})
