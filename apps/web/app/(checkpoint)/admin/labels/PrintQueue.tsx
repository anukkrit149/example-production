'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { labelInputFrom, labelRow, STAGE_COLOR, STAGE_TEMPLATE, STAGE_TEXT, type LabelStage } from '@hf/labels'
import { LabelPreview } from '@/components/LabelPreview'
import { formatKolkata, formatSerial, stageColor, stageTextColor } from '@hf/server/format'
import type { PendingLabel } from '@hf/server'
import { useT } from '@/lib/i18n/useT'

/**
 * Prisma's enum cannot start with a digit, so the column holds `t50x25` /
 * `t50x50` while `@hf/labels` speaks the bare `50x25` / `50x50` the preview and
 * the WePrint templates use. The row's own `template` is the authority here —
 * it is what was written when the label was requested — and this is the one
 * place the two spellings meet.
 */
const TEMPLATE_OF: Record<string, '50x25' | '50x50'> = { t50x25: '50x25', t50x50: '50x50' }

/**
 * What stock this label actually goes on.
 *
 * The stored value wins over `STAGE_TEMPLATE`: a reprint requested last month
 * carries the template it was requested with, and the preview has to show the
 * stock the operator is about to load, not what the current mapping would pick.
 * The stage mapping is only the fallback for a value the enum has since grown.
 */
const templateFor = (l: PendingLabel, stage: LabelStage) =>
  TEMPLATE_OF[l.template] ?? STAGE_TEMPLATE[stage]

/**
 * Stages that actually get a sticker. `qc` and `packaging` have no label stock,
 * so a row at one of those stages could never be previewed or exported; the
 * queue only ever holds these four, but the narrowing has to be explicit
 * because `PendingLabel.stage` is the full six-value `Stage` (or null, for a
 * planned row).
 */
const LABEL_STAGES: LabelStage[] = ['cutting', 'pasting', 'stitching', 'finishing']

const isLabelStage = (s: string | null): s is LabelStage => (LABEL_STAGES as string[]).includes(s ?? '')

