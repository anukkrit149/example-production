import { notFound } from 'next/navigation'
import { loadPieceView } from '@hf/server'
import { PieceCard } from '@/components/PieceCard'
import { PieceActions } from '@/components/PieceActions'

/**
 * The screen the whole app exists to show: what this is, and what to do next.
 *
 * `view.actions` comes from the domain table, never from a guess here — the
 * first entry is the move an operator makes ninety-nine times out of a hundred,
 * so it gets the oxblood button and the top of the thumb's reach. Everything
 * else is available but quiet.
 */
export default async function PiecePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const view = await loadPieceView({ id })
  if (!view) notFound()

  return (
    <main className="grid gap-4 p-4">
      <PieceCard view={view} />
      <PieceActions view={view} />
    </main>
  )
}
