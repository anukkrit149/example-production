/** A measured value against an optional inclusive tolerance. Null bounds are open. NaN/Infinity never pass. */
export function measureWithin(value: number, min: number | null, max: number | null): boolean {
  if (!Number.isFinite(value)) return false
  if (min !== null && value < min) return false
  if (max !== null && value > max) return false
  return true
}
