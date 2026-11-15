import { expect, type Page } from '@playwright/test'
import type { PrismaClient } from '@hf/db'
import { resolve } from 'node:path'

/** The photo every step that needs evidence uploads. A real 320x240 JPEG, 21 KB. */
export const PHOTO = resolve(__dirname, 'fixtures/photo.jpg')

/**
 * A direct line to the same database the app is writing to.
 *
 * The double-tap case has to count events, and counting them through the
 * history screen would only prove the screen renders one row — the bug it
 * guards against is a second row in `piece_events`, which is invisible to any
 * assertion made against the UI. So this reads the table itself.
 *
 * It is deliberately a separate client from the app's: the dev server has its
 * own process and its own pool, and sharing one would make the test's reads
 * depend on the server's transaction state.
 *
 * The import is dynamic because it has to be. `@hf/db` is an ES module and
 * Playwright compiles these specs to CommonJS (apps/web is not a module
 * package), so a top-level `import` of it becomes a `require` that throws at
 * load time. Only the type is imported statically, which erases.
 *
 * `connectDb` runs once in a `beforeAll` so `db()` itself can stay synchronous;
 * an awaited accessor at every call site would bury the assertions.
 */
let client: PrismaClient | undefined

export async function connectDb(): Promise<void> {
  if (client) return
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required to run the end-to-end suite')
  if (/neon\.tech/i.test(url)) throw new Error('refusing to run the e2e suite against Neon')
  const { makePrismaClient } = (await import('@hf/db')) as typeof import('@hf/db')
  client = makePrismaClient(url)
}

export async function disconnectDb(): Promise<void> {
  await client?.$disconnect()
  client = undefined
}

export function db(): PrismaClient {
  if (!client) throw new Error('connectDb() must run before db() — add it to a beforeAll hook')
  return client
}

/**
 * Sign in through the development picker.
 *
 * The production door is the operator code screen, and one test walks it. Every
 * other case is about what happens AFTER someone is on the floor, and paying
 * for a code issue plus a keypad entry in each of them would buy nothing but
 * runtime. `/dev-login` only exists while DEV_AUTH is true, which the config sets.
 */
export async function signIn(page: Page, name: string): Promise<void> {
  await page.goto('/dev-login')
  await page.getByRole('button', { name: new RegExp(`^${name}\\b`, 'i') }).click()
  await expect(page).toHaveURL(/\/home$/)
}

/**
 * Attach a photo and wait for it to actually land.
 *
 * `setInputFiles` returns as soon as the file is handed to the input; the
 * component then resizes it on a canvas, presigns, PUTs to MinIO and confirms.
 * Submitting before that finishes sends an empty `attachmentIds` and the server
 * refuses the step — so the wait is on the button's own text, which flips to
 * "Retake" only once an attachment id has come back. That is the app telling
 * us it is ready, not a guess about how long the round trip takes.
 */
export async function takePhoto(page: Page): Promise<void> {
  await page.locator('input[type=file]').setInputFiles(PHOTO)
  await expect(page.getByRole('button', { name: 'Retake', exact: true })).toBeVisible({
    timeout: 30_000,
  })
  // The count line is written after `onChange` has handed the id up to the
  // form, which is the state the submit button actually gates on.
  await expect(page.getByText(/^Photo taken \(1\)$/)).toBeVisible()
}

/**
 * Flip the phone to English. Hindi is the default every screen renders in, so
 * `cutting-slice.spec.ts` — which asserts against the English copy — has to
 * opt out explicitly, the same tap a bilingual operator would make. The
 * choice lives in localStorage, so one flip holds for the rest of the test.
 */
export async function flipToEnglish(page: Page): Promise<void> {
  const en = page.getByRole('button', { name: 'EN', exact: true })
  await en.click()
  await expect(en).toHaveAttribute('aria-pressed', 'true')
}

/**
 * Answer every item screen of a checklist stepper, in order, landing on the
 * summary. A photo item gets a photo first — the YES button stays disabled
 * until one is attached, same as every other required field on this screen.
 * A measure item gets `45` typed into its numeric field and taps **Next**
 * instead of YES/NO.
 *
 * There is no way to ask the DOM "how many items are left" without coupling
 * to the step indicator's own text, so this walks until the summary heading
 * appears rather than counting in advance — the same thing an operator does.
 */
