/**
 * Sits over an empty chart's axes: the axes still render (so the figure
 * reads as "a chart with no data" rather than a blank box) while this
 * centres the muted copy on top of them.
 */
export function EmptyOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <p className="text-sm" style={{ color: 'var(--hf-muted)' }}>
        No activity in this period
      </p>
    </div>
  )
}
