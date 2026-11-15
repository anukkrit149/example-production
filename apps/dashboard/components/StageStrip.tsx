import Link from 'next/link'
import { STAGES, type StageCounts } from '@hf/domain'
import { stageColor, stageTextColor } from '@hf/server/format'
import { piecesHref, type PieceScope } from '@/lib/links'

const SHORT: Record<string, string> = { cutting: 'cut', pasting: 'pst', stitching: 'sti', finishing: 'fin', qc: 'qc', packaging: 'pck' }

/**
 * Six cells in production order, coloured with the label stock — blue, red,
 * yellow, green, then indigo for QC and dark for packaging — each a link to the
 * pieces it counts. Three grey cells follow for the exceptions. Oxblood never
 * appears here.
 */
export function StageStrip({ counts, ordered, scope, compact = false }: { counts: StageCounts; ordered: number; scope: PieceScope; compact?: boolean }) {
  const pct = (n: number) => (ordered > 0 ? Math.min(100, Math.round((n / ordered) * 100)) : 0)
  const cell = compact ? 'h-9 min-w-[34px] px-1 text-[11px]' : 'h-10 min-w-[72px] px-2 text-sm md:min-w-[84px]'
  return (
    <div className={`flex flex-wrap items-stretch ${compact ? 'gap-0.5' : 'gap-1'}`}>
      {STAGES.map((stage) => (
        <Link
          key={stage}
          href={piecesHref(scope, { atOrPast: stage })}
          title={`${stage}: ${counts[stage]} of ${ordered}`}
          aria-label={compact ? `${stage}: ${counts[stage]} of ${ordered}` : undefined}
          className={`relative flex ${cell} flex-1 flex-col justify-center overflow-hidden rounded border`}
          style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}
        >
          <span className="absolute inset-y-0 left-0" style={{ width: `${pct(counts[stage])}%`, background: stageColor(stage), opacity: 0.9 }} />
          <span className="hf-num relative z-10 font-semibold" style={{ color: pct(counts[stage]) > 55 ? stageTextColor(stage) : 'var(--hf-ink)' }}>
            {counts[stage]}{!compact && <span className="font-normal opacity-70"> / {ordered}</span>}
          </span>
          {/* The fill runs the width of the cell, so a bare label sits *on* the
              stage colour and is unreadable the moment a stage is more than
              half done — "cutting" reads as "cu…ing". A paper-backed chip
              punches the label back out of the fill (D6). The chip is
              `self-start` so it hugs the word rather than stretching a paper
              band across the whole cell. The compact strip is unchanged: its
              cells are too small for a chip and its labels are three letters. */}
          {!compact && (
            <span
              className="hf-label relative z-10 self-start rounded px-1 text-[11px]"
              style={{ background: 'var(--hf-card)', color: 'var(--hf-muted)' }}
            >
              {stage}
            </span>
          )}
          {compact && <span className="hf-label relative z-10 text-[11px]" style={{ color: 'var(--hf-muted)' }}>{SHORT[stage]}</span>}
        </Link>
      ))}
      {(
        [
          ['rejected', 'REJECTED', counts.rejected, 'rej'],
          ['on hold', 'ON_HOLD', counts.onHold, 'hold'],
          ['cancelled', 'CANCELLED', counts.cancelled, 'canc'],
        ] as const
      )
        .filter(([, , n]) => !compact || n > 0)
        .map(([label, state, n, short]) => (
          <Link
            key={state}
            href={piecesHref(scope, { state })}
            title={`${label}: ${n}`}
            aria-label={compact ? `${label}: ${n}` : undefined}
            className={`flex ${cell} flex-col justify-center rounded border`}
            style={{ borderColor: 'var(--hf-line)', color: n > 0 ? 'var(--hf-ink)' : 'var(--hf-muted)', background: n > 0 ? 'var(--hf-line)' : 'transparent' }}
          >
            <span className="hf-num font-semibold">{n}</span>
            {!compact && <span className="hf-label text-[11px]" style={{ color: 'var(--hf-muted)' }}>{label}</span>}
            {compact && <span className="hf-label text-[11px]" style={{ color: 'var(--hf-muted)' }}>{short}</span>}
          </Link>
        ))}
    </div>
  )
}
