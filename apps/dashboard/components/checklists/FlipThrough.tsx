'use client'
import { useState } from 'react'
import { Button } from '../ui'
import { LangToggle, PhoneCard, type CardItem, type Lang } from './PhoneCard'

/** Step through the draft one card at a time, the way an operator will. */
export function FlipThrough({ items }: { items: CardItem[] }) {
  const [i, setI] = useState(0)
  const [lang, setLang] = useState<Lang>('hi')
  if (items.length === 0) return null
  return (
    <section className="grid gap-3" aria-label="Flip through on the phone">
      <div className="flex items-center justify-between">
        <h3 className="hf-label" style={{ color: 'var(--hf-muted)' }}>Flip through on the phone</h3>
        <LangToggle lang={lang} onChange={setLang} />
      </div>
      <PhoneCard item={items[i]!} index={i} total={items.length} lang={lang} />
      <div className="mx-auto flex gap-2">
        <Button type="button" variant="ghost" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0}>← Back</Button>
        <Button type="button" variant="ghost" onClick={() => setI((n) => Math.min(items.length - 1, n + 1))} disabled={i === items.length - 1}>Next →</Button>
      </div>
    </section>
  )
}
