import { describe, expect, it, vi } from 'vitest'
import { suggestFromPhoto, visionAvailable, type VisionItem } from './inventory-vision'

vi.spyOn(console, 'warn').mockImplementation(() => {})

const items: VisionItem[] = [
  { code: 'ZIP', nameEn: 'Zip', nameHi: 'ज़िप' },
  { code: 'WASH-LBL', nameEn: 'Wash-care label', nameHi: 'वॉश लेबल' },
  { code: 'PO-LBL', nameEn: 'PO label', nameHi: 'PO लेबल' },
]
const env = { GOOGLE_API_KEY: 'test-key' } as NodeJS.ProcessEnv
const image = { base64: 'AAAA', mime: 'image/jpeg' }

/** A fetch that answers every call with one Gemini-shaped body (or a status), and records what it was sent. */
function fakeFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const text = typeof body === 'string' ? body : JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] })
    return new Response(text, { status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('inventory vision', () => {
  it('is unavailable without a key, and says so instead of calling out', async () => {
    expect(visionAvailable({} as NodeJS.ProcessEnv)).toBe(false)
    const f = fakeFetch({ items: [] })
    expect(await suggestFromPhoto({ kind: 'goods', image, items, fetchImpl: f.impl, env: {} as NodeJS.ProcessEnv })).toEqual({ available: false })
    expect(f.calls).toHaveLength(0)
  })

  it('goods: sends the item list and the inline image, keeps only known codes, clamps confidence', async () => {
    const f = fakeFetch({ items: [{ code: 'ZIP', confidence: 0.93 }, { code: 'BUTTON', confidence: 0.9 }, { code: 'po-lbl', confidence: 1.7 }] })
    const out = await suggestFromPhoto({ kind: 'goods', image, items, fetchImpl: f.impl, env })
    expect(out).toEqual({ available: true, kind: 'goods', items: [{ code: 'ZIP', confidence: 0.93 }, { code: 'PO-LBL', confidence: 1 }] })
    expect(f.calls[0]!.url).toContain('gemini-3.8-flash:generateContent')
    expect((f.calls[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key')
    const sent = JSON.parse(f.calls[0]!.init.body as string)
    expect(JSON.stringify(sent.contents)).toContain('WASH-LBL')
    expect(sent.contents[0].parts.some((p: { inlineData?: { data: string } }) => p.inlineData?.data === 'AAAA')).toBe(true)
    expect(sent.generationConfig.responseMimeType).toBe('application/json')
  })

  it('document: returns supplier, reference and lines with codes matched to the item list', async () => {
    const f = fakeFetch({ supplier: 'Rex Zips Pvt Ltd', reference: 'DC-1182', date: '2026-09-04', lines: [
      { text: 'YKK #5 zip black 60cm', quantity: 500, code: 'ZIP', confidence: 0.9 },
      { text: 'Care label woven', quantity: 200, code: 'wash-lbl', confidence: 0.7 },
      { text: 'Poly bags', quantity: 1000, code: 'BAG', confidence: 0.4 },
    ] })
    const out = await suggestFromPhoto({ kind: 'document', image, items, fetchImpl: f.impl, env })
    expect(out.available).toBe(true)
    if (!out.available || out.kind !== 'document') throw new Error('shape')
    expect(out.document.supplier).toBe('Rex Zips Pvt Ltd')
    expect(out.document.lines.map((l) => [l.code, l.quantity])).toEqual([['ZIP', 500], ['WASH-LBL', 200], [null, 1000]])
  })

  it('an HTTP error, a non-JSON answer, or an answer off-schema all degrade to unavailable', async () => {
    expect(await suggestFromPhoto({ kind: 'goods', image, items, fetchImpl: fakeFetch({ error: 'quota' }, 429).impl, env })).toEqual({ available: false })
    expect(await suggestFromPhoto({ kind: 'goods', image, items, fetchImpl: fakeFetch('not json at all').impl, env })).toEqual({ available: false })
    expect(await suggestFromPhoto({ kind: 'document', image, items, fetchImpl: fakeFetch({ items: [] }).impl, env })).toEqual({ available: false })
  })

  it('gives up after the timeout', async () => {
    const never = ((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch
    expect(await suggestFromPhoto({ kind: 'goods', image, items, fetchImpl: never, env, timeoutMs: 20 })).toEqual({ available: false })
  })
})
