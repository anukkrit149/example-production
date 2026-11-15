export const QR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const RE = new RegExp(`^HF-P-[${QR_ALPHABET}]{8}$`)

export function generateQrToken(random: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += QR_ALPHABET.charAt(Math.floor(random() * QR_ALPHABET.length))
  return `HF-P-${s}`
}
export function normalizeQrToken(input: string): string | null {
  const t = input.trim().toUpperCase()
  return RE.test(t) ? t : null
}
export const isQrToken = (s: string) => normalizeQrToken(s) !== null
