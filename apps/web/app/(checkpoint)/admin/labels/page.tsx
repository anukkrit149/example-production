import { listLabels } from '@hf/server'
import { AdminStrip } from '@/components/AdminStrip'
import { PrintQueue } from './PrintQueue'
import { PrintQueueHeading } from './PrintQueueHeading'

/**
 * Everything waiting to be stuck onto a piece.
 *
 * The queue is read fresh on every visit — an operator who just marked a batch
 * printed must not see those labels again, and a label another store user
 * requested a second ago must be here. `listLabels` is the one read path the
 * export route also uses, so the screen and the file can never disagree about
 * what is pending. Both kinds are loaded here, server-side, so the client
 * segmented control just switches between two lists it already has.
 */
export const dynamic = 'force-dynamic'

export default async function PrintQueuePage() {
  const [planned, stage] = await Promise.all([
    listLabels({ kind: 'planned', status: 'pending' }),
    listLabels({ kind: 'stage', status: 'pending' }),
  ])
  const total = planned.length + stage.length

  return (
    <main className="grid gap-4 p-4">
      <AdminStrip />
      <div>
        <PrintQueueHeading />
        <p className="mt-1 text-base" style={{ color: 'var(--hf-muted)' }}>
          {total === 0
            ? 'Nothing waiting to print.'
            : `${total} label${total === 1 ? '' : 's'} waiting.`}
        </p>
      </div>

      <PrintQueue planned={planned} stage={stage} />
    </main>
  )
}
