'use client'
import { useState } from 'react'
import { PICTOGRAMS, type ChecklistItemKind } from '@hf/domain'
import { Field, inputClass } from '../ui'
import type { EditorRow } from './ChecklistEditor'
import { LangToggle, PhoneCard, type Lang } from './PhoneCard'

const KINDS: ChecklistItemKind[] = ['confirm', 'photo', 'materials', 'measure']

function PictogramPicker({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1" role="radiogroup" aria-label="Pictogram">
      {PICTOGRAMS.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} title={p} aria-label={p} onClick={() => onChange(p)}
          className="flex items-center justify-center rounded-md border p-1"
          style={value === p ? { borderColor: 'var(--hf-oxblood-lit)', background: 'var(--hf-card)' } : { borderColor: 'var(--hf-line)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static, ink-on-transparent SVG asset */}
          <img src={`/pictograms/${p}.svg`} alt="" width={40} height={40} style={{ width: 40, height: 40 }} draggable={false} />
        </button>
      ))}
    </div>
  )
}

/** The right pane: the selected item's fields and its phone card side by side (stacked on a phone). */
export function ItemDetail({ row, index, total, onChange }: { row: EditorRow; index: number; total: number; onChange: (patch: Partial<EditorRow>) => void }) {
  const [lang, setLang] = useState<Lang>('hi')
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="grid gap-4">
        <Field label="Kind">
          <select className={inputClass} value={row.kind} onChange={(e) => onChange({ kind: e.target.value as ChecklistItemKind })}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="English"><input className={inputClass} value={row.textEn} onChange={(e) => onChange({ textEn: e.target.value })} maxLength={160} /></Field>
        <Field label="Hindi"><input className={inputClass} lang="hi" value={row.textHi} onChange={(e) => onChange({ textHi: e.target.value })} maxLength={160} /></Field>
        <Field label="Pictogram"><PictogramPicker value={row.pictogram} onChange={(pictogram) => onChange({ pictogram })} /></Field>
        {row.kind === 'measure' && (
          <>
            <Field label="Unit"><input className={inputClass} value={row.unit} onChange={(e) => onChange({ unit: e.target.value })} maxLength={12} placeholder="cm" /></Field>
            <Field label="Min"><input className={inputClass} type="number" step="0.01" inputMode="decimal" value={row.min} onChange={(e) => onChange({ min: e.target.value })} /></Field>
            <Field label="Max"><input className={inputClass} type="number" step="0.01" inputMode="decimal" value={row.max} onChange={(e) => onChange({ max: e.target.value })} /></Field>
          </>
        )}
      </div>
      <div className="grid content-start gap-3">
        <div className="flex items-center justify-between">
          <h3 className="hf-label" style={{ color: 'var(--hf-muted)' }}>On the phone</h3>
          <LangToggle lang={lang} onChange={setLang} />
        </div>
        <PhoneCard item={row} index={index} total={total} lang={lang} />
      </div>
    </div>
  )
}
