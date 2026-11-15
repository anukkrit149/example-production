import Link from 'next/link'
import type { PeriodNumbers } from '@hf/server'
import { piecesHref } from '@/lib/links'

type Tile = { key: string; label: string; value: string; href?: string }

/**
 * The period's numbers, in production order, ending with the exceptions.
 *
 * A tile links to `/pieces` only where the list page can actually answer for
 * it: "cut" is every piece at or past cutting, "packed" at or past packaging,
 * "on hold" is a state. Shipped, QA rejects and active workers have no piece
 * filter that means the same thing over a *window*, so they stay plain text —
 * a link that quietly changed the question would be worse than none.
 */
export function Tiles({ numbers }: { numbers: PeriodNumbers }) {
  const tiles: Tile[] = [
    { key: 'cut', label: 'Cut', value: String(numbers.cut), href: piecesHref({}, { atOrPast: 'cutting' }) },
    { key: 'pasted', label: 'Pasted', value: String(numbers.pasted), href: piecesHref({}, { atOrPast: 'pasting' }) },
    { key: 'stitched', label: 'Stitched', value: String(numbers.stitched), href: piecesHref({}, { atOrPast: 'stitching' }) },
    { key: 'finished', label: 'Finished', value: String(numbers.finished), href: piecesHref({}, { atOrPast: 'finishing' }) },
    { key: 'qcPassed', label: 'QC passed', value: String(numbers.qcPassed), href: piecesHref({}, { atOrPast: 'qc' }) },
    { key: 'packed', label: 'Packed', value: String(numbers.packed), href: piecesHref({}, { atOrPast: 'packaging' }) },
    { key: 'shipped', label: 'Shipped', value: String(numbers.shipped) },
    {
      key: 'qaFailed',
      label: numbers.qaRate === null ? 'QA rejects' : `QA rejects · ${Math.round(numbers.qaRate * 100)}%`,
      // Failed QA checks in the window, not pieces currently REJECTED — a link would change the question.
      value: String(numbers.qaFailed),
    },
    { key: 'held', label: 'On hold', value: String(numbers.held), href: piecesHref({}, { state: 'ON_HOLD' }) },
    { key: 'activeWorkers', label: 'Active workers', value: String(numbers.activeWorkers) },
  ]

  return (
    <div className="mb-8 grid grid-cols-2 gap-2 md:grid-cols-5">
      {tiles.map((t) => {
        const body = (
          <>
            <span className="hf-num block text-left text-2xl font-semibold">{t.value}</span>
            <span className="hf-label mt-1 block" style={{ color: 'var(--hf-muted)' }}>{t.label}</span>
          </>
        )
        return t.href ? (
          <Link key={t.key} href={t.href} className="rounded-lg border p-3" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
            {body}
          </Link>
        ) : (
          <div key={t.key} className="rounded-lg border p-3" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
