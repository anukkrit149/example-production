import { z } from 'zod'
import { PIECE_STATES, STAGES, type PieceState, type Stage } from '@hf/domain'
import { PIECE_LIST_CAP, piecesCount, piecesWhere } from '@hf/server'
import { PieceTable } from '@/components/PieceTable'
import { PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'

export const dynamic = 'force-dynamic'

type Q = { lineItemId?: string; orderId?: string; programId?: string; atOrPast?: string; state?: string }
const isStage = (s?: string): s is Stage => !!s && (STAGES as readonly string[]).includes(s)
const isState = (s?: string): s is PieceState => !!s && (PIECE_STATES as readonly string[]).includes(s)
const uuid = (s?: string) => (s && z.uuid().safeParse(s).success ? s : undefined)

/** The rows behind a number. The filter keys are exactly the ones the StageStrip links carry. */
export default async function PiecesPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams
  const atOrPast = isStage(q.atOrPast) ? q.atOrPast : undefined
  const state = isState(q.state) ? q.state : undefined
  const filter = { lineItemId: uuid(q.lineItemId), orderId: uuid(q.orderId), programId: uuid(q.programId), atOrPast, state }
  await pageUser()
  const [pieces, total] = await Promise.all([piecesWhere(filter), piecesCount(filter)])
  const what = atOrPast ? `at or past ${atOrPast}` : state ? state.toLowerCase().replaceAll('_', ' ') : 'all states'
  const truncated = pieces.length === PIECE_LIST_CAP && total > PIECE_LIST_CAP
  return (
    <>
      <PageHeader eyebrow="Pieces" title={`${total} ${what}`} />
      {truncated && (
        <p className="mb-4 text-sm" style={{ color: 'var(--hf-muted)' }}>
          Showing {PIECE_LIST_CAP} of {total} pieces. Narrow the filter to see the rest.
        </p>
      )}
      <PieceTable pieces={pieces} />
    </>
  )
}
