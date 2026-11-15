'use client'
import type { SuggestOutput } from '@hf/contracts'

export type ItemRow = { id: string; code: string; nameEn: string; nameHi: string; unit: string }
export type PhotoPurpose = 'goods' | 'place' | 'document'

/** Ask the server what it sees in a confirmed photo. Any failure is "no suggestion" — the form never blocks on this. */
export async function suggest(attachmentId: string, kind: 'goods' | 'document'): Promise<SuggestOutput> {
  try {
    const res = await fetch('/api/inventory/suggest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attachmentId, kind }) })
    if (!res.ok) return { available: false }
    return (await res.json()) as SuggestOutput
  } catch {
    return { available: false }
  }
}
