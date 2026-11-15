import Link from 'next/link'

/**
 * One tab per category. `tags` puts a muted note under a tab (the program page
 * uses it for "not in this program"); `counts` puts a muted number beside one
 * (the styles list uses it). Plain links, so the URL is the state and the back
 * button works.
 */
export function CategoryTabs<C extends string>({ current, hrefFor, order, tags = {}, counts }: {
  current: C
  hrefFor: (c: C) => string
  order: readonly C[]
  tags?: Partial<Record<C, string>>
  counts?: Partial<Record<C, number>>
}) {
  return (
    <nav aria-label="Category" className="mb-5 flex flex-wrap gap-2 border-b" style={{ borderColor: 'var(--hf-line)' }}>
      {order.map((c) => {
        const active = c === current
        return (
          <Link
            key={c}
            href={hrefFor(c)}
            aria-current={active ? 'page' : undefined}
            className="hf-ui -mb-px grid gap-0.5 border-b-2 px-3 pb-2 pt-1 text-xs uppercase"
            style={active ? { borderColor: 'var(--hf-oxblood-lit)', color: 'var(--hf-ink)' } : { borderColor: 'transparent', color: 'var(--hf-muted)' }}
          >
            <span>{c}{counts && counts[c] !== undefined ? <span className="ml-1 normal-case tracking-normal" aria-label={`${counts[c]} ${counts[c] === 1 ? 'style' : 'styles'}`} style={{ color: 'var(--hf-muted)' }}>{counts[c]}</span> : null}</span>
            {tags[c] && <span className="text-[9px] normal-case tracking-normal" style={{ color: 'var(--hf-muted)' }}>{tags[c]}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
