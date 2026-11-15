import type { ReactNode } from 'react'

/**
 * The wrapper every overview chart sits in. `role="img"` plus `aria-label`
 * is the e2e contract — a11y tooling and Playwright both find the chart by
 * name rather than by DOM structure, so the label text must stay exactly
 * what the spec calls it even as the chart underneath changes libraries.
 */
export function ChartFigure({ title, ariaLabel, children }: { title: string; ariaLabel: string; children: ReactNode }) {
  return (
    <figure role="img" aria-label={ariaLabel}>
      <figcaption className="hf-label mb-2" style={{ color: 'var(--hf-muted)' }}>
        {title}
      </figcaption>
      {children}
    </figure>
  )
}
