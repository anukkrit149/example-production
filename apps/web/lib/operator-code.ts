import { createHash, randomInt, randomBytes, timingSafeEqual } from 'node:crypto'
import { BADGE_BODY_LENGTH, BADGE_PREFIX } from '@hf/domain'

/**
 * Operator sign-in codes: the secret half of floor authentication.
 *
 * An operator holds one short code, issued to them personally by an admin. It
 * identifies a PERSON, not a phone — every scan in the event log has to be
 * attributable in a dispute, which is the whole reason the log exists. The
 * device gets a long random session token in exchange; the code itself is
 * entered once and never again on that phone.
 */

/**
 * The QR token alphabet, deliberately reused.
 *
 * No 0/O and no 1/I. These codes get read aloud across a loud floor and copied
 * off a slip by someone wearing gloves — the same ambiguity that would ruin a
 * scanned label ruins a spoken code. 32 characters over 8 positions is 2^40
 * (about 1.1 trillion), which is only safe because entry is rate limited; see
 * the limiter in the sign-in route.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 8

/** The cookie the phone carries. Holds a token only; the session row decides. */
export const SESSION_COOKIE = 'hf_session'

/** Thirty days on the floor: long enough that a shared bench phone is not a daily login ritual. */
export const SESSION_DAYS = 30

/**
 * `lastSeenAt` is a liveness signal, not an audit trail — the event log already
 * carries who did what. Writing it on every request would mean a row update per
 * page view, so it moves at most once an hour.
 */
export const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000

/**
 * A fresh code, from the CSPRNG.
 *
 * `randomInt` and never `Math.random`: this value is the only thing standing
 * between a stranger and another person's identity in the event log. `randomInt`
 * is also rejection-sampled internally, so a 32-character alphabet stays uniform
 * rather than skewing toward the low letters the way `% 32` on a random byte would.
 */
export function generateCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return formatCode(out)
}

