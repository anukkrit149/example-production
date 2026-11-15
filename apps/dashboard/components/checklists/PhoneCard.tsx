'use client'

export type Lang = 'en' | 'hi'
export type CardItem = { textEn: string; textHi: string; pictogram: string; kind: 'confirm' | 'photo' | 'materials' | 'measure'; unit?: string | null }

/** One phone screen, as the floor sees it: dots, pictogram, sentence, YES over NO. Static — the admin is checking wording, not answering. */
export function PhoneCard({ item, index, total, lang }: { item: CardItem; index: number; total: number; lang: Lang }) {
  return (
    <div className="mx-auto grid w-full max-w-[360px] gap-4 rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }} aria-label={`Phone preview ${index + 1} of ${total}`}>
      <div className="flex items-center justify-between">
        <span className="hf-label" style={{ color: 'var(--hf-muted)' }}>{index + 1} / {total}</span>
        <span aria-hidden className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => <span key={i} className="h-2 w-2 rounded-full" style={{ background: i <= index ? 'var(--hf-ink)' : 'var(--hf-line)' }} />)}
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- static, ink-on-transparent SVG asset */}
      <img src={`/pictograms/${item.pictogram}.svg`} alt="" width={160} height={160} className="mx-auto" style={{ width: 160, height: 160 }} />
      <p className="text-xl font-semibold leading-snug" lang={lang}>{lang === 'hi' ? item.textHi || '…' : item.textEn || '…'}</p>
      {(item.kind === 'photo' || item.kind === 'materials' || item.kind === 'measure') && (
        <p className="text-xs uppercase" style={{ color: 'var(--hf-muted)' }}>
          {item.kind === 'photo' ? (lang === 'hi' ? 'फ़ोटो ज़रूरी' : 'photo required')
            : item.kind === 'materials' ? (lang === 'hi' ? 'सामान की सूची' : 'materials list')
              : (lang === 'hi' ? 'माप' : 'measurement')}
        </p>
      )}
      {item.kind === 'measure' ? (
        <div className="grid gap-2">
          <div className="hf-ui flex h-16 items-center justify-center gap-2 rounded-xl border text-xl" style={{ borderColor: 'var(--hf-line)' }}>
            <input type="number" disabled className="w-20 bg-transparent text-center text-xl" style={{ color: 'var(--hf-ink)' }} />
            <span style={{ color: 'var(--hf-muted)' }}>{item.unit || '—'}</span>
          </div>
          <div className="hf-ui flex h-12 items-center justify-center rounded-xl text-base uppercase" style={{ background: 'var(--hf-stage-finishing)', color: '#fff' }}>{lang === 'hi' ? 'आगे' : 'Next'}</div>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="hf-ui flex h-16 items-center justify-center rounded-xl text-xl uppercase" style={{ background: 'var(--hf-stage-finishing)', color: '#fff' }}>{lang === 'hi' ? 'हाँ' : 'YES'}</div>
          <div className="hf-ui flex h-12 items-center justify-center rounded-xl border text-base uppercase" style={{ borderColor: 'var(--hf-line)' }}>{lang === 'hi' ? 'नहीं' : 'NO'}</div>
        </div>
      )}
    </div>
  )
}

export function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const btn = (l: Lang, label: string) => (
    <button type="button" onClick={() => onChange(l)} aria-pressed={lang === l} className="hf-ui px-3 py-1 text-xs uppercase" style={lang === l ? { background: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' } : { background: 'var(--hf-card)' }}>{label}</button>
  )
  return <div className="flex overflow-hidden rounded-md border" style={{ borderColor: 'var(--hf-line)' }}>{btn('hi', 'हिं')}{btn('en', 'EN')}</div>
}
