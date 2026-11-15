import { listFloorPieces } from '@hf/server'
import { PiecesStatus } from './PiecesStatus'

/**
 * Pieces Status: every active piece, one screen. The server renders the
 * first page for the unfiltered group so the phone has something to paint
 * before the client script even runs; every chip, the search box and Load
 * more are `PiecesStatus`'s to own from there.
 */
export default async function PiecesPage() {
  const initial = await listFloorPieces({ group: 'all' })
  return (
    <main className="grid gap-4 p-4">
      <PiecesStatus initial={initial} />
    </main>
  )
}
