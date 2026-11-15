import { QR_ALPHABET } from './qr-token'

/**
 * The ID-card badge token: format, parsing, and the URL a card's QR carries.
 *
 * This lives in the domain, next to the piece token, rather than beside the
 * hashing and session code in the app. Two callers need to agree on the shape
 * and only one of them can touch `node:crypto`: the sign-in route hashes the
 * token on the server, and the checkpoint scanner — a client component — has to
 * be able to recognise a badge held up to it in order to say "that is your ID
 * card, not a piece". Generating a token is the part that needs a CSPRNG, and
 * that deliberately stays in the app.
 *
 * `HF-W-` against the piece label's `HF-P-`: W for worker, P for piece. The two
 * must never be confused, and `normalizeQrToken` already refuses anything that
 * is not `HF-P-`, so a card held up to the piece scanner is simply not a piece
 * rather than a wrong piece.
 */
export const BADGE_PREFIX = 'HF-W-'

/**
 * Twenty-four characters of the shared alphabet: 120 bits.
 *
 * A typed code is eight characters because a person has to read it off a slip
 * and key it in. Nobody reads a badge, so it is sized against the thing that
 * actually threatens it — a camera that will happily retry all day, with no
 * operator watching a failure count — rather than against what fits in a head.
 */
export const BADGE_BODY_LENGTH = 24

/** The path a badge QR points at. The token itself rides in the fragment. */
export const BADGE_PATH = '/badge'

const BADGE_RE = new RegExp(`^HF-?W-?([${QR_ALPHABET}]{${BADGE_BODY_LENGTH}})$`)

/**
 * The canonical form of a badge token, or null if it is not one.
 *
 * Deliberately stricter than the typed code's normaliser. A badge arrives from
 * a camera or a URL fragment, not from someone's thumbs, so there is no
 * punctuation to be forgiving about — only case, surrounding whitespace, and
 * the internal hyphens that some readers and copy-paste paths drop. Anything
 * else is refused here rather than hashed into a lookup that cannot match.
 *
 * Spelled the American way, like `normalizeQrToken` beside it. The app's own
 * `normaliseCode` uses the other spelling; each package is internally
 * consistent, which matters more than agreement across the boundary.
 */
export function normalizeBadgeToken(input: string): string | null {
  const m = BADGE_RE.exec(input.trim().toUpperCase())
  return m ? BADGE_PREFIX + m[1] : null
}

export const isBadgeToken = (s: string) => normalizeBadgeToken(s) !== null

/**
 * The URL a badge QR encodes.
 *
 * The token rides in the FRAGMENT, and that is the whole point: a fragment is
 * never sent to the server. A card is a bearer credential with no expiry, so
 * putting it in the path would write it into every access log between the
 * phone and the app — the CDN's, the proxy's, the platform's — where it would
 * sit in plain text for anyone with log access to replay. In the fragment the
 * server sees only `/badge`, and the token exists solely in the browser that
 * scanned it, which is the only place it has any business being.
 */
export function badgeSignInUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${BADGE_PATH}#${token}`
}

/**
 * A badge token out of whatever a QR reader handed back — the bare token, or
 * the full sign-in URL a camera would have opened.
 *
 * The scanner uses this to tell an operator that they have held up their own ID
 * card instead of a piece label. Without it the decode simply fails to match a
 * piece token and nothing happens at all, which on a bench reads as a dead
 * camera rather than as a mistake anyone can correct.
 */
export function badgeTokenFrom(text: string): string | null {
  const direct = normalizeBadgeToken(text)
  if (direct) return direct

  const hash = text.indexOf('#')
  if (hash !== -1) return normalizeBadgeToken(text.slice(hash + 1))
  return null
}
