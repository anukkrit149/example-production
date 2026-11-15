import { expect, test } from '@playwright/test'
import {
  activatePiece,
  answerAllYes,
  connectDb,
  countEvents,
  db,
  disconnectDb,
  flipToEnglish,
  passQaStepper,
  signIn,
  takePhoto,
} from './helpers'

/**
 * The whole checkpoint app, on a phone, against a real database and real object
 * storage. Every other suite in the repo tests one layer; this one is the only
 * thing that proves the layers still fit together.
 */

test.beforeAll(connectDb)
test.afterAll(disconnectDb)

/**
 * The test that matters most.
 *
 * A single piece is walked the whole way a real one goes on the floor: cut and
 * photographed, checked, labelled, handed to a paster, taken back, checked
 * again. Each step is a different screen, a different route handler and a
 * different state transition, and the piece carries a version that every one of
 * them has to agree on. If any link in that chain breaks — a stale version, a
 * photo that never confirmed, a label that never queued — this test is where it
 * shows up, because nothing else exercises the sequence end to end.
 */
test('one piece: activate, cutting QA, blue label, issue to pasting, receive, pasting QA', async ({
  page,
}) => {
  await signIn(page, 'Store Operator')
  await flipToEnglish(page)

  // --- Activate at cutting -------------------------------------------------
  const pieceId = await activatePiece(page, {
    style: 'LJ-204',
    size: 'M',
    shade: 'BLK-02',
    lot: 'LOT-22',
  })

  // The token is minted with the seed and stays with the piece for life; every
  // label printed from here on carries it, so it is worth capturing once.
  const piece = await db().piece.findUniqueOrThrow({ where: { id: pieceId } })
  expect(piece.state).toBe('CUT_PENDING_QA')

  // --- Cutting QA, passed --------------------------------------------------
  // `activatePiece` leaves the stepper's own Done screen, not the piece page —
  // that is what shows the new state at a glance — so the next action's link
  // lives one navigation further on.
  await page.goto(`/pieces/${pieceId}`)
  await page.getByRole('link', { name: 'Next' }).click()
  await expect(page).toHaveURL(new RegExp(`/pieces/${pieceId}/do/submit_qa$`))
  await passQaStepper(page)

  // A pass lands back on the piece screen showing the new state.
  //
  // "Cut OK" matches the words printed on the blue label stuck to the piece, so
  // an operator comparing screen to sticker sees the same thing twice. The
  // state is also checked against the database below, so this assertion cannot
  // pass on a page that merely renders the right words.
  await expect(page.getByText('Scan next')).toBeVisible()
  await expect(page.getByText('Cut OK', { exact: true })).toBeVisible()
  expect((await db().piece.findUniqueOrThrow({ where: { id: pieceId } })).state).toBe('CUT_OK')

  // --- The blue cutting label is waiting to print --------------------------
  // Passing cutting QA queues the label as a side effect of the same
  // transaction; nobody asked for it separately. The queue opens on the
  // Planned tab (Task 15's white-stock labels), so the stage label lives one
  // tap over.
  await page.goto('/print-queue')
  await page.getByRole('tab', { name: 'Stage' }).click()
  const cutRow = page.getByRole('listitem').filter({ hasText: piece.qrToken })
  await expect(cutRow).toBeVisible()
  // Blue stock, and the 50x25 template that goes with cutting.
  await expect(page.getByRole('heading', { name: /CUT OK/ })).toBeVisible()
  await expect(page.getByText(/50x25 mm/)).toBeVisible()

  // The preview is the operator's check against the physical sticker, so it has
  // to render the permanent token and the PRD's detail line.
  await cutRow.getByRole('button', { name: 'Preview' }).click()
  await expect(cutRow.getByText('STYLE LJ-204')).toBeVisible()
  await expect(cutRow.getByText('M / BLK-02 / 0001')).toBeVisible()

  // --- Issue to a pasting worker -------------------------------------------
  await page.goto(`/pieces/${pieceId}`)
  await page.getByRole('link', { name: 'Next' }).click()
  await expect(page).toHaveURL(new RegExp(`/pieces/${pieceId}/do/issue$`))

  // The jacket's pasting-issue checklist is right worker, quantity, photo —
  // answering the worker item picks Paster One, the seeded paster; the picker
  // only offers workers of the trade the next stage needs, which is itself
  // part of what this proves.
  await answerAllYes(page)
  await page.getByRole('radio', { name: 'Paster One' }).click()
  await page.getByRole('button', { name: 'CONFIRM', exact: true }).click()

  await expect(page.getByText('Scan next')).toBeVisible()
  await page.goto(`/pieces/${pieceId}`)
  // Both the piece card's stage chip and the detail screen's own "Status"
  // fact now say the same state name, so this is scoped to the chip.
  await expect(page.locator('section').getByText('With pasting', { exact: true })).toBeVisible()
  // Custody moved with the event: the piece card's "With" row, which said
  // "Store room" a moment ago, now names the worker holding it.
  await expect(page.getByRole('definition').first()).toHaveText('Paster One')

  // --- Receive it back ------------------------------------------------------
  await page.getByRole('link', { name: 'Next' }).click()
  await expect(page).toHaveURL(new RegExp(`/pieces/${pieceId}/do/receive$`))
  // The worker check is the point: picking anyone but the piece's actual
  // holder is refused server-side, so picking Paster One here is the operator
  // confirming the person standing at the counter against who the piece
  // actually left with.
  await answerAllYes(page)
  await page.getByRole('radio', { name: 'Paster One' }).click()
  await page.getByRole('button', { name: 'CONFIRM', exact: true }).click()
  await expect(page.getByText('Scan next')).toBeVisible()

  // --- Pasting QA, passed ---------------------------------------------------
  await page.goto(`/pieces/${pieceId}`)
  // Both the piece card's stage chip and the detail screen's own "Status"
  // fact now say the same state name, so this is scoped to the chip.
  await expect(page.locator('section').getByText('Pasting QA due', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Next' }).click()
  await expect(page).toHaveURL(new RegExp(`/pieces/${pieceId}/do/submit_qa$`))
  await passQaStepper(page)
  await expect(page.getByText('Scan next')).toBeVisible()
  await page.goto(`/pieces/${pieceId}`)
  // Both the piece card's stage chip and the detail screen's own "Status"
  // fact now say the same state name, so this is scoped to the chip.
  await expect(page.locator('section').getByText('Paste OK', { exact: true })).toBeVisible()

  // --- The history holds every event, each with its photo -------------------
  // Direct navigation, not a click: the Next.js dev toolbar badge sits fixed
  // in the corner and happens to overlap this link at desktop viewport sizes
  // in dev mode — an artifact of the harness, not of the app.
  await page.goto(`/pieces/${pieceId}/history`)
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()

  const entries = page.getByRole('listitem')
  for (const [label, stage] of [
    ['Cutting started', 'cutting'],
    ['QA passed', 'cutting'],
    ['Label requested', 'cutting'],
    ['Handed to worker', 'pasting'],
    ['Taken back', 'pasting'],
    ['QA passed', 'pasting'],
  ] as const) {
    // Matched on the entry's own heading and its stage pill, so a cutting QA
    // pass is never mistaken for the pasting one. `hasText` on the <li> itself
    // would match the whole card's text, where "cutting" also turns up in a
    // detail line.
    await expect(
      entries
        .filter({ has: page.getByText(label, { exact: true }) })
        .filter({ has: page.getByText(stage, { exact: true }) }),
    ).toHaveCount(1)
  }

  // Five of those six carry evidence. The label request is a print instruction,
  // not something anyone photographs, so it is the one without.
  const photos = page.locator('ol img')
  await expect(photos).toHaveCount(5)
  // A rendered thumbnail means the private bucket signed a working GET url, not
  // just that an <img> tag exists.
  for (const img of await photos.all()) {
    await expect(img).toHaveJSProperty('naturalWidth', 320)
  }

  // Finally, the same story read from the log itself rather than the screen.
  const log = await db().pieceEvent.findMany({
    where: { pieceId },
    orderBy: { createdAt: 'asc' },
    select: { eventType: true, stage: true },
  })
  expect(log).toEqual([
    { eventType: 'PIECE_ACTIVATED', stage: 'cutting' },
    { eventType: 'STAGE_QA_PASSED', stage: 'cutting' },
    { eventType: 'LABEL_PRINT_REQUESTED', stage: 'cutting' },
    { eventType: 'ISSUED', stage: 'pasting' },
    { eventType: 'RECEIVED', stage: 'pasting' },
    { eventType: 'STAGE_QA_PASSED', stage: 'pasting' },
    { eventType: 'LABEL_PRINT_REQUESTED', stage: 'pasting' },
  ])
})

/**
 * A label that belongs to no piece.
 *
 * This happens for real: a sticker off another factory's box, a code typed with
 * a transposed character, a label from a piece that was cancelled. The screen
 * has to say so plainly and offer nothing — the failure mode worth preventing
 * is an operator being handed an action that would attach work to the wrong
 * piece, or worse, a blank screen they interpret as "it worked".
 */
test('unknown code shows a warning and offers no actions', async ({ page }) => {
  await signIn(page, 'Store Operator')
  await flipToEnglish(page)
  await page.goto('/scan')

  await page.getByLabel('Type the code instead').fill('HF-P-ZZZZZZZZ')
  await page.getByRole('button', { name: 'Open', exact: true }).click()

  await expect(page.getByText('No piece has this code')).toBeVisible()

  // Still on the scanner, with nothing that could act on a piece.
  await expect(page).toHaveURL(/\/scan$/)
  for (const action of ['Do the QA', 'Hand to worker', 'Take back', 'Reject piece']) {
    await expect(page.getByRole('link', { name: action })).toHaveCount(0)
    await expect(page.getByRole('button', { name: action })).toHaveCount(0)
  }
})

/**
 * The double-tap guard.
 *
 * Factory wifi is slow enough that a button which does not visibly react gets
 * tapped again within a second, every shift. If that second tap produced a
 * second STAGE_QA_PASSED the piece's history would show a check that never
 * happened and the print queue would hold two labels for one piece.
 *
 * The assertion is deliberately against `piece_events` and not against the
 * screen: a UI that renders one row while the table holds two is exactly the
 * bug this exists to catch, and no amount of looking at the page would find it.
 *
 * The tap is dispatched as two click events inside a single task, and that
 * detail is the test. A `dblclick` through Playwright's actionability checks
 * proves very little: the form's `busy` flag and the immediate `router.push`
 * between the two presses mean the second one is swallowed by the client before
 * it can become a request, so the case would pass even with every server guard
 * removed. Two clicks in one task beat the client entirely — React has not
 * re-rendered, the button is not disabled yet, and both requests genuinely go
 * out.
 *
 * What catches them is the server: `SELECT ... FOR UPDATE` on the piece row
 * serialises the two, and the optimistic version check then refuses the loser
 * with a 409 because the winner already moved the piece. That is the defence
 * that has to hold on bad wifi, where a retry routinely arrives while the first
 * request is still in flight, and deleting it fails this test.
 *
 * The status tally is asserted alongside the event count so the case cannot
 * quietly degrade into "one request was made, therefore one event exists".
 */
test('a double tap on QA Pass submits exactly one event', async ({ page }) => {
  await signIn(page, 'Store Operator')
  await flipToEnglish(page)

  const pieceId = await activatePiece(page, {
    style: 'TB-018',
    size: 'ONE',
    shade: 'TAN-01',
    lot: 'LOT-9',
  })

  await page.goto(`/pieces/${pieceId}`)
  await page.getByRole('link', { name: 'Next' }).click()
  await expect(page).toHaveURL(new RegExp(`/pieces/${pieceId}/do/submit_qa$`))
  await answerAllYes(page)

  const submits: number[] = []
  page.on('response', (res) => {
    if (res.request().method() === 'POST' && res.url().endsWith(`/api/pieces/${pieceId}/qa`)) {
      submits.push(res.status())
    }
  })

  // Two click events in one task: no re-render can intervene, so the disabled
  // attribute has not been painted yet and both handlers run. This is the tight
  // double tap the `busy` flag alone cannot stop. A QA step's summary writes
  // through Approve, not CONFIRM.
  await page.evaluate(() => {
    const confirm = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Approve',
    ) as HTMLButtonElement | undefined
    if (!confirm) throw new Error('Approve button not found')
    confirm.click()
    confirm.click()
  })

  await expect(page.getByText('Scan next')).toBeVisible()
  await expect(page.getByText('Cut OK', { exact: true })).toBeVisible()

  // The count is the whole test. One QA event, one label queued behind it,
  // however many requests the phone managed to fire.
  expect(await countEvents(pieceId, 'STAGE_QA_PASSED', 'cutting')).toBe(1)
  expect(await countEvents(pieceId, 'LABEL_PRINT_REQUESTED', 'cutting')).toBe(1)

  // Both taps really did reach the server — otherwise this case would be
  // proving nothing — and exactly one of them was allowed to win.
  expect(submits).toHaveLength(2)
  expect(submits.filter((s) => s === 200)).toHaveLength(1)
  expect(submits.filter((s) => s === 409)).toHaveLength(1)

  // The piece advanced exactly one step, not two.
  const after = await db().piece.findUniqueOrThrow({ where: { id: pieceId } })
  expect(after.state).toBe('CUT_OK')

  // The screen agrees with the table: the operator sees one pass, not a piece
  // that mysteriously advanced twice or an error where their work went through.
  await page.getByRole('link', { name: 'History' }).click()
  await expect(
    page
      .getByRole('listitem')
      .filter({ has: page.getByText('QA passed', { exact: true }) })
      .filter({ has: page.getByText('cutting', { exact: true }) }),
  ).toHaveCount(1)
})

/**
 * A pass with a check missing is not a pass.
 *
 * The stepper makes an unanswered item unreachable by construction — the
 * summary only exists once every item screen has said YES — so the rule now
 * shows up as CONFIRM staying disabled while a required field the checklist
 * doesn't otherwise cover (the leather lot) is still empty, and arming the
 * moment it is filled. NO staying live throughout is the other half: a piece
 * that fails a check must still have somewhere to go, or the operator's only
 * exit is to lie.
 */
test('QA cannot be confirmed with a required field missing, but NO always has somewhere to go', async ({ page }) => {
  await signIn(page, 'Store Operator')
  await flipToEnglish(page)

  await page.goto('/pieces/new')
  const row = page.getByRole('button', { name: /LJ-204 L · BLK-02\b/ })
  await row.click()
  await expect(row).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page).toHaveURL(/\/pieces\/[0-9a-f-]{36}\/do\/activate$/)

  // NO is live on the very first check, before anything else has been
  // answered — the exit is not gated behind ticking the rest first.
  await expect(page.getByRole('button', { name: 'NO', exact: true })).toBeEnabled()

  await answerAllYes(page)

  // On the summary, every item is already ticked (the stepper cannot reach it
  // otherwise) but CONFIRM stays disabled until the leather lot — the one
  // field this action needs beyond the checklist itself — is filled in.
  const confirm = page.getByRole('button', { name: 'CONFIRM', exact: true })
  await expect(confirm).toBeDisabled()
  await page.getByLabel('Leather lot').fill('LOT-1')
  await expect(confirm).toBeEnabled()
})

