import { describe, expect, it } from 'vitest'
import {
  BADGE_BODY_LENGTH,
  BADGE_PREFIX,
  badgeSignInUrl,
  badgeTokenFrom,
  isBadgeToken,
  normalizeBadgeToken,
} from './badge-token'
import { generateQrToken, normalizeQrToken } from './qr-token'

const BODY = 'ABCDEFGHJKLMNPQRSTUVWX'.slice(0, BADGE_BODY_LENGTH).padEnd(BADGE_BODY_LENGTH, '2')
const TOKEN = BADGE_PREFIX + BODY

describe('badge token', () => {
  it('normalizes case, whitespace and missing hyphens to one form', () => {
    expect(normalizeBadgeToken(TOKEN)).toBe(TOKEN)
    expect(normalizeBadgeToken(TOKEN.toLowerCase())).toBe(TOKEN)
    expect(normalizeBadgeToken(`  ${TOKEN}  `)).toBe(TOKEN)
    expect(normalizeBadgeToken(`HFW${BODY}`)).toBe(TOKEN)
    expect(normalizeBadgeToken(`HF-W${BODY}`)).toBe(TOKEN)
    expect(isBadgeToken(TOKEN)).toBe(true)
  })

  it('rejects ambiguous characters and wrong shapes', () => {
    expect(normalizeBadgeToken('')).toBeNull()
    expect(normalizeBadgeToken(BODY)).toBeNull()
    expect(normalizeBadgeToken(`${BADGE_PREFIX}${BODY.slice(1)}`)).toBeNull()
    expect(normalizeBadgeToken(`${BADGE_PREFIX}${BODY}X`)).toBeNull()
    expect(normalizeBadgeToken(`${BADGE_PREFIX}${'0'.repeat(BADGE_BODY_LENGTH)}`)).toBeNull()
  })

  it('is disjoint from the piece token in both directions', () => {
    // The two scanners share one camera. A card must never read as a piece, and
    // a label must never read as a credential.
    expect(normalizeQrToken(TOKEN)).toBeNull()
    expect(normalizeBadgeToken(generateQrToken())).toBeNull()
  })

  it('puts the token in the fragment, where no server log can reach it', () => {
    expect(badgeSignInUrl('https://hf.example.com', TOKEN)).toBe(
      `https://hf.example.com/badge#${TOKEN}`,
    )
    // A trailing slash on the configured origin must not double up.
    expect(badgeSignInUrl('https://hf.example.com/', TOKEN)).toBe(
      `https://hf.example.com/badge#${TOKEN}`,
    )
    expect(badgeSignInUrl('https://hf.example.com///', TOKEN)).toBe(
      `https://hf.example.com/badge#${TOKEN}`,
    )
  })

  it('reads a token back out of a bare token or a whole scanned URL', () => {
    expect(badgeTokenFrom(TOKEN)).toBe(TOKEN)
    expect(badgeTokenFrom(badgeSignInUrl('https://hf.example.com', TOKEN))).toBe(TOKEN)
    expect(badgeTokenFrom(`https://hf.example.com/badge#${TOKEN.toLowerCase()}`)).toBe(TOKEN)
    expect(badgeTokenFrom('https://hf.example.com/pieces/HF-P-K7M29QRX')).toBeNull()
    expect(badgeTokenFrom(generateQrToken())).toBeNull()
  })
})
