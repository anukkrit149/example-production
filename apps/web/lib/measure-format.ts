/**
 * The one place a measured value is turned into text.
 *
 * `ItemScreen` renders it beside the numeric field, `Summary` renders it on
 * the answer list — a single helper keeps a change to one from silently
 * drifting from the other.
 */
export function formatMeasureValue(value: number, unit: string | null): string {
  return unit ? `${value} ${unit}` : String(value)
}