/**
 * The production front door.
 *
 * Every other case here signs in through the dev picker, which does not exist
 * on a real phone. This one walks what a factory phone actually does: an admin
 * issues a code, the operator types it into the sign-in screen, and lands on
 * the scanner as themselves. The identity matters beyond the login — it is the
 * name written into every event that operator creates afterwards.
 */
test('an operator signs in with a code issued by an admin', async ({ page }) => {
  // Issuing a code is an admin action, so it is done as one — through the same
  // route the admin screen calls, not by writing a hash into the table.
  // `page.request` and not the `request` fixture: the fixture carries no
  // cookies, so it would reach the route unauthenticated.
  await signIn(page, 'Admin')

  const qaUser = await db().user.findFirstOrThrow({ where: { authIdentity: 'dev:qa' } })
  const issued = await page.request.post('/api/admin/operator-codes', { data: { userId: qaUser.id } })
  expect(issued.ok()).toBe(true)
  const { code } = (await issued.json()) as { code: string }
  // Two groups of four, from the no-0-no-1 alphabet: what fits on a paper slip.
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)

  // A fresh phone: no dev cookie, no session.
  await page.context().clearCookies()
  await page.goto('/scan')
  await expect(page).toHaveURL(/\/signin$/)

  await page.getByLabel('Your code').fill(code)
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Signed in as the person the code belongs to, not as whoever issued it.
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByText('QA Checker')).toBeVisible()

  // The session is a row, not a claim in the cookie — that is what makes a
  // revoke at the admin screen log the phone out on its next tap.
  expect(await db().operatorSession.count({ where: { userId: qaUser.id } })).toBe(1)

  // A wrong code is refused with the same wording as every other failure, so
  // nothing about it tells a guesser which half they got right.
  await page.context().clearCookies()
  await page.goto('/signin')
  await page.getByLabel('Your code').fill('AAAA-BBBB')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('That code did not work')).toBeVisible()
  await expect(page).toHaveURL(/\/signin$/)
})

