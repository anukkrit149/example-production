/**
 * A measurement's range for display: `44–46 cm`, or `…–46 cm` / `44–… cm`
 * when only one bound is set. No 'use client' directive — safe to import
 * from a server component (DiffList, ChecklistAnswers) or a client one.
 */
export const formatMeasureRange = (min: number | null | undefined, max: number | null | undefined, unit: string | null | undefined) =>
  `${min ?? '…'}–${max ?? '…'} ${unit ?? ''}`.trim()
