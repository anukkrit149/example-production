import { createNeonAuth } from '@neondatabase/auth/next/server'
import { requireCookieSecret } from './neon-auth-config'

/**
 * Built lazily, never at module scope: `createNeonAuth` throws when
 * `cookies.secret` is shorter than 32 characters, and on Workers the module
 * scope of a route runs at deploy time, before secrets are populated. Locally a
 * developer with no NEON_AUTH_* set still needs /dev-login to work, and
 * `next build` prerenders route modules with an empty environment.
 *
 * lib/auth.ts imports this module dynamically and only after checking
 * NEON_AUTH_BASE_URL, so on a machine without Neon credentials `neonAuth()` is
 * never called and the SDK is never constructed.
 *
 * The instance is memoised, so the configuration is read once and captured for
 * the lifetime of the process (or the Worker isolate) on first use. That is
 * acceptable because both values are deploy-time configuration rather than
 * per-request state: changing either means a new deploy, which is a new isolate
 * anyway. It is also what the SDK expects — its session cache and request
 * deduplication live on the instance, so rebuilding it per call would throw
 * both away.
 */
let instance: ReturnType<typeof createNeonAuth> | null = null

export function neonAuth(): ReturnType<typeof createNeonAuth> {
  if (!instance) {
    // Throws, naming the variable, before the SDK is ever constructed.
    const secret = requireCookieSecret()

    instance = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: { secret },
    })
  }
  return instance
}

/**
 * The session seam the rest of the app and the tests speak to.
 *
 * Kept as a plain object with a `getSession` method — rather than re-exporting
 * the SDK instance — so that reading a session never constructs the SDK until
 * the moment it is actually needed, and so the integration suite can replace
 * this one module with a stub.
 */
export const auth = {
  getSession: () => neonAuth().getSession(),
}