/**
 * The door the floor actually uses.
 *
 * An operator who cannot type an eight-character code holds up their ID card
 * instead: the phone's camera opens the URL in the QR and the session is theirs
 * before they touch the screen. This walks the whole of it — an admin issues
 * cards on the admin screen, the token is read off the printable card exactly
 * as the printer would lay it down, and a fresh phone opens the URL a camera
 * would have opened.
 *
 * `page.goto` stands in for the camera, and only for the camera. Everything on
 * either side of it is the real path: the real issue route, the real card, the
 * real landing screen, the real session row.
 */
test('an operator signs in by opening the QR on their ID card', async ({ page }) => {
  await signIn(page, 'Admin')

  const qaUser = await db().user.findFirstOrThrow({ where: { authIdentity: 'dev:qa' } })
  const before = await db().operatorSession.count({ where: { userId: qaUser.id } })

  await page.goto('/admin/operators')
  // ID card is what this screen offers first, because it is what the floor now
  // uses; the typed code is the fallback beside it.
  await expect(page.getByRole('radio', { name: 'ID card' })).toHaveAttribute('aria-checked', 'true')
  // The list is ticked, not chosen from a dropdown: kitting out a shift is the
  // normal job, and one card is just the smallest batch of it.
  await page.getByRole('checkbox', { name: /QA Checker · qa/ }).check()
  await page.getByRole('button', { name: /^Issue 1 ID card$/ }).click()

  await expect(page.getByRole('heading', { name: '1 ID card' })).toBeVisible()
  await expect(page.getByRole('img', { name: /ID card for QA Checker/ })).toBeVisible()

  // Every card points at the address this very request came in on, not at a
  // value baked into the bundle at build time.
  await expect(page.getByText(/Every card points at http:\/\/localhost:3050/)).toBeVisible()

  // The token, read off the card the way the printer lays it down.
  const token = (await page.getByText(/^HF-W-[A-Z2-9]{24}$/).innerText()).trim()

  // A fresh phone: no dev cookie, no session. Then the card.
  await page.context().clearCookies()
  await page.goto(`/badge#${token}`)

  // No tap anywhere: the screen signs itself in and moves on.
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByText('QA Checker')).toBeVisible()
  // The session is a row, not a claim in the cookie — which is what makes
  // revoking the card at the admin screen log the phone out on its next tap.
  expect(await db().operatorSession.count({ where: { userId: qaUser.id } })).toBe(before + 1)

  // A card that means nothing says so, in the language of the person holding
  // it, and offers the typed code as the way out rather than a dead end.
  await page.context().clearCookies()
  await page.goto(`/badge#HF-W-${'A'.repeat(24)}`)
  await expect(page.getByText('कार्ड नहीं चला')).toBeVisible()
  await expect(page.getByRole('link', { name: /Type a code instead/ })).toBeVisible()

  // And a link with the fragment stripped — by a reader that dropped it, or by
  // someone sharing what was in the address bar — is a dead end that says so
  // rather than an error about a card.
  await page.goto('/badge')
  await expect(page.getByText(/This link is incomplete/)).toBeVisible()
})

