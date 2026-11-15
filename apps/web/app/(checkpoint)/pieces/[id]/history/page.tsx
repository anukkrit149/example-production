import { notFound } from 'next/navigation'
import { loadPieceHistory } from '@hf/server'
import { HistoryList } from '@/components/HistoryList'

/**
 * The audit trail, newest first — the answer to "who had this and when".
 *
 * Photos are the evidence half of that answer. The bucket is private, so every
 * thumbnail needs its own short-lived signed url; they are minted for the whole
 * timeline in one pass rather than one await per image, which would serialise
 * the render behind however many photos the piece has collected.
 */
export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const history = await loadPieceHistory(id, 'desc')
  if (!history) notFound()

  return (
    <main className="grid gap-4 p-4">
      <HistoryList history={history} />
    </main>
  )
}
