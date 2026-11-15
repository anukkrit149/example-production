import type { PieceState, Stage } from '@hf/domain'

export type PieceScope = { lineItemId?: string; orderId?: string; programId?: string }

/** Every number on a strip links here. The list page parses the same keys. */
export function piecesHref(scope: PieceScope, q: { atOrPast?: Stage; state?: PieceState } = {}): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...scope, ...q })) if (v) p.set(k, v)
  return `/pieces?${p.toString()}`
}
