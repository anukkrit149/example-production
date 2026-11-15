import { inflateRawSync } from 'node:zlib'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll, type SeedResult } from '@hf/db'
import { runPieceAction } from '@hf/server'

/**
 * Minimal zip reader over the central directory, so the xlsx an operator would
 * open in WePrint can be inspected here without adding an exceljs dependency to
 * the web app (it belongs to @hf/labels).
 */
function unzipEntries(buf: Buffer): Record<string, string> {
  const eocd = buf.lastIndexOf(Buffer.from('PK\x05\x06', 'latin1'))
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out: Record<string, string> = {}
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const data = buf.subarray(dataStart, dataStart + compSize)
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8')
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const cookie = { value: 'dev:store' }
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: cookie.value }) }) }))

const list = await import('@/app/api/print-queue/route')
const exp = await import('@/app/api/print-queue/export/route')
const printed = await import('@/app/api/print-queue/[batchId]/printed/route')
const { labelInputFor, listLabels } = await import('@hf/server')

let seed: SeedResult
const photo = async () =>
  (await testPrisma.attachment.create({ data: { storageKey: `t/${crypto.randomUUID()}.jpg`, mime: 'image/jpeg', bytes: 1, takenById: seed.users.store.id } })).id
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) })

/** Activate + pass cutting QA. Leaves the piece CUT_OK with one pending cutting label. */
async function cutOk(i: number) {
  const p = seed.pieces[i]!
  await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: `a${i}`, event: { type: 'PIECE_ACTIVATED', stage: 'cutting' }, attachmentIds: [await photo()] })
  await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: `q${i}`, event: { type: 'STAGE_QA_PASSED', stage: 'cutting' }, attachmentIds: [await photo()] })
  return p
}

/** Walk a piece all the way to FINISH_OK, so it carries a 50x50 finishing label. */
async function finishOk(i: number) {
  const p = await cutOk(i)
  const worker = seed.workers[0]!
  for (const stage of ['pasting', 'stitching', 'finishing'] as const) {
    await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: `i${i}${stage}`, event: { type: 'ISSUED', stage }, workerId: worker.id, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: p.id, user: seed.users.store, idempotencyKey: `r${i}${stage}`, event: { type: 'RECEIVED', stage }, workerId: worker.id, attachmentIds: [await photo()] })
    await runPieceAction({ pieceId: p.id, user: seed.users.qa, idempotencyKey: `qa${i}${stage}`, event: { type: 'STAGE_QA_PASSED', stage }, attachmentIds: [await photo()] })
  }
  return p
}

