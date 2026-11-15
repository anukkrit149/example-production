import { prisma } from '@hf/db'
import type { PieceEventType, PieceState, Stage } from '@hf/domain'
import { photoUrls } from './storage'

export type HistoryEvent = {
  id: string
  eventType: PieceEventType
  stage: Stage | null
  createdAt: string
  by: string
  worker: string | null
  details: unknown
  photos: Array<{ id: string; url: string }>
}

export type PieceHistory = {
  piece: { id: string; qrToken: string; serial: number; state: PieceState }
  events: HistoryEvent[]
}

/**
 * The audit trail for one piece, with every photo already signed.
 *
 * The bucket is private, so each thumbnail needs a short-lived signed url;
 * they are minted for the whole timeline in one pass rather than one await per
 * image. The checkpoint app reads newest first (an operator wants the latest
 * event), the dashboard oldest first (a merchandiser reads the story).
 */
export async function loadPieceHistory(pieceId: string, order: 'asc' | 'desc' = 'desc'): Promise<PieceHistory | null> {
  const piece = await prisma.piece.findUnique({
    where: { id: pieceId },
    include: {
      events: { orderBy: { createdAt: order }, include: { user: true, worker: true, attachments: true } },
    },
  })
  if (!piece) return null

  const signed = await photoUrls(piece.events.flatMap((e) => e.attachments.map((a) => a.storageKey)))

  return {
    piece: { id: piece.id, qrToken: piece.qrToken, serial: piece.serial, state: piece.state },
    events: piece.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      stage: e.stage,
      createdAt: e.createdAt.toISOString(),
      by: e.user.name,
      worker: e.worker?.name ?? null,
      details: e.details,
      photos: e.attachments.flatMap((a) => {
        const url = signed.get(a.storageKey)
        return url ? [{ id: a.id, url }] : []
      }),
    })),
  }
}
