import { beforeEach, describe, expect, it } from 'vitest'
import { BADGE_BODY_LENGTH, BADGE_PREFIX, normalizeBadgeToken } from '@hf/domain'
import {
  __resetRateLimit,
  BADGE_RATE_LIMIT_MAX,
  badgeLimiter,
  CODE_ALPHABET,
  generateBadgeToken,
  isRateLimited,
  normaliseCode,
  RATE_LIMIT_MAX,
  recordFailure,
} from './operator-code'

beforeEach(() => {
  __resetRateLimit()
})

describe('badge tokens', () => {
  it('are the prefix plus 24 characters of the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const token = generateBadgeToken()
      expect(token.startsWith(BADGE_PREFIX)).toBe(true)
      expect(token).toHaveLength(BADGE_PREFIX.length + BADGE_BODY_LENGTH)
      expect(token.slice(BADGE_PREFIX.length)).toMatch(
        new RegExp(`^[${CODE_ALPHABET}]{${BADGE_BODY_LENGTH}}$`),
      )
    }
  })

  it('are unique across a run', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateBadgeToken()))
    expect(seen.size).toBe(200)
  })

  it('and a typed code are never the same string, so never the same hash', () => {
    // The two secrets share one table and one unique index on the hash, so what
    // keeps a badge from being accepted at the code screen is that the two
    // normalisers cannot produce the same string. The code screen strips the
    // hyphens a badge is hashed with, leaving something that matches no row.
    const token = generateBadgeToken()
    expect(normaliseCode(token)).not.toBe(token)

    // And nothing the code screen accepts is a badge: a code is eight
    // characters, a badge body is twenty-four.
    expect(normalizeBadgeToken('K7M2-9QRX')).toBeNull()
    expect(normalizeBadgeToken(normaliseCode('K7M2-9QRX'))).toBeNull()
  })
})

describe('rate limit buckets', () => {
  it('a code lockout leaves the badge door open', () => {
    const ip = '203.0.113.10'
    for (let i = 0; i < RATE_LIMIT_MAX; i++) recordFailure(ip)

    expect(isRateLimited(ip)).toBe(true)
    // The whole factory shares one outbound IP. Pooling the two counters would
    // let a handful of mistyped codes take every ID card down with them.
    expect(badgeLimiter.isRateLimited(ip)).toBe(false)
  })

  it('a card scanned wrong all morning leaves the code door open', () => {
    const ip = '203.0.113.11'
    for (let i = 0; i < BADGE_RATE_LIMIT_MAX; i++) badgeLimiter.recordFailure(ip)

    expect(badgeLimiter.isRateLimited(ip)).toBe(true)
    expect(isRateLimited(ip)).toBe(false)
  })

  it('the badge bucket is the looser of the two', () => {
    expect(BADGE_RATE_LIMIT_MAX).toBeGreaterThan(RATE_LIMIT_MAX)
  })

  it('one IP failing does not lock another', () => {
    for (let i = 0; i < BADGE_RATE_LIMIT_MAX; i++) badgeLimiter.recordFailure('203.0.113.12')
    expect(badgeLimiter.isRateLimited('203.0.113.13')).toBe(false)
  })

  it('failures fall out of the window, and success clears them', () => {
    const ip = '203.0.113.14'
    const t0 = 1_000_000
    for (let i = 0; i < BADGE_RATE_LIMIT_MAX; i++) badgeLimiter.recordFailure(ip, t0)
    expect(badgeLimiter.isRateLimited(ip, t0)).toBe(true)
    expect(badgeLimiter.isRateLimited(ip, t0 + 16 * 60 * 1000)).toBe(false)

    for (let i = 0; i < BADGE_RATE_LIMIT_MAX; i++) badgeLimiter.recordFailure(ip, t0)
    badgeLimiter.clearFailures(ip)
    expect(badgeLimiter.isRateLimited(ip, t0)).toBe(false)
  })
})
