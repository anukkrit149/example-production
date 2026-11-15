import { prisma, Prisma, type Stage, type User } from '@hf/db'
import { labelInputFrom, labelRow, toCsv, toXlsx, type LabelInput } from '@hf/labels'
import { ApiError } from './api'

export type LabelKind = 'planned' | 'stage'

/** One row of a print queue: a requested label plus the piece detail a WePrint row needs. */
export type PendingLabel = {
  id: string
  pieceId: string
  qrToken: string
  kind: LabelKind
  stage: Stage | null
  template: string
  styleCode: string
  size: string
  shade: string
  serial: number
  requestedAt: string
  reprintReason: string | null
  exportBatchId: string | null
  printedAt: string | null
}

export type LabelFilter = {
  kind?: LabelKind
  stage?: Stage
  status: 'pending' | 'printed'
  ids?: string[]
  lineItemId?: string
  orderId?: string
  batchId?: string
}

const include = { piece: { include: { lineItem: { include: { style: true } } } } } as const

function whereFor(f: LabelFilter): Prisma.LabelPrintWhereInput {
  return {
    ...(f.kind ? { kind: f.kind } : {}),
    ...(f.stage ? { stage: f.stage } : {}),
    printedAt: f.status === 'pending' ? null : { not: null },
    // 'pending' means still available to export: not yet claimed by a batch.
    // A batchId filter (looking inside one batch) overrides that — its rows
    // are stamped by definition.
    ...(f.status === 'pending' && !f.batchId ? { exportBatchId: null } : {}),
    ...(f.ids ? { id: { in: f.ids } } : {}),
    ...(f.lineItemId ? { piece: { lineItemId: f.lineItemId } } : {}),
    ...(f.orderId ? { piece: { lineItem: { orderId: f.orderId } } } : {}),
    ...(f.batchId ? { exportBatchId: f.batchId } : {}),
  }
}

type Row = Prisma.LabelPrintGetPayload<{ include: typeof include }>
const toPending = (l: Row): PendingLabel => ({
  id: l.id, pieceId: l.pieceId, qrToken: l.piece.qrToken, kind: l.kind, stage: l.stage, template: l.template,
  styleCode: l.piece.lineItem.style.styleCode, size: l.piece.lineItem.size, shade: l.piece.lineItem.shade, serial: l.piece.serial,
  requestedAt: l.requestedAt.toISOString(), reprintReason: l.reprintReason, exportBatchId: l.exportBatchId,
  printedAt: l.printedAt?.toISOString() ?? null,
})

/**
 * The single read path for label rows. The export path relies on the filter
 * being applied in SQL: it asks for exactly the ids it was given, of the kind
 * and stage it was given, still pending, and refuses when fewer rows come
 * back. That is what stops a label of the wrong stage, or one already
 * printed, from reaching a sticker.
 */
export async function listLabels(f: LabelFilter): Promise<PendingLabel[]> {
  const rows = await prisma.labelPrint.findMany({
    where: whereFor(f),
    orderBy: [{ piece: { lineItem: { order: { orderNumber: 'asc' } } } }, { piece: { lineItemId: 'asc' } }, { piece: { serial: 'asc' } }],
    include,
  })
  return rows.map(toPending)
}

/** Queue row → label content. Delegates to the pure `@hf/labels` mapping so the client screen can use the same logic without importing this Prisma-backed module. */
export function labelInputFor(l: PendingLabel, printDate = new Date().toISOString().slice(0, 10)): LabelInput {
  return labelInputFrom(l, printDate)
}

/** Called inside the transaction that creates pieces. One planned label per new piece. */
export async function requestPlannedLabels(tx: Prisma.TransactionClient, pieceIds: string[], userId: string): Promise<void> {
  if (pieceIds.length === 0) return
  await tx.labelPrint.createMany({ data: pieceIds.map((pieceId) => ({ pieceId, kind: 'planned', stage: null, template: 't50x25', requestedById: userId })) })
}

/** Called inside the transaction that cancels planned pieces. A printed label is history and stays. */
export async function voidUnprintedPlannedLabels(tx: Prisma.TransactionClient, pieceIds: string[]): Promise<number> {
  if (pieceIds.length === 0) return 0
  const r = await tx.labelPrint.deleteMany({ where: { pieceId: { in: pieceIds }, kind: 'planned', printedAt: null, exportBatchId: null } })
  return r.count
}

