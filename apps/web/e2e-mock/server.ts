import type { InventoryItem } from '@hf/db'
import type { PieceView } from '../../../packages/server/src/piece-view'
import type { FloorPieceRow } from '../../../packages/server/src/floor-pieces'
import type { ResolvedChecklist } from '../../../packages/server/src/checklists'
import type { ReceiptSummary, ReceiptView } from '../../../packages/server/src/inventory'
import { readScenario, type PieceScript, type Scenario } from './read-scenario'

/**
 * Stand-in for `@hf/server` while `HF_E2E_MOCK=1`.
 *
 * Next aliases the package to this file. Every value returned here is copied
 * from the scenario JSON. Nothing in this module decides which action is
 * legal or writes a row.
 */
export { devAuthEnabled } from '../../../packages/server/src/dev-auth'
export { ApiError } from '../../../packages/server/src/api'

export type { PieceView } from '../../../packages/server/src/piece-view'
export type { FloorGroup, FloorPieceRow } from '../../../packages/server/src/floor-pieces'
export type { ResolvedChecklist, ResolvedItem, ChecklistRecord } from '../../../packages/server/src/checklists'
export type { ReceiptSummary, ReceiptView, ReceiptPhoto } from '../../../packages/server/src/inventory'
export type { CartonRow } from '../../../packages/server/src/cartons'
export type { PieceHistory } from '../../../packages/server/src/piece-history'
export type { PendingLabel } from '../../../packages/server/src/labels'

const SHELL = {
  lineItemId: 'line-1',
  orderId: 'order-1',
  programId: 'program-1',
  category: 'jacket',
  size: 'M',
  shade: 'Tan',
  orderNumber: 'HF-1042',
  programName: 'Autumn',
  buyerName: 'Northwind',
} as const

function viewOf(row: PieceScript): PieceView {
  return {
    ...SHELL,
    id: row.id,
    qrToken: row.qrToken,
    serial: row.serial,
    state: row.state,
    version: 1,
    styleCode: row.styleCode ?? 'HF-JKT-01',
    worker: null,
    lastEvent: null,
    ageMinutes: 0,
    actions: row.actions,
    labelStage: null,
  }
}

function rowOf(row: PieceScript): FloorPieceRow {
  return {
    id: row.id,
    serial: row.serial,
    qrToken: row.qrToken,
    state: row.state,
    lineItemId: SHELL.lineItemId,
    styleCode: row.styleCode ?? 'HF-JKT-01',
    size: SHELL.size,
    shade: SHELL.shade,
    orderNumber: SHELL.orderNumber,
    orderId: SHELL.orderId,
    worker: null,
    ageMinutes: 0,
    lastEvent: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function checklistFor(pieceId: string): ResolvedChecklist {
  return {
    id: `cl-${pieceId}`,
    checklistId: 'list-1',
    number: 1,
    programId: null,
    step: 'qa',
    stage: 'cutting',
    category: 'jacket',
    items: [],
  }
}

function summaryOf(row: NonNullable<Scenario['receipts']>[number]): ReceiptSummary {
  const { receivedById: _receivedById, ...rest } = row
  return rest
}

export async function listFloorPieces(): Promise<{ rows: FloorPieceRow[]; nextBefore: string | null }> {
  const scenario = await readScenario()
  return { rows: scenario.pieces.map(rowOf), nextBefore: null }
}

export async function loadPieceView(where: { id: string } | { qrToken: string }): Promise<PieceView | null> {
  const scenario = await readScenario()
  const row = 'id' in where
    ? scenario.pieces.find((piece) => piece.id === where.id)
    : scenario.pieces.find((piece) => piece.qrToken === where.qrToken)
  return row ? viewOf(row) : null
}

export async function resolveForPiece(pieceId: string): Promise<ResolvedChecklist | null> {
  const scenario = await readScenario()
  if (!scenario.checklistFor?.includes(pieceId)) return null
  return checklistFor(pieceId)
}

export async function listReceipts(q: { status?: string; receivedById?: string } = {}): Promise<{ receipts: ReceiptSummary[]; nextBefore: string | null }> {
  const scenario = await readScenario()
  const receipts = (scenario.receipts ?? []).filter((row) => {
    if (q.status && row.status !== q.status) return false
    if (q.receivedById && row.receivedById !== q.receivedById) return false
    return true
  })
  return { receipts: receipts.map(summaryOf), nextBefore: null }
}

export async function getReceipt(id: string): Promise<ReceiptView | null> {
  const scenario = await readScenario()
  const receipt = scenario.receipt
  if (!receipt || receipt.id !== id) return null
  return receipt as unknown as ReceiptView
}

export async function listInventoryItems(): Promise<InventoryItem[]> {
  const scenario = await readScenario()
  return (scenario.items ?? []) as unknown as InventoryItem[]
}

export async function ordersWithPacked(): Promise<Array<{ orderId: string; orderNumber: string; programName: string; packed: number }>> {
  const scenario = await readScenario()
  return scenario.orders ?? []
}

export async function loadPieceHistory(): Promise<null> {
  return null
}

export async function listLabels(): Promise<never[]> {
  return []
}
