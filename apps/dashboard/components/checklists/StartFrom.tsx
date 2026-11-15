'use client'
import { useEffect, useState } from 'react'
import type { ChecklistDetail, ChecklistSummary } from '@hf/server'
import { Button, inputClass } from '../ui'
import { toEditorRow, type EditorRow } from './ChecklistEditor'

/** Copy another factory default's live items into this draft. Two clicks: pick, then confirm the replacement in place. */
export function StartFrom({ excludeId, currentCount, onReplace }: { excludeId: string; currentCount: number; onReplace: (rows: EditorRow[]) => void }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ChecklistSummary[]>([])
  const [choice, setChoice] = useState('')
  const [loaded, setLoaded] = useState<{ label: string; rows: EditorRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let ignore = false
    fetch('/api/checklists')
      .then((r) => r.json())
      .then((d: { checklists: ChecklistSummary[] }) => { if (!ignore) setOptions(d.checklists.filter((c) => c.id !== excludeId && c.publishedNumber !== null)) })
      .catch(() => { if (!ignore) setError('Could not load the checklists.') })
    return () => { ignore = true }
  }, [open, excludeId])

  const load = async () => {
    setError(null)
    try {
      const d = (await (await fetch(`/api/checklists/${choice}`)).json()) as { checklist: ChecklistDetail }
      const src = d.checklist.published ?? d.checklist.draft
      if (!src) throw new Error('empty')
      const s = d.checklist
      setLoaded({ label: `${s.category} · ${s.step}${s.stage ? ` · ${s.stage}` : ''}`, rows: src.items.map(toEditorRow) })
    } catch {
      setError('Could not load that checklist.')
    }
  }

  if (!open) return <Button type="button" variant="ghost" onClick={() => setOpen(true)}>Start from…</Button>
  return (
    <div className="grid gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--hf-line)' }}>
      <label className="hf-label" style={{ color: 'var(--hf-muted)' }} htmlFor="start-from">Copy items from</label>
      <div className="flex flex-wrap gap-2">
        <select id="start-from" className={`${inputClass} md:w-72`} value={choice} onChange={(e) => { setChoice(e.target.value); setLoaded(null) }}>
          <option value="">Choose a factory default…</option>
          {options.map((c) => <option key={c.id} value={c.id}>{c.category} · {c.step}{c.stage ? ` · ${c.stage}` : ''} ({c.itemCount})</option>)}
        </select>
        <Button type="button" variant="ghost" onClick={load} disabled={!choice}>Load</Button>
        <Button type="button" variant="ghost" onClick={() => { setOpen(false); setLoaded(null); setChoice('') }}>Cancel</Button>
      </div>
      {loaded && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Replace the {currentCount} item{currentCount === 1 ? '' : 's'} here with {loaded.rows.length} from {loaded.label}?</span>
          <Button type="button" onClick={() => { onReplace(loaded.rows); setOpen(false); setLoaded(null); setChoice('') }}>Replace</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>{error}</p>}
    </div>
  )
}
