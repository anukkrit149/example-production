import { listLineItems } from '@/lib/line-items'
import { ActivateForm } from './ActivateForm'
import { NewPieceEmptyState } from './NewPieceEmptyState'

/**
 * The busiest screen in the factory: a panel set has just come off the table
 * and needs its first label.
 *
 * Only line items with a planned piece left appear. Activation takes the
 * lowest-serial `PLANNED` piece, so a fully cut line item has nothing to give —
 * showing it would put a row on the list that fails on tap, which at a bench is
 * worse than not showing it at all.
 */
export default async function NewPiecePage() {
  const lineItems = (await listLineItems()).filter((li) => li.planned > 0)

  return (
    <main className="grid gap-5 p-4">
      {lineItems.length === 0 ? <NewPieceEmptyState /> : <ActivateForm lineItems={lineItems} />}
    </main>
  )
}
