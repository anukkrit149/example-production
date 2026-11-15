'use client'
import Link from 'next/link'
import { useState } from 'react'
import type { ChecklistItemKind } from '@hf/domain'
import type { ChecklistDetail } from '@hf/server'
import { PICTOGRAMS } from '@hf/domain'
import { Button } from '../ui'
import { ItemDetail } from './ItemDetail'
import { ItemList } from './ItemList'
import { StartFrom } from './StartFrom'
import { useAutosaveDraft, type SaveState } from './useAutosaveDraft'

export type EditorRow = { kind: ChecklistItemKind; textEn: string; textHi: string; pictogram: string; unit: string; min: string; max: string }
const blankRow = (): EditorRow => ({ kind: 'confirm', textEn: '', textHi: '', pictogram: PICTOGRAMS[0], unit: '', min: '', max: '' })

/** A server-resolved item (`unit`/`min`/`max` as `string | null` / `number | null`) as an editor row, with numbers stringified for the inputs — empty string means not set. */
export const toEditorRow = (i: { kind: ChecklistItemKind; textEn: string; textHi: string; pictogram: string; unit?: string | null; min?: number | null; max?: number | null }): EditorRow => ({
  kind: i.kind, textEn: i.textEn, textHi: i.textHi, pictogram: i.pictogram,
  unit: i.unit ?? '', min: i.min == null ? '' : String(i.min), max: i.max == null ? '' : String(i.max),
})

const STATUS: Record<SaveState, string> = {
  saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', invalid: 'Fill in both texts to save', failed: 'Save failed',
}

/**
 * Two panes: the list on the left, the selected item on the right. Below
 * 768 px they are two screens — tapping an item opens it, Back returns to
 * the list. Drafts save themselves; the one action is Review & publish.
 */
export function ChecklistEditor({ detail }: { detail: ChecklistDetail }) {
  const initial = detail.draft ?? detail.published
  const [rows, setRows] = useState<EditorRow[]>((initial?.items ?? []).map(toEditorRow))
  const [selected, setSelected] = useState(0)
  const [itemOpen, setItemOpen] = useState(false) // phone: detail screen showing
  const { state, savedOnce, retry } = useAutosaveDraft(detail.id, rows, detail.hasDraft)

  const update = (patch: Partial<EditorRow>) => setRows((r) => r.map((row, i) => (i === selected ? { ...row, ...patch } : row)))
  // Selection follows the moved item, so a run of ↑ keeps walking the same
  // row up. Both setters are called from the handler, never from inside an
  // updater — updaters must stay pure.
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    setRows((r) => {
      const next = [...r]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
    setSelected(j)
  }
  // Both read `rows` — this render's array — for the new list and for the
  // clamp, rather than mixing a functional updater with a length from the
  // closure. The list is never empty (ItemList disables the last ×), so the
  // clamp's upper bound stays >= 0.
  const remove = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i)
    setRows(next)
    setSelected(Math.max(0, Math.min(selected - (i <= selected ? 1 : 0), next.length - 1)))
  }
  const add = () => {
    setRows([...rows, blankRow()])
    setSelected(rows.length)
    setItemOpen(true)
  }
  const select = (i: number) => { setSelected(i); setItemOpen(true) }

  const current = rows[selected] ?? rows[0]
  const canReview = state === 'saved' && savedOnce

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span role="status" className="hf-ui rounded-md border px-2 py-1 text-[11px] uppercase" style={{ borderColor: 'var(--hf-line)', color: state === 'failed' ? 'var(--hf-oxblood-deep)' : 'var(--hf-muted)' }}>
            {STATUS[state]}
          </span>
          {state === 'failed' && <Button type="button" variant="ghost" onClick={retry}>Retry</Button>}
          {detail.published && <span className="text-xs" style={{ color: 'var(--hf-muted)' }}>Live: v{detail.published.number}</span>}
        </div>
        <div className="flex items-center gap-3">
          <StartFrom excludeId={detail.id} currentCount={rows.length} onReplace={(next) => { setRows(next); setSelected(0); setItemOpen(false) }} />
          {canReview ? (
            <Link href={`/checklists/${detail.id}/publish`} className="hf-ui inline-flex h-9 items-center rounded-md border px-4 text-xs uppercase" style={{ background: 'var(--hf-oxblood-lit)', borderColor: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' }}>Review &amp; publish</Link>
          ) : (
            <Button type="button" disabled title={savedOnce ? 'Wait for the draft to save' : 'Change something first'}>Review &amp; publish</Button>
          )}
        </div>
      </div>

      {/* min-w-0 on both panes: a grid item's default min-width is its
          content's, so without it the list's buttons push the left column
          past its track and overlap the detail pane. */}
      <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_2fr]">
        <div className={`min-w-0 ${itemOpen ? 'hidden md:block' : 'block'}`}>
          <ItemList rows={rows} selected={selected} onSelect={select} onMove={move} onRemove={remove} onAdd={add} />
        </div>
        <div className={`min-w-0 ${itemOpen ? 'block' : 'hidden md:block'}`}>
          <button type="button" onClick={() => setItemOpen(false)} className="hf-ui mb-3 text-xs uppercase underline md:hidden" style={{ color: 'var(--hf-muted)' }}>← All items</button>
          {current ? <ItemDetail row={current} index={selected} total={rows.length} onChange={update} /> : <p className="text-sm" style={{ color: 'var(--hf-muted)' }}>Add an item to begin.</p>}
        </div>
      </div>
    </div>
  )
}