export async function answerAllYes(page: Page): Promise<void> {
  // A QA stepper's summary is headed "All questions"; every other action's is
  // "Check everything, then confirm" — either one means every item is answered.
  const summary = page.getByRole('heading', { name: 'Check everything, then confirm' })
  const qaSummary = page.getByRole('heading', { name: 'All questions' })
  while (!(await summary.isVisible()) && !(await qaSummary.isVisible())) {
    const numberInput = page.locator('input[type=number]')
    if (await numberInput.count()) {
      await numberInput.fill('45')
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      continue
    }
    const fileInput = page.locator('input[type=file]')
    // Only attach a photo when the item wants one and does not already have
    // one — the item screen's own PhotoCapture, not the one-shot check the
    // old `takePhoto` helper used to wait on.
    if ((await fileInput.count()) && !(await page.getByText(/^Photo taken \(1\)$/).isVisible())) {
      await fileInput.setInputFiles(PHOTO)
      await expect(page.getByText(/^Photo taken \(1\)$/)).toBeVisible()
    }
    await page.getByRole('button', { name: 'YES', exact: true }).click()
  }
}

/**
 * The summary's one write button, whichever this action shows: **Approve**
 * for a QA step, **CONFIRM** for everything else. Picking by visibility keeps
 * every non-QA caller unchanged.
 */
export async function finishStep(page: Page): Promise<void> {
  const approve = page.getByRole('button', { name: 'Approve', exact: true })
  if (await approve.isVisible()) {
    await approve.click()
    return
  }
  await page.getByRole('button', { name: 'CONFIRM', exact: true }).click()
}

/**
 * Activate the lowest planned piece on a line item and land on its QA screen.
 *
 * Both activation and cutting QA are the same stepper now, so this walks the
 * activate checklist, fills the lot on its summary and confirms — the
 * gate's own record on `PIECE_ACTIVATED` is what proves the checklist was
 * really answered, not just skipped past.
 *
 * Returns the piece id, which every later assertion is keyed on: the token is
 * generated at activation and the tests must never assume which seeded row they
 * were handed.
 */
export async function activatePiece(
  page: Page,
  opts: { style: string; size: string; shade: string; lot: string },
): Promise<string> {
  await page.goto('/pieces/new')
  // The row's accessible name flattens to one line: style, then size · shade,
  // then the order and the cut count. Matching both halves is what keeps the
  // two LJ-204 rows (M and L) apart.
  const row = page.getByRole('button', {
    name: new RegExp(`${opts.style} ${opts.size} · ${opts.shade}\\b`),
  })
  await row.click()
  // Confirmed rather than assumed. A click that lands before the screen is
  // interactive leaves the form unarmed, and the failure would otherwise
  // surface several steps later as a mysteriously disabled submit button.
  await expect(row).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  await expect(page).toHaveURL(/\/pieces\/[0-9a-f-]{36}\/do\/activate$/)
  const pieceId = pieceIdFromUrl(page.url())

  await answerAllYes(page)
  await page.getByLabel('Leather lot').fill(opts.lot)
  await page.getByRole('button', { name: 'CONFIRM', exact: true }).click()

  await expect(page.getByText('Cutting QA due', { exact: true })).toBeVisible()
  return pieceId
}

/** Walk a QA stepper (already on `/pieces/[id]/do/submit_qa`) to its summary and approve. */
export async function passQaStepper(page: Page): Promise<void> {
  await answerAllYes(page)
  await finishStep(page)
}

export function pieceIdFromUrl(url: string): string {
  const m = /\/pieces\/([0-9a-f-]{36})/.exec(url)
  if (!m) throw new Error(`no piece id in url: ${url}`)
  return m[1]
}

/** How many events of one type this piece has, straight from the append-only log. */
export async function countEvents(pieceId: string, eventType: string, stage?: string) {
  return db().pieceEvent.count({
    where: { pieceId, eventType: eventType as never, ...(stage ? { stage: stage as never } : {}) },
  })
}

/**
 * The token of the lowest-serial PLANNED jacket piece still in the seeded
 * pool.
 *
 * Every checklist case in `floor-checklist.spec.ts` is written against the
 * jacket default checklist specifically (4 items to activate, checklistNumber
 * 1, "कदम 1 / 4") — a category pin, not just "any planned piece", is what
 * keeps those counts true regardless of which style a bag or belt case
 * elsewhere in the suite has already consumed. `lineItemId` is a random uuid,
 * so ordering by it would not even reliably prefer one style over another;
 * filtering by category and ordering by `serial` is what actually gives each
 * call the next untouched jacket piece.
 */
export async function plannedToken(): Promise<string> {
  const piece = await db().piece.findFirstOrThrow({
    where: { state: 'PLANNED', lineItem: { style: { category: 'jacket' } } },
    orderBy: [{ serial: 'asc' }, { lineItemId: 'asc' }],
  })
  return piece.qrToken
}

/** The id of the piece a QR token belongs to. */
export async function pieceIdFor(token: string): Promise<string> {
  const piece = await db().piece.findUniqueOrThrow({ where: { qrToken: token } })
  return piece.id
}
