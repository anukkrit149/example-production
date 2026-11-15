/** Keys of the shipped SVG set under apps/web/public/pictograms. The admin picker shows exactly these. */
export const PICTOGRAMS = [
  'count', 'set-complete', 'inspect', 'leather-lot', 'panels', 'flaw', 'glue', 'stitch', 'zip', 'hardware',
  'measure', 'tags', 'hand-over', 'take-back', 'quantity', 'materials', 'damage', 'camera', 'carton', 'label', 'warning',
  'delivery-goods', 'shelf', 'receipt-paper', 'chips', 'supplier',
] as const
export type Pictogram = (typeof PICTOGRAMS)[number]
export const isPictogram = (k: string): k is Pictogram => (PICTOGRAMS as readonly string[]).includes(k)