describe('print queue', () => {
  beforeEach(async () => { await resetTestDb(); seed = await seedAll(testPrisma); process.env.DEV_AUTH = 'true'; cookie.value = 'dev:store' })

  it('lists pending cutting labels, exports csv, marks printed', async () => {
    await cutOk(0); await cutOk(1)
    let res = await list.GET(new Request('http://x/api/print-queue?stage=cutting'), params({}))
    const { labels } = await res.json()
    expect(labels).toHaveLength(2); expect(labels[0].template).toBe('t50x25')

    res = await exp.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ format: 'csv', stage: 'cutting', labelIds: labels.map((l: { id: string }) => l.id) }) }), params({}))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const batchId = res.headers.get('x-export-batch-id')!
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="labels-cutting-${batchId}.csv"`)
    const csv = await res.text()
    expect(csv.split('\r\n')[0]).toBe('QR_VALUE,STAGE_TEXT,STYLE_LINE,DETAIL_LINE,QTY_LINE,CHECK_LINE,PRINT_DATE')
    expect(csv).toContain(seed.pieces[0]!.qrToken)
    expect(csv).toContain('CUT OK')
    expect(csv).toContain('"COUNT □ SET □ QA □"')

    // The batch is stamped on the labels in the same transaction that created it.
    const batch = await testPrisma.exportBatch.findUniqueOrThrow({ where: { id: batchId } })
    expect(batch).toMatchObject({ format: 'csv', stage: 'cutting', labelCount: 2, printedAt: null })
    expect(await testPrisma.labelPrint.count({ where: { exportBatchId: batchId } })).toBe(2)

    res = await printed.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ copies: 1 }) }), params({ batchId }))
    expect(res.status).toBe(200)
    res = await list.GET(new Request('http://x/api/print-queue?stage=cutting'), params({}))
    expect((await res.json()).labels).toHaveLength(0)
    res = await printed.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ copies: 1 }) }), params({ batchId }))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('already_printed')
  })

  it('refuses to export a label of another stage', async () => {
    const p = await cutOk(2)
    const label = await testPrisma.labelPrint.findFirstOrThrow({ where: { pieceId: p.id } })
    const res = await exp.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ format: 'xlsx', stage: 'pasting', labelIds: [label.id] }) }), params({}))
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('label_mismatch')
    // Nothing was stamped: a refused export must leave the queue untouched.
    expect(await testPrisma.exportBatch.count()).toBe(0)
    expect((await testPrisma.labelPrint.findUniqueOrThrow({ where: { id: label.id } })).exportBatchId).toBeNull()
  })

  it('refuses to export a label that is already printed', async () => {
    const p = await cutOk(3)
    const label = await testPrisma.labelPrint.findFirstOrThrow({ where: { pieceId: p.id } })
    await testPrisma.labelPrint.update({ where: { id: label.id }, data: { printedAt: new Date() } })
    const res = await exp.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ format: 'csv', stage: 'cutting', labelIds: [label.id] }) }), params({}))
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('label_mismatch')
    expect(await testPrisma.exportBatch.count()).toBe(0)
  })

  it('exports a 50x50 finishing label as xlsx with the finishing stage text', async () => {
    const p = await finishOk(4)
    const [label] = await listLabels({ kind: 'stage', stage: 'finishing', status: 'pending' })
    expect(label!.template).toBe('t50x50')
    expect(labelInputFor(label!).stage).toBe('finishing')

    const res = await exp.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ format: 'xlsx', stage: 'finishing', labelIds: [label!.id] }) }), params({}))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('spreadsheetml.sheet')
    const batchId = res.headers.get('x-export-batch-id')!
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="labels-finishing-${batchId}.xlsx"`)

    // exceljs is a @hf/labels dependency, not a web one, so the workbook is
    // checked by unzipping it here rather than by adding a dependency.
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK') // it really is a zip
    const xml = unzipEntries(buf)
    expect(Object.keys(xml)).toContain('xl/worksheets/sheet1.xml')
    expect(xml['xl/workbook.xml']).toContain('name="labels"')
    const strings = xml['xl/sharedStrings.xml'] ?? ''
    const sheet = xml['xl/worksheets/sheet1.xml'] ?? ''
    const cells = [...strings.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1])
    for (const want of ['QR_VALUE', 'STAGE_TEXT', 'STYLE_LINE', 'DETAIL_LINE', 'QTY_LINE', 'CHECK_LINE', 'PRINT_DATE', p.qrToken, 'FINISH OK', 'COUNT □ SET □ QA □'])
      expect(cells.concat(sheet)).toContain(want)
  })

  it('lists printed labels with status=printed and carries the batch id', async () => {
    await cutOk(5)
    let res = await list.GET(new Request('http://x/api/print-queue?stage=cutting'), params({}))
    const { labels } = await res.json()
    res = await exp.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ format: 'csv', stage: 'cutting', labelIds: [labels[0].id] }) }), params({}))
    const batchId = res.headers.get('x-export-batch-id')!
    await printed.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ copies: 3 }) }), params({ batchId }))

    res = await list.GET(new Request('http://x/api/print-queue?stage=cutting&status=printed'), params({}))
    const printedLabels = (await res.json()).labels
    expect(printedLabels).toHaveLength(1)
    expect(printedLabels[0].exportBatchId).toBe(batchId)
    expect(printedLabels[0].printedAt).not.toBeNull()
    expect((await testPrisma.exportBatch.findUniqueOrThrow({ where: { id: batchId } })).copies).toBe(3)
  })

  it('404s on an unknown batch', async () => {
    const res = await printed.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ copies: 1 }) }), params({ batchId: crypto.randomUUID() }))
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
  })

  it('lets a supervisor list but not export or mark printed', async () => {
    await cutOk(6)
    cookie.value = 'dev:supervisor'
    let res = await list.GET(new Request('http://x/api/print-queue?stage=cutting'), params({}))
    expect(res.status).toBe(200)
    const { labels } = await res.json()
    expect(labels).toHaveLength(1)

    res = await exp.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ format: 'csv', stage: 'cutting', labelIds: [labels[0].id] }) }), params({}))
    expect(res.status).toBe(403)
    res = await printed.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ copies: 1 }) }), params({ batchId: crypto.randomUUID() }))
    expect(res.status).toBe(403)
  })

  it('refuses a qa user everywhere', async () => {
    cookie.value = 'dev:qa'
    const res = await list.GET(new Request('http://x/api/print-queue?stage=cutting'), params({}))
    expect(res.status).toBe(403)
  })

  it('listLabels maps the piece detail a WePrint row needs', async () => {
    const p = await cutOk(7)
    const rows = await listLabels({ kind: 'stage', stage: 'cutting', status: 'pending' })
    const row = rows.find((r) => r.pieceId === p.id)!
    expect(row).toMatchObject({ qrToken: p.qrToken, stage: 'cutting', template: 't50x25', styleCode: 'LJ-204', size: 'M', shade: 'BLK-02', serial: p.serial, printedAt: null, exportBatchId: null })
    expect(labelInputFor(row, '2026-09-03')).toEqual({ qrToken: p.qrToken, stage: 'cutting', styleCode: 'LJ-204', size: 'M', shade: 'BLK-02', serial: p.serial, printDate: '2026-09-03' })
  })

  it('GET ?kind=planned lists the 65 seeded planned labels', async () => {
    const res = await list.GET(new Request('http://x/api/print-queue?kind=planned'), params({}))
    expect(res.status).toBe(200)
    const { labels } = await res.json()
    expect(labels).toHaveLength(65)
    expect(labels[0].kind).toBe('planned')
    expect(labels[0].stage).toBeNull()
  })

  it('exports planned labels as csv, stamping only the two chosen ids', async () => {
    const res = await list.GET(new Request('http://x/api/print-queue?kind=planned'), params({}))
    const { labels } = await res.json()
    const ids = [labels[0].id, labels[1].id]

    const expRes = await exp.POST(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ format: 'csv', kind: 'planned', labelIds: ids }) }),
      params({}),
    )
    expect(expRes.status).toBe(200)
    const csv = await expRes.text()
    const lines = csv.split('\r\n')
    expect(lines[1]!.startsWith(labels[0].qrToken)).toBe(true)
    expect(lines[1]).toContain('PLANNED')

    // Only the two exported ids were stamped — every other planned label is
    // still pending and unclaimed.
    const stamped = await testPrisma.labelPrint.findMany({ where: { id: { in: ids } } })
    expect(stamped).toHaveLength(2)
    for (const l of stamped) expect(l.exportBatchId).not.toBeNull()

    const stillPending = await testPrisma.labelPrint.count({ where: { kind: 'planned', printedAt: null, exportBatchId: null } })
    expect(stillPending).toBe(65 - 2)
  })
})
