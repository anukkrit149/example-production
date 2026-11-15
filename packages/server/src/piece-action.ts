import { prisma, Prisma, type Piece, type PieceEvent, type User } from '@hf/db'
import { transition, photoRequirement, labelStageFor, type PieceEventType, type PieceState, type Stage } from '@hf/domain'
import { ApiError } from './api'

export type PieceActionArgs = {
  pieceId: string
  user: User
  idempotencyKey: string
  expectedVersion?: number
  event: { type: PieceEventType; stage?: Stage; returnTo?: PieceState }
  workerId?: string | null
  groupId?: string | null
  details?: Record<string, unknown>
  attachmentIds?: string[]
  /** Sets piece.workerId after a successful transition; `undefined` leaves it unchanged. */
  afterWorker?: string | null
  /** Another event of the same handover carries the photo; recorded as details.photoFromEventId and satisfies the photo policy. */
  photoSharedWithEventId?: string
  /**
   * Run inside this transaction instead of opening one. The row lock, replay
   * check and version bump behave identically; the caller owns commit/rollback.
   * Used by the dashboard's quantity change, which cancels several PLANNED
   * pieces and updates the line item as one unit.
   */
  tx?: Prisma.TransactionClient
}

export type PieceActionResult = { piece: Piece; event: PieceEvent; replayed: boolean }

/**
 * The single write path for every piece state change.
 *
 * One transaction, in this order:
 *   1. Idempotency replay — looked up *before* the lock, so a retried request
 *      never queues behind an in-flight action on the same piece.
 *   2. `SELECT ... FOR UPDATE` on the piece row. Prisma has no native row lock,
 *      so this is raw SQL. It is what serialises two concurrent actions: the
 *      loser blocks here until the winner commits, then reads the incremented
 *      version and fails the optimistic check below with a 409.
 *   3. Optimistic version check, domain transition, photo policy, attachment
 *      ownership — every rejection is a typed ApiError, never a partial write.
 *   4. Append the event, link its attachments, advance the piece, and request a
 *      stage label when the new state has one.
 */
export async function runPieceAction(a: PieceActionArgs): Promise<PieceActionResult> {
  const body = async (tx: Prisma.TransactionClient): Promise<PieceActionResult> => {
      const existing = await tx.pieceEvent.findUnique({ where: { idempotencyKey: a.idempotencyKey } })
      if (existing) {
        const piece = await tx.piece.findUniqueOrThrow({ where: { id: existing.pieceId } })
        return { piece, event: existing, replayed: true }
      }

      // Row lock. Blocks any concurrent action on this piece until we commit.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM pieces WHERE id = ${a.pieceId}::uuid FOR UPDATE`
      if (locked.length === 0) throw new ApiError(404, 'piece not found', 'not_found')

      // Re-read through Prisma for the camelCase field mapping and enum types.
      // Safe under the lock: this sees the state the winner committed.
      const piece = await tx.piece.findUniqueOrThrow({ where: { id: a.pieceId } })

      if (a.expectedVersion !== undefined && a.expectedVersion !== piece.version)
        throw new ApiError(409, 'piece changed since it was scanned, rescan it', 'version_conflict')

      const t = transition(piece.state, a.event)
      if (!t.ok) throw new ApiError(422, t.reason, 'invalid_transition')

      const attachmentIds = a.attachmentIds ?? []
      const details: Record<string, unknown> = { ...(a.details ?? {}) }
      if (a.event.returnTo) details.returnTo = a.event.returnTo

      if (a.photoSharedWithEventId) details.photoFromEventId = a.photoSharedWithEventId
      if (photoRequirement(a.event.type) === 'required' && attachmentIds.length === 0 && !a.photoSharedWithEventId) {
        const reason = details.photoOverrideReason
        const overridden = typeof reason === 'string' && reason.trim().length > 0
        const mayOverride = a.user.role === 'supervisor' || a.user.role === 'admin'
        if (!(overridden && mayOverride)) throw new ApiError(422, 'a photo is required for this step', 'photo_required')
      }

      if (attachmentIds.length > 0) {
        const found = await tx.attachment.count({ where: { id: { in: attachmentIds }, pieceEventId: null } })
        if (found !== attachmentIds.length) throw new ApiError(422, 'attachment missing or already used', 'attachment_invalid')
      }

      const event = await tx.pieceEvent.create({
        data: {
          pieceId: piece.id,
          eventType: a.event.type,
          stage: a.event.stage ?? null,
          userId: a.user.id,
          workerId: a.workerId ?? null,
          groupId: a.groupId ?? null,
          details: details as Prisma.InputJsonValue,
          idempotencyKey: a.idempotencyKey,
        },
      })

      if (attachmentIds.length > 0)
        await tx.attachment.updateMany({ where: { id: { in: attachmentIds } }, data: { pieceEventId: event.id } })

      const updated = await tx.piece.update({
        where: { id: piece.id },
        data: {
          state: t.next,
          version: { increment: 1 },
          ...(a.afterWorker !== undefined ? { workerId: a.afterWorker } : {}),
        },
      })

      const labelStage = labelStageFor(t.next)
      if (a.event.type === 'STAGE_QA_PASSED' && labelStage) {
        await tx.labelPrint.create({
          data: {
            pieceId: piece.id,
            stage: labelStage,
            template: labelStage === 'finishing' ? 't50x50' : 't50x25',
            requestedById: a.user.id,
          },
        })
        await tx.pieceEvent.create({
          data: {
            pieceId: piece.id,
            eventType: 'LABEL_PRINT_REQUESTED',
            stage: labelStage,
            userId: a.user.id,
            groupId: a.groupId ?? null,
            details: {},
            idempotencyKey: `${a.idempotencyKey}:label`,
          },
        })
      }

      return { piece: updated, event, replayed: false }
  }

  if (a.tx) return body(a.tx)
  return prisma.$transaction(body, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}