const CONTENT_TYPE = { csv: 'text/csv; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as const

export type ExportArgs = {
  kind: LabelKind
  stage?: Stage
  format: 'csv' | 'xlsx'
  labelIds?: string[]
  lineItemId?: string
  orderId?: string
  user: User
}
export type ExportResult = { batch: { id: string; kind: LabelKind; stage: Stage | null; labelCount: number }; body: Uint8Array; contentType: string; filename: string }

async function render(labels: PendingLabel[], format: 'csv' | 'xlsx'): Promise<Uint8Array> {
  const rows = labels.map((l) => labelRow(labelInputFor(l)))
  return format === 'csv' ? new TextEncoder().encode(toCsv(rows)) : await toXlsx(rows)
}

/**
 * One batch, one file, one stamp — together or not at all.
 *
 * Duplicates in the request are collapsed first so the count check cannot pass
 * while fewer distinct labels were found. Any requested label that is not
 * pending, of another kind or stage, or unknown makes the whole export refuse
 * with 422 and nothing stamped: a label onto the wrong piece is worse than no
 * label. The re-check inside the transaction is what sends the loser of a race
 * back with the same 422.
 */
export async function exportLabels(a: ExportArgs): Promise<ExportResult> {
  if (a.kind === 'stage' && !a.stage) throw new ApiError(400, 'stage labels need a stage', 'validation')
  const scope: LabelFilter = { kind: a.kind, stage: a.stage, status: 'pending', lineItemId: a.lineItemId, orderId: a.orderId, ...(a.labelIds ? { ids: [...new Set(a.labelIds)] } : {}) }
  const labels = await listLabels(scope)
  if (labels.length === 0 || (scope.ids && labels.length !== scope.ids.length))
    throw new ApiError(422, 'some labels are not pending or not of this kind and stage', 'label_mismatch')
  const ids = labels.map((l) => l.id)

  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.exportBatch.create({ data: { format: a.format, kind: a.kind, stage: a.stage ?? null, labelCount: ids.length, createdById: a.user.id } })
    const stamped = await tx.labelPrint.updateMany({ where: { id: { in: ids }, kind: a.kind, ...(a.stage ? { stage: a.stage } : {}), printedAt: null, exportBatchId: null }, data: { exportBatchId: b.id } })
    if (stamped.count !== ids.length) throw new ApiError(422, 'some labels are not pending or not of this kind and stage', 'label_mismatch')
    return b
  })

  const body = await render(labels, a.format)
  const tag = a.kind === 'planned' ? 'planned' : a.stage!
  return { batch: { id: batch.id, kind: a.kind, stage: batch.stage, labelCount: batch.labelCount }, body, contentType: CONTENT_TYPE[a.format], filename: `labels-${tag}-${batch.id}.${a.format}` }
}

/** The same rows a batch was exported with, rendered again. Creates nothing and stamps nothing. */
export async function batchFile(batchId: string): Promise<{ body: Uint8Array; contentType: string; filename: string }> {
  const batch = await prisma.exportBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new ApiError(404, 'batch not found', 'not_found')
  const rows = await prisma.labelPrint.findMany({ where: { exportBatchId: batchId }, include, orderBy: [{ piece: { lineItemId: 'asc' } }, { piece: { serial: 'asc' } }] })
  const format = batch.format === 'xlsx' ? 'xlsx' : 'csv'
  const printDate = batch.createdAt.toISOString().slice(0, 10)
  const labels = rows.map(toPending)
  const body = format === 'csv'
    ? new TextEncoder().encode(toCsv(labels.map((l) => labelRow(labelInputFor(l, printDate)))))
    : await toXlsx(labels.map((l) => labelRow(labelInputFor(l, printDate))))
  const tag = batch.kind === 'planned' ? 'planned' : batch.stage
  return { body, contentType: CONTENT_TYPE[format], filename: `labels-${tag}-${batch.id}.${format}` }
}

/** Marks the batch and every label in it printed. Idempotency is a 409, not a silent second stamp. */
export async function markBatchPrinted(batchId: string, copies: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const b = await tx.exportBatch.findUnique({ where: { id: batchId } })
    if (!b) throw new ApiError(404, 'batch not found', 'not_found')
    if (b.printedAt) throw new ApiError(409, 'batch already marked printed', 'already_printed')
    const now = new Date()
    await tx.exportBatch.update({ where: { id: batchId }, data: { printedAt: now, copies } })
    await tx.labelPrint.updateMany({ where: { exportBatchId: batchId }, data: { printedAt: now } })
  })
}

export type BatchRow = { id: string; kind: LabelKind; stage: Stage | null; format: string; labelCount: number; createdBy: string; createdAt: string; printedAt: string | null; copies: number | null; lineItemIds: string[] }

export async function listBatches(): Promise<BatchRow[]> {
  const rows = await prisma.exportBatch.findMany({
    orderBy: { createdAt: 'desc' }, take: 200,
    include: { createdBy: { select: { name: true } }, labels: { select: { piece: { select: { lineItemId: true } } } } },
  })
  return rows.map((b) => ({
    id: b.id, kind: b.kind, stage: b.stage, format: b.format, labelCount: b.labelCount, createdBy: b.createdBy.name,
    createdAt: b.createdAt.toISOString(), printedAt: b.printedAt?.toISOString() ?? null, copies: b.copies,
    lineItemIds: [...new Set(b.labels.map((l) => l.piece.lineItemId))],
  }))
}

export type ReprintRow = { id: string; pieceId: string; serial: number; styleCode: string; kind: LabelKind; stage: Stage | null; reason: string; requestedBy: string; requestedAt: string; printedAt: string | null }

export async function listReprints(): Promise<ReprintRow[]> {
  const rows = await prisma.labelPrint.findMany({ where: { reprintReason: { not: null } }, orderBy: { requestedAt: 'desc' }, take: 200, include: { ...include, requestedBy: { select: { name: true } } } })
  return rows.map((l) => ({ id: l.id, pieceId: l.pieceId, serial: l.piece.serial, styleCode: l.piece.lineItem.style.styleCode, kind: l.kind, stage: l.stage, reason: l.reprintReason!, requestedBy: l.requestedBy.name, requestedAt: l.requestedAt.toISOString(), printedAt: l.printedAt?.toISOString() ?? null }))
}
