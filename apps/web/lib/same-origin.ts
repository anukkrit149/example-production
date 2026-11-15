import { ApiError } from '@hf/server'

/**
 * Refuse a sign-in POST that another site made on the browser's behalf.
 *
 * Both sign-in routes mint a session cookie, and the badge route also revokes
 * whatever session the phone was carrying. Without this, a page on any other
 * origin could POST to them from a bench phone's browser — a plain
 * `<form enctype="text/plain">` is enough, since `Request.json()` never looks at
 * the content type — and either sign the floor's phone in as an operator of the
 * attacker's choosing, misattributing every scan that follows, or simply log
 * the operator out mid-shift. `SameSite=Lax` protects the cookie the session
 * arrives on, not the request that creates it.
 *
 * Two checks, because neither alone is enough:
 *
 * A JSON content type cannot be produced by an HTML form — forms may only send
 * `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain` —
 * and any `fetch` that sets it is forced through a CORS preflight the app never
 * answers. That closes the form vector outright.
 *
 * `Origin` closes the rest. It is set by the browser and not settable from
 * script, so a mismatch is conclusive. A MISSING origin is allowed: same-origin
 * requests from some browsers omit it, and so does every server-side caller,
 * including this app's own test suite. Absence proves nothing either way; a
 * wrong value proves everything.
 */
export function requireSameOrigin(req: Request): void {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'expected a JSON request', 'unsupported_media_type')
  }

  const origin = req.headers.get('origin')
  if (!origin) return

  // `Host` rather than the request URL: behind a proxy the URL the server sees
  // may carry an internal hostname, while `Host` is what the browser asked for
  // and therefore what its `Origin` will agree with.
  const host = req.headers.get('host')
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw new ApiError(403, 'bad origin', 'forbidden_origin')
  }

  if (!host || originHost !== host) {
    throw new ApiError(403, 'bad origin', 'forbidden_origin')
  }
}
