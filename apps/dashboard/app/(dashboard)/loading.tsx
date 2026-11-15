/**
 * Shown the instant a navigation starts, before the page's data has arrived.
 *
 * Every dashboard page is a header, usually a facts block, then a table, so
 * one skeleton in that shape stands in for all of them. Because this file
 * exists, Next also prefetches it for every sidebar link, which is what makes a
 * click feel immediate: the shell paints from cache while the server round
 * trip is still in flight.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="mb-6 flex items-end justify-between gap-6">
        <div className="hf-skeleton h-9 w-56 rounded" />
        <div className="hf-skeleton h-9 w-32 rounded-md" />
      </div>
      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 rounded-lg border p-4" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid gap-2">
            <div className="hf-skeleton h-2.5 w-16 rounded" />
            <div className="hf-skeleton h-4 w-28 rounded" />
          </div>
        ))}
      </div>
      <div className="grid gap-px">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex h-9 items-center gap-6 border-b" style={{ borderColor: 'var(--hf-line)' }}>
            <div className="hf-skeleton h-3 w-24 rounded" />
            <div className="hf-skeleton h-3 w-32 rounded" />
            <div className="hf-skeleton h-3 w-16 rounded" />
            <div className="hf-skeleton ml-auto h-3 w-40 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
