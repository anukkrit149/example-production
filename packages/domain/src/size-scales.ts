/**
 * Which sizes a style can be ordered in, by category.
 *
 * The design spec models these as tables (`size_scales`, `size_scale_sizes`);
 * the first build keeps `order_line_items.size` as text and validates against
 * this list instead. Promoting to tables later is a data change, not a
 * behaviour change: every size written under this rule is a member of one of
 * these scales.
 */
export const STYLE_CATEGORIES = ['jacket', 'outerwear', 'bag', 'belt', 'slg'] as const
export type StyleCategory = (typeof STYLE_CATEGORIES)[number]

const APPAREL = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const
const ONE_SIZE = ['ONE'] as const
const BELT_WAIST = ['28', '30', '32', '34', '36', '38', '40', '42', '44'] as const

export const SIZE_SCALES: Record<StyleCategory, readonly string[]> = {
  jacket: APPAREL,
  outerwear: APPAREL,
  bag: ONE_SIZE,
  slg: ONE_SIZE,
  belt: BELT_WAIST,
}

export function sizesFor(category: string): readonly string[] {
  return (SIZE_SCALES as Record<string, readonly string[] | undefined>)[category] ?? []
}

export const isValidSize = (category: string, size: string): boolean => sizesFor(category).includes(size)