const toggleIn = (set: ReadonlySet<string>, id: string) => {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

const BTN =
  'hf-ui flex min-h-14 flex-1 items-center justify-center rounded-lg border-2 px-4 text-base uppercase disabled:opacity-50'

type Note = { kind: 'ok' | 'error'; text: string }
type QueueKind = 'planned' | 'stage'

/**
 * Select, export, print, confirm.
 *
 * The whole screen is built around one rule: a label on the wrong piece is
 * worse than no label. So selection is per stage and never crosses stages (the
 * export endpoint takes a single stage and refuses a mixed set), the preview
 * shows the sticker at true physical size before anything is committed, and the
 * batch stays un-marked until the operator confirms the printer really produced
 * it. Nothing is stamped printed just because a file was downloaded.
 *
 * WePrint runs on Android as well as the iPad, so the download buttons are
 * always shown — there is no viewport check hiding them on a phone.
 */
export function PrintQueue({ planned, stage: stageLabels }: { planned: PendingLabel[]; stage: PendingLabel[] }) {
  const router = useRouter()
  const { t } = useT()

  const [kind, setKind] = useState<QueueKind>('planned')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [previewing, setPreviewing] = useState<ReadonlySet<string>>(new Set())
  const [batch, setBatch] = useState<{ id: string; count: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note | null>(null)

  const labels = kind === 'planned' ? planned : stageLabels

  /**
   * Grouped by stage and kept in stage order, not in whatever order the rows
   * arrived. An operator loads one colour of stock at a time; the screen has to
   * match the physical routine of loading blue, printing every blue label, then
   * changing the roll. Only relevant for the stage tab — planned rows have no
   * stage yet and are shown as one group.
   */
  const byStage = useMemo(() => {
    const m = new Map<LabelStage, PendingLabel[]>()
    for (const s of LABEL_STAGES) {
      const rows = stageLabels.filter((l) => l.stage === s)
      if (rows.length) m.set(s, rows)
    }
    return m
  }, [stageLabels])

  /** Rows at a stage with no label stock — should never happen, but must not vanish silently. */
  const unlabellable = useMemo(() => stageLabels.filter((l) => !isLabelStage(l.stage)), [stageLabels])

  /**
   * The print date on the sticker is the date it is being printed. Fixed once
   * per mount so a queue left open across midnight does not show one date in
   * the preview and write another into the file.
   */
  const printDate = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const exportSelected = useCallback(
    async (rows: PendingLabel[], tag: string, stageArg: string | undefined, format: 'csv' | 'xlsx') => {
      const ids = rows.filter((l) => selected.has(l.id)).map((l) => l.id)
      if (ids.length === 0) {
        setNote({ kind: 'error', text: t('tick_one_first', { tag }) })
        return
      }
      setBusy(true)
      setNote(null)
      let res: Response
      try {
        res = await fetch('/api/print-queue/export', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ format, kind, stage: stageArg, labelIds: ids }),
        })
      } catch {
        setBusy(false)
        setNote({ kind: 'error', text: t('network') })
        return
      }
      if (!res.ok) {
        setBusy(false)
        setNote({
          kind: 'error',
          text: res.status === 422 ? t('export_conflict') : t('export_failed'),
        })
        return
      }

      const batchId = res.headers.get('x-export-batch-id')
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `labels-${tag}-${printDate}.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revoked on the next tick: Safari on the iPad has not finished reading
      // the blob when click() returns, and an early revoke gives a 0-byte file.
      setTimeout(() => URL.revokeObjectURL(href), 30_000)

      setBusy(false)
      // Selection is cleared here: those rows are now stamped to a batch and
      // re-exporting them would be refused. Keeping them ticked invites a
      // second click that only produces an error.
      setSelected(new Set())
      if (batchId) setBatch({ id: batchId, count: ids.length })
      setNote({
        kind: 'ok',
        text: t('export_ok', { n: ids.length, tag, plural: ids.length === 1 ? '' : 's' }),
      })
    },
    [kind, printDate, selected, t],
  )

  const markPrinted = useCallback(async () => {
    if (!batch) return
    setBusy(true)
    setNote(null)
    let res: Response
    try {
      res = await fetch(`/api/print-queue/${batch.id}/printed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ copies: 1 }),
      })
    } catch {
      setBusy(false)
      setNote({ kind: 'error', text: t('network') })
      return
    }
    setBusy(false)
    if (res.ok) {
      setBatch(null)
      setPreviewing(new Set())
      setNote({ kind: 'ok', text: t('mark_printed_ok') })
      router.refresh()
      return
    }
    if (res.status === 409) {
      setBatch(null)
      setNote({ kind: 'error', text: t('mark_printed_conflict') })
      router.refresh()
      return
    }
    setNote({ kind: 'error', text: t('mark_printed_failed') })
  }, [batch, router, t])

  const renderRow = (l: PendingLabel, labelStage: LabelStage, color: 'white' | 'blue' | 'red' | 'yellow' | 'green') => {
    const row = labelRow(labelInputFrom(l, printDate))
    const open = previewing.has(l.id)
    const rowTemplate = templateFor(l, labelStage)

    return (
      <li
        key={l.id}
        className="rounded-xl border p-3"
        style={{
          borderColor: selected.has(l.id) ? 'var(--hf-oxblood-lit)' : 'var(--hf-line)',
          background: 'var(--hf-card)',
        }}
      >
        <div className="flex items-start gap-3">
          <label className="flex min-h-11 flex-1 items-start gap-3">
            <input
              type="checkbox"
              checked={selected.has(l.id)}
              onChange={() => setSelected((s) => toggleIn(s, l.id))}
              className="mt-1 h-6 w-6 shrink-0"
              style={{ accentColor: 'var(--hf-oxblood-lit)' }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold">
                {l.styleCode} · {l.size} · {l.shade}
              </span>
              <span className="block font-mono text-base" style={{ color: 'var(--hf-muted)' }}>
                #{formatSerial(l.serial)} · {l.qrToken}
              </span>
              <span className="block text-base" style={{ color: 'var(--hf-muted)' }}>
                {formatKolkata(l.requestedAt)}
              </span>
              {/*
                A reprint is the interesting row on this screen — it means a
                sticker already failed once — so it is called out in the
                interface accent rather than buried in grey.
              */}
              {l.reprintReason && (
                <span
                  className="hf-ui mt-1 block text-[11px] uppercase"
                  style={{ color: 'var(--hf-oxblood-deep)' }}
                >
                  Reprint · {l.reprintReason}
                </span>
              )}
            </span>
          </label>

          <button
            type="button"
            onClick={() => setPreviewing((p) => toggleIn(p, l.id))}
            aria-expanded={open}
            className="hf-ui min-h-11 shrink-0 rounded-lg border-2 px-3 text-[11px] uppercase"
            style={{ borderColor: 'var(--hf-line)', color: 'var(--hf-ink)' }}
          >
            {open ? 'Hide' : 'Preview'}
          </button>
        </div>

        {open && (
          <div className="mt-3 grid gap-2">
            <p className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>
              Actual size {rowTemplate} mm
            </p>
            {/*
              Scrolls rather than shrinks. A 50 mm box is wider than a 390 px
              phone once the card padding is taken out, and scaling it down
              would destroy the only thing this view is for — holding the
              screen against the real stock.
            */}
            <div className="-mx-1 overflow-x-auto px-1 py-1">
              <LabelPreview row={row} template={rowTemplate} color={color} />
            </div>
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="grid gap-6">
      {/* Planned | Stage. Selection does not carry across tabs — the export
          endpoint takes one kind at a time, and mixing planned and stage rows
          into one tick set would only produce a refused export. */}
      <div className="hf-ui flex gap-2 text-[11px] uppercase" role="tablist" aria-label="Label kind">
        {(['planned', 'stage'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k)
              setSelected(new Set())
              setNote(null)
            }}
            className="min-h-11 flex-1 rounded-lg border-2 px-3"
            style={{
              borderColor: kind === k ? 'var(--hf-oxblood-lit)' : 'var(--hf-line)',
              background: kind === k ? 'var(--hf-oxblood-lit)' : 'var(--hf-card)',
              color: kind === k ? 'var(--hf-paper)' : 'var(--hf-ink)',
            }}
          >
            {k === 'planned' ? t('labels_kind_planned') : t('labels_kind_stage')}
          </button>
        ))}
      </div>

      {labels.length === 0 && (
        <p className="text-lg" style={{ color: 'var(--hf-muted)' }}>
          {kind === 'planned' ? t('labels_empty_planned') : t('labels_empty_stage')}
        </p>
      )}

      {kind === 'planned' && planned.length > 0 && (
        <section className="grid gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="flex items-baseline gap-2">
              <span
                className="hf-ui rounded px-2 py-1 text-xs uppercase"
                style={{ background: 'var(--hf-card)', color: 'var(--hf-ink)', border: '1px solid var(--hf-line)' }}
              >
                {t('labels_planned')}
              </span>
              <span className="text-base" style={{ color: 'var(--hf-muted)' }}>
                {planned.length} · 50x25 mm
              </span>
            </h2>

            <label className="hf-ui flex min-h-11 items-center gap-2 text-[11px] uppercase">
              <input
                type="checkbox"
                checked={selected.size === planned.length}
                onChange={(e) => {
                  const on = e.target.checked
                  setSelected((s) => {
                    const next = new Set(s)
                    for (const r of planned) {
                      if (on) next.add(r.id)
                      else next.delete(r.id)
                    }
                    return next
                  })
                }}
                className="h-6 w-6"
                style={{ accentColor: 'var(--hf-oxblood-lit)' }}
              />
              All
            </label>
          </div>

          <ul className="grid gap-2">{planned.map((l) => renderRow(l, 'planned', 'white'))}</ul>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => exportSelected(planned, 'planned', undefined, 'csv')}
              disabled={busy || selected.size === 0}
              className={BTN}
              style={{ background: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)', borderColor: 'var(--hf-oxblood-lit)' }}
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => exportSelected(planned, 'planned', undefined, 'xlsx')}
              disabled={busy || selected.size === 0}
              className={BTN}
              style={{ background: 'var(--hf-card)', color: 'var(--hf-ink)', borderColor: 'var(--hf-line)' }}
            >
              Download XLSX
            </button>
          </div>
        </section>
      )}

      {kind === 'stage' &&
        [...byStage.entries()].map(([s, rows]) => {
          const template = STAGE_TEMPLATE[s]
          const chosen = rows.filter((l) => selected.has(l.id)).length
          const allChosen = chosen === rows.length

          return (
            <section key={s} className="grid gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="flex items-baseline gap-2">
                  <span
                    className="hf-ui rounded px-2 py-1 text-xs uppercase"
                    style={{ background: stageColor(s), color: stageTextColor(s) }}
                  >
                    {STAGE_TEXT[s]}
                  </span>
                  <span className="text-base" style={{ color: 'var(--hf-muted)' }}>
                    {rows.length} · {template} mm
                  </span>
                </h2>

                {/*
                  A whole-stage tick, because the common move is "print every
                  blue label on the roll". Sized as a real target, not a 13 px
                  default.
                */}
                <label className="hf-ui flex min-h-11 items-center gap-2 text-[11px] uppercase">
                  <input
                    type="checkbox"
                    checked={allChosen}
                    onChange={(e) => {
                      const on = e.target.checked
                      setSelected((sel) => {
                        const next = new Set(sel)
                        for (const r of rows) {
                          if (on) next.add(r.id)
                          else next.delete(r.id)
                        }
                        return next
                      })
                    }}
                    className="h-6 w-6"
                    style={{ accentColor: 'var(--hf-oxblood-lit)' }}
                  />
                  All
                </label>
              </div>

              <ul className="grid gap-2">{rows.map((l) => renderRow(l, s, STAGE_COLOR[s]))}</ul>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => exportSelected(rows, s, s, 'csv')}
                  disabled={busy || chosen === 0}
                  className={BTN}
                  style={{
                    background: 'var(--hf-oxblood-lit)',
                    color: 'var(--hf-paper)',
                    borderColor: 'var(--hf-oxblood-lit)',
                  }}
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={() => exportSelected(rows, s, s, 'xlsx')}
                  disabled={busy || chosen === 0}
                  className={BTN}
                  style={{
                    background: 'var(--hf-card)',
                    color: 'var(--hf-ink)',
                    borderColor: 'var(--hf-line)',
                  }}
                >
                  Download XLSX
                </button>
              </div>
            </section>
          )
        })}

      {kind === 'stage' && unlabellable.length > 0 && (
        <p className="text-base" style={{ color: 'var(--hf-oxblood-deep)' }}>
          {unlabellable.length} queued label
          {unlabellable.length === 1 ? ' has a stage' : 's have stages'} with no label stock. Tell a
          supervisor — they cannot be printed from here.
        </p>
      )}

      {batch && (
        <div
          className="grid gap-2 rounded-xl border-2 p-3"
          style={{ borderColor: 'var(--hf-oxblood-lit)', background: 'var(--hf-card)' }}
        >
          <p className="text-base">
            Batch of {batch.count} downloaded. Only mark it printed once the labels are actually out
            of the printer.
          </p>
          <button
            type="button"
            onClick={markPrinted}
            disabled={busy}
            className="hf-ui flex min-h-14 items-center justify-center rounded-lg border-2 px-4 text-base uppercase disabled:opacity-50"
            style={{
              background: 'var(--hf-oxblood-lit)',
              color: 'var(--hf-paper)',
              borderColor: 'var(--hf-oxblood-lit)',
            }}
          >
            {busy ? t('saving') : t('mark_printed')}
          </button>
        </div>
      )}

      {note && (
        <p
          aria-live="polite"
          className="text-base font-semibold"
          style={{ color: note.kind === 'error' ? 'var(--hf-oxblood-deep)' : 'var(--hf-muted)' }}
        >
          {note.text}
        </p>
      )}
    </div>
  )
}