/**
 * Writing a piece off, and cutting its replacement.
 *
 * A rejection is the only action in the app that destroys value, and the
 * replacement is what keeps the order whole: the line item still owes the buyer
 * the same count, so a new PLANNED piece has to appear on it with its own
 * token. A replacement that reused the rejected piece's token would put two
 * different physical objects behind one label, which is the single worst thing
 * this system could do.
 *
 * Two people, as on the floor. Cutting is store-only and rejecting is
 * qa-or-supervisor, deliberately: a store operator who finds a bad piece cannot
 * quietly write off their own work, so the phone changes hands. Signing in
 * twice here is not test scaffolding, it is the control being exercised.
 */
test('a rejected piece with a replacement adds a new planned piece with a different token', async ({
  page,
}) => {
  await signIn(page, 'Store Operator')
  await flipToEnglish(page)

  const pieceId = await activatePiece(page, {
    style: 'TB-018',
    size: 'ONE',
    shade: 'TAN-01',
    lot: 'LOT-77',
  })

  // The phone changes hands. The reject screen is offered to anyone the state
  // machine allows it for — the role check lives on the route handler, which is
  // where it has to be — so this is a genuine change of operator, not a
  // shortcut around a hidden button.
  await signIn(page, 'QA Checker')

  const rejected = await db().piece.findUniqueOrThrow({ where: { id: pieceId } })
  const lineItemId = rejected.lineItemId
  const before = await db().piece.count({ where: { lineItemId } })

  await page.goto(`/pieces/${pieceId}`)
  // Reject is not the piece's primary next step (submit_qa is), so it sits
  // under the "More" disclosure alongside every other secondary action.
  await page.getByText('More', { exact: true }).click()
  await page.getByRole('link', { name: 'Reject piece' }).click()

  await page.getByRole('radio', { name: 'Leather flaw' }).click()
  await page.getByLabel(/^Note/).fill('Hide scarred across the front panel')
  await takePhoto(page)
  await page.getByRole('switch', { name: /Cut a replacement/ }).click()
  await page.getByRole('button', { name: 'Reject and cut a replacement' }).click()

  // The new token is the one thing the operator carries away from this screen,
  // so it gets its own panel rather than vanishing into a redirect.
  await expect(page.getByRole('heading', { name: 'Piece rejected' })).toBeVisible()
  await expect(page.getByText('Replacement to cut')).toBeVisible()

  const replacement = await db().piece.findFirstOrThrow({
    where: { lineItemId, state: 'PLANNED' },
    orderBy: { serial: 'desc' },
  })
  await expect(page.getByText(replacement.qrToken)).toBeVisible()

  // Same line item, one more piece, a serial past every existing one, and a
  // token that is emphatically not the rejected piece's.
  expect(await db().piece.count({ where: { lineItemId } })).toBe(before + 1)
  expect(replacement.serial).toBeGreaterThan(rejected.serial)
  expect(replacement.qrToken).not.toBe(rejected.qrToken)
  expect(replacement.qrToken).toMatch(/^HF-P-[A-Z2-9]{8}$/)
  expect(replacement.state).toBe('PLANNED')

  // The rejected piece is written off, and the lineage row is what ties the two
  // together for anyone asking later why the count moved.
  expect((await db().piece.findUniqueOrThrow({ where: { id: pieceId } })).state).toBe('REJECTED')
  const lineage = await db().pieceLineage.findUniqueOrThrow({
    where: { rejectedPieceId: pieceId },
  })
  expect(lineage.replacementPieceId).toBe(replacement.id)
  expect(lineage.reason).toBe('leather_flaw')

  // The replacement is genuinely cuttable: it shows up on the activation list.
  await page.getByRole('link', { name: 'Done' }).click()
  await page.goto('/pieces/new')
  await expect(page.getByRole('button', { name: /TB-018 ONE · TAN-01\b/ })).toBeVisible()
})
