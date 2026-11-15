'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { LayoutRow } from '@hf/domain'
import type { ProgramChecklistRow } from '@hf/server'
import { mutate, MutateError } from '@/lib/client-mutate'
import { Button } from '../ui'
import { EmptyCell } from './ChecklistChip'
import { StageTimeline } from './StageTimeline'

/**
 * The program's view of the timeline: each chip says whether this program
 * runs the factory default or its own list. Customise copies the default
 * into a program draft and opens the editor; Revert retires the override.
 */
export function ProgramTimeline({ programId, rows, canEdit }: { programId: string; rows: LayoutRow<ProgramChecklistRow>[]; canEdit: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const customise = async (row: ProgramChecklistRow) => {
    setBusy(row.defaultId); setError(null)
    try {
      const created = await mutate<{ checklist: { id: string } }>('/api/checklists/overrides', { programId, step: row.step, stage: row.stage, category: row.category })
      router.push(`/checklists/${created.checklist.id}`)
    } catch (e) { setError(e instanceof MutateError ? e.message : 'Something went wrong. Try again.'); setBusy(null) }
  }
  const revert = async (row: ProgramChecklistRow) => {
    setBusy(row.id); setError(null)
    try { await mutate(`/api/checklists/${row.id}/revert`, {}); router.refresh() }
    catch (e) { setError(e instanceof MutateError ? e.message : 'Something went wrong. Try again.') }
    finally { setBusy(null) }
  }

  return (
    <div className="grid gap-3">
      {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>{error}</p>}
      <StageTimeline rows={rows} renderCell={(cell, row) => {
        const l = cell.checklist
        if (!l) return <EmptyCell step={cell.step} />
        const label = `${l.category} ${row.label} ${cell.step}`
        return (
          <div className="grid min-w-[160px] gap-1.5 rounded-lg border px-3 py-2" style={{ borderColor: l.customised ? 'var(--hf-oxblood-lit)' : 'var(--hf-line)', background: 'var(--hf-card)' }} aria-label={label}>
            <span className="flex items-center gap-2">
              <span className="hf-ui text-xs uppercase">{cell.step}</span>
              {l.hasDraft && <span aria-label="draft waiting" title="Draft waiting" className="h-2 w-2 rounded-full" style={{ background: 'var(--hf-oxblood-lit)' }} />}
            </span>
            <span className="text-xs" style={{ color: 'var(--hf-muted)' }}>{l.customised ? (l.publishedNumber === null ? 'Draft, not yet published' : `Custom v${l.publishedNumber}`) : 'Default'} · {l.itemCount} item{l.itemCount === 1 ? '' : 's'}</span>
            {canEdit && (l.customised ? (
              <span className="flex gap-1">
                <Link href={`/checklists/${l.id}`} className="hf-ui inline-flex h-8 items-center rounded-md border px-3 text-[11px] uppercase" style={{ borderColor: 'var(--hf-line)' }}>Edit</Link>
                <Button type="button" variant="danger" className="h-8 !px-3 !text-[11px]" onClick={() => revert(l)} disabled={busy === l.id}>{busy === l.id ? 'Reverting…' : 'Revert'}</Button>
              </span>
            ) : (
              <span><Button type="button" variant="ghost" className="h-8 !px-3 !text-[11px]" onClick={() => customise(l)} disabled={busy === l.defaultId}>{busy === l.defaultId ? 'Customising…' : 'Customise'}</Button></span>
            ))}
          </div>
        )
      }} />
    </div>
  )
}
