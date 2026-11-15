import { DocumentSuggestionSchema, GoodsSuggestionSchema, type SuggestOutput } from '@hf/contracts'

/**
 * Photo → suggestion, through the Gemini API over plain fetch.
 *
 * This module never writes anything and never throws: the phone shows what
 * comes back as pre-ticked chips and prefilled numbers, a person confirms, and
 * only the confirm reaches the database. Every failure — no key, network,
 * quota, a reply that is not the JSON we asked for — is `{ available: false }`
 * and the form simply has nothing prefilled.
 *
 * `generateContent` with `responseMimeType: application/json` and a
 * `responseSchema` is what makes the reply parseable; the item codes still get
 * matched against our own list afterwards because the model may spell one
 * differently or invent one.
 */

export type VisionItem = { code: string; nameEn: string; nameHi: string }

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
export const GEMINI_ENDPOINT = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

export const visionAvailable = (env: NodeJS.ProcessEnv = process.env): boolean => Boolean(env.GOOGLE_API_KEY)

const GOODS_SCHEMA = {
  type: 'OBJECT',
  properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { code: { type: 'STRING' }, confidence: { type: 'NUMBER' } }, required: ['code', 'confidence'] } } },
  required: ['items'],
}
const DOCUMENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    supplier: { type: 'STRING', nullable: true }, reference: { type: 'STRING', nullable: true }, date: { type: 'STRING', nullable: true },
    lines: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      text: { type: 'STRING' }, quantity: { type: 'INTEGER', nullable: true }, code: { type: 'STRING', nullable: true }, confidence: { type: 'NUMBER' },
    }, required: ['text', 'quantity', 'code', 'confidence'] } },
  },
  required: ['supplier', 'reference', 'date', 'lines'],
}

const itemList = (items: VisionItem[]) => items.map((i) => `- ${i.code}: ${i.nameEn} / ${i.nameHi}`).join('\n')

const prompt = (kind: 'goods' | 'document', items: VisionItem[]) =>
  kind === 'goods'
    ? `This is a photo of goods just delivered to a leather garment factory store room. Which of these store items are visible? Answer with the item codes from this list only, each with a confidence between 0 and 1. Leave out anything not clearly visible.\n${itemList(items)}`
    : `This is a photo of a supplier's delivery receipt or challan for a leather garment factory. Read it. Return the supplier name, the receipt/challan number, the date as YYYY-MM-DD if printed, and one line per item row with the row text, its quantity as an integer (null if unreadable), the best matching code from this list (null if none fits), and a confidence between 0 and 1.\n${itemList(items)}`

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** The model's code, folded onto ours: case-insensitive exact match, else null. */
function matchCode(code: string | null, items: VisionItem[]): string | null {
  if (!code) return null
  const hit = items.find((i) => i.code.toUpperCase() === code.trim().toUpperCase())
  return hit ? hit.code : null
}

export async function suggestFromPhoto(a: {
  kind: 'goods' | 'document'
  image: { base64: string; mime: string }
  items: VisionItem[]
  fetchImpl?: typeof fetch
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}): Promise<SuggestOutput> {
  const env = a.env ?? process.env
  const key = env.GOOGLE_API_KEY
  if (!key) return { available: false }
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
  const doFetch = a.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), a.timeoutMs ?? 8000)
  try {
    const res = await doFetch(GEMINI_ENDPOINT(model), {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType: a.image.mime, data: a.image.base64 } }, { text: prompt(a.kind, a.items) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: a.kind === 'goods' ? GOODS_SCHEMA : DOCUMENT_SCHEMA, temperature: 0 },
      }),
    })
    if (!res.ok) return { available: false }
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    const parsed: unknown = JSON.parse(text)
    if (a.kind === 'goods') {
      const g = GoodsSuggestionSchema.safeParse(normaliseGoods(parsed))
      if (!g.success) return { available: false }
      const items = g.data.items.flatMap((i) => { const code = matchCode(i.code, a.items); return code ? [{ code, confidence: i.confidence }] : [] })
      return { available: true, kind: 'goods', items }
    }
    const d = DocumentSuggestionSchema.safeParse(normaliseDocument(parsed))
    if (!d.success) return { available: false }
    return { available: true, kind: 'document', document: { ...d.data, lines: d.data.lines.map((l) => ({ ...l, code: matchCode(l.code, a.items) })) } }
  } catch (e) {
    console.warn('inventory vision unavailable:', e instanceof Error ? e.message : e)
    return { available: false }
  } finally {
    clearTimeout(timer)
  }
}

/** Clamp confidences before schema validation so an over-eager 1.7 does not reject the whole answer. */
function normaliseGoods(v: unknown): unknown {
  if (!v || typeof v !== 'object' || !Array.isArray((v as { items?: unknown }).items)) return v
  return { items: (v as { items: Array<Record<string, unknown>> }).items.map((i) => ({ ...i, confidence: typeof i.confidence === 'number' ? clamp01(i.confidence) : i.confidence })) }
}
function normaliseDocument(v: unknown): unknown {
  if (!v || typeof v !== 'object' || !Array.isArray((v as { lines?: unknown }).lines)) return v
  const o = v as Record<string, unknown> & { lines: Array<Record<string, unknown>> }
  return {
    supplier: o.supplier ?? null, reference: o.reference ?? null, date: o.date ?? null,
    lines: o.lines.map((l) => ({ text: l.text ?? '', quantity: typeof l.quantity === 'number' ? Math.max(0, Math.round(l.quantity)) : null, code: l.code ?? null, confidence: typeof l.confidence === 'number' ? clamp01(l.confidence) : 0 })),
  }
}
