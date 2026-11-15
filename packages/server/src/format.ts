/** "45 min", "3 h 20 min", "2 d" — how long this piece has sat where it is. */
export const formatAge = (m: number) =>
  m < 60
    ? `${m} min`
    : m < 1440
      ? `${Math.floor(m / 60)} h ${m % 60} min`
      : `${Math.floor(m / 1440)} d`

/** Every time on screen is Kolkata wall-clock time; storage stays UTC. */
export const formatKolkata = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))

/**
 * Stage colours ARE the physical label stock: blue cutting, red pasting, yellow
 * stitching, green finishing. An operator holds the piece in one hand and the
 * phone in the other and matches the pill against the sticker — so these hues
 * are reserved. Oxblood is the interface accent and must never appear here.
 *
 * The values live in globals.css; this maps stage to token so the palette has
 * exactly one definition.
 */
export const STAGE_COLORS: Record<string, string> = {
  cutting: 'var(--hf-stage-cutting)',
  pasting: 'var(--hf-stage-pasting)',
  stitching: 'var(--hf-stage-stitching)',
  finishing: 'var(--hf-stage-finishing)',
  qc: 'var(--hf-stage-qc)',
  packaging: 'var(--hf-stage-packaging)',
}

/** Yellow stitching stock takes ink, not white — the rest take white. */
export const STAGE_TEXT: Record<string, string> = {
  stitching: 'var(--hf-ink)',
}

export const stageColor = (stage: string | null | undefined) =>
  (stage && STAGE_COLORS[stage]) || 'var(--hf-muted)'

export const stageTextColor = (stage: string | null | undefined) =>
  (stage && STAGE_TEXT[stage]) || '#ffffff'

/** `CUT_PENDING_QA` reads as "Cut pending QA" on a bench screen. */
/**
 * Words that stay shouted. `OK` matters as much as the others: an operator
 * reads "CUT OK" off the physical label stuck to the piece and looks for the
 * same words on screen. "Cut ok" makes them check twice.
 */
const SHOUTED = new Set(['qa', 'qc', 'ok'])

export const formatState = (state: string) => {
  const words = state.toLowerCase().split('_')
  return words
    .map((w, i) => (SHOUTED.has(w) ? w.toUpperCase() : i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** Event types are shouted in the database and spoken on screen. */
export const formatEventType = (type: string) => formatState(type)

/** Detail keys arrive camelCase from JSON; a human reads "Photo override reason". */
export const formatDetailKey = (key: string) => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced[0]!.toUpperCase() + spaced.slice(1)
}

/**
 * Detail values come out of a JSON column, so they are whatever the route put
 * there. `true` is a checkbox an operator ticked — it reads as Yes. An empty
 * array is not a finding and is dropped entirely by `detailEntries` below.
 */
export const formatDetailValue = (v: unknown): string => {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.join(', ')
  if (v !== null && typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * The detail rows worth showing: no nulls, no blanks, no empty lists. The
 * `checklist` key is skipped here — it is rendered as ticks by
 * `ChecklistAnswers`, not dumped as JSON alongside the other details.
 */
export const detailEntries = (details: unknown): Array<[string, unknown]> =>
  Object.entries((details ?? {}) as Record<string, unknown>).filter(
    ([k, v]) => k !== 'checklist' && v != null && v !== '' && !(Array.isArray(v) && v.length === 0),
  )

/** Serial numbers are printed four-wide on the label; match that on screen. */
export const formatSerial = (serial: number) => String(serial).padStart(4, '0')
