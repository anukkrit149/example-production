import { notFound } from 'next/navigation'
import { loadPieceView } from '@hf/server'
import { PieceCard } from '@/components/PieceCard'
import { RejectForm } from './RejectForm'

/**
 * The write-off screen.
 *
 * Guarded by `view.actions` from the domain table, like every other action
 * screen: if rejecting is not legal on this piece right now there is no form
 * to show, because the server would refuse the submit anyway.
 */
export default async function RejectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const view = await loadPieceView({ id })
  if (!view || !view.actions.includes('reject')) notFound()

  return (
    <main className="grid gap-4 p-4">
      <PieceCard view={view} />
      <RejectForm view={view} />
    </main>
  )
}