/** `K7M29QRX` → `K7M2-9QRX`. Two groups of four is what a person can hold in their head. */
export function formatCode(code: string): string {
  const c = normaliseCode(code)
  return c.length === CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

/**
 * What actually gets hashed.
 *
 * Uppercase and strip everything that is not a letter or digit, so a code typed
 * `k7m2 9qrx`, `K7M2-9QRX` or `k7m29qrx` all reach the same hash. An operator
 * fighting a phone keyboard should not be able to fail on punctuation.
 */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * SHA-256, hex.
 *
 * Not bcrypt/argon2 — and that is a deliberate, bounded call. Those exist to
 * slow an offline attack on a LOW-entropy human-chosen password. These secrets
 * are 40 bits of CSPRNG output that no human picked, so there is no dictionary
 * to run and a stolen hash table is not meaningfully crackable. It also keeps
 * the dependency list closed (node:crypto only) as required. If codes ever
 * shorten or become user-chosen, this must become a slow KDF.
 */
export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Constant-time hash comparison.
 *
 * `===` on strings short-circuits at the first differing byte, which leaks how
 * much of a guess was right through response timing. The lengths are compared
 * first because `timingSafeEqual` throws on a mismatch — that is safe to do in
 * variable time since both sides are fixed-width hex digests.
 */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

/** 256 bits of session token. Never displayed, so it needs no friendly alphabet. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * ID-card badges: the secret an operator never has to read.
 *
 * The typed code exists because a phone can always be signed in by hand. It is
 * also the thing most of this floor cannot actually do — the operators this app
 * is for do not type, and eight characters off a slip at 7am is the step that
 * fails. A badge moves the same secret onto the ID card already round their
 * neck: the phone camera opens the card's QR and the session is theirs before
 * they have touched the screen.
 *
 * Only the GENERATION lives here, because only generation needs a CSPRNG. The
 * format, the parser and the URL a card carries are in `@hf/domain`, where the
 * checkpoint scanner — a client component that cannot import `node:crypto` —
 * can reach them too.
 *
 * `randomInt` and never `Math.random`, for the same reason as a code: this
 * value is the only thing standing between a stranger and another person's
 * identity in the event log.
 */
export function generateBadgeToken(): string {
  let out = ''
  for (let i = 0; i < BADGE_BODY_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return BADGE_PREFIX + out
}

/** True if the row is live right now — not revoked, not past its expiry. */
export function isLive(row: { revokedAt: Date | null; expiresAt: Date | null }, now = new Date()): boolean {
  if (row.revokedAt) return false
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return false
  return true
}

/**
 * Failed sign-in attempts, per IP, per kind of secret.
 *
 * KNOWN LIMITATION — this is in-process memory, sized for the pilot: one Noida
 * factory, one Node process. It does NOT survive a restart or deploy, and it
 * does NOT coordinate across instances, so on a multi-instance deploy an
 * attacker gets N times the budget and a redeploy clears the counter. That is
 * an accepted trade for the pilot because the floor is behind one server and
 * the real defence is the keyspace; the limiter exists to stop the unthrottled
 * online guessing that would otherwise make a short code indefensible. Before
 * this runs on more than one instance, move the counter to Postgres or Redis
 * keyed the same way.
 *
 * Codes and badges get SEPARATE buckets, and that separation is load bearing.
 * The whole factory shares one outbound IP, so every counter here is really a
 * counter for the building. A badge is 120 bits — brute force is not the threat
 * — but a revoked or expired card scanned over and over by a confused operator
 * is an everyday event, and pooling those failures with the typed codes would
 * let one dead ID card lock the entire floor out of the code screen too. The
 * badge bucket is therefore its own, and far looser: enough to stop something
 * hammering the endpoint, not so tight that a bad card takes the shift down.
 */
function createLimiter(max: number, windowMs: number) {
  const attempts = new Map<string, number[]>()

  /** Failures still inside the sliding window, pruned in place. */
  const recent = (ip: string, now: number): number[] => {
    const cutoff = now - windowMs
    const kept = (attempts.get(ip) ?? []).filter((t) => t > cutoff)
    if (kept.length) attempts.set(ip, kept)
    else attempts.delete(ip)
    return kept
  }

  return {
    max,
    /** True when this IP has already burned its budget of failures. */
    isRateLimited: (ip: string, now = Date.now()): boolean => recent(ip, now).length >= max,
    /** Records one failure and prunes anything outside the window. */
    recordFailure: (ip: string, now = Date.now()): void => {
      const kept = recent(ip, now)
      kept.push(now)
      attempts.set(ip, kept)
    },
    /** Wipes an IP's history — called on success so a good operator is never punished. */
    clearFailures: (ip: string): void => {
      attempts.delete(ip)
    },
    /** Seconds until this IP may try again, for the lockout message. */
    retryAfterSeconds: (ip: string, now = Date.now()): number => {
      const kept = recent(ip, now)
      if (kept.length < max) return 0
      return Math.max(1, Math.ceil((Math.min(...kept) + windowMs - now) / 1000))
    },
    /** Failures remaining before lockout, for the "2 tries left" hint on screen. */
    attemptsRemaining: (ip: string, now = Date.now()): number => Math.max(0, max - recent(ip, now).length),
    /** Test-only: drops all counters so cases do not inherit each other's state. */
    reset: (): void => {
      attempts.clear()
    },
  }
}

export const RATE_LIMIT_MAX = 5
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000

/**
 * A dead ID card scanned in a loop must not cost the floor its code screen, so
 * this budget is measured against clumsiness rather than against guessing.
 */
export const BADGE_RATE_LIMIT_MAX = 30

const codeLimiter = createLimiter(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)

/** The badge bucket. Its own counters, its own budget; see `createLimiter`. */
export const badgeLimiter = createLimiter(BADGE_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)

/** Client IP, best effort. Behind a proxy the left-most forwarded hop is the client. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

// The typed-code bucket, under the names the sign-in route and its tests have
// always used. Badge callers reach their own bucket through `badgeLimiter`.
export const isRateLimited = codeLimiter.isRateLimited
export const recordFailure = codeLimiter.recordFailure
export const clearFailures = codeLimiter.clearFailures
export const retryAfterSeconds = codeLimiter.retryAfterSeconds
export const attemptsRemaining = codeLimiter.attemptsRemaining

/** Test-only: drops every counter, in both buckets. */
export function __resetRateLimit(): void {
  codeLimiter.reset()
  badgeLimiter.reset()
}
