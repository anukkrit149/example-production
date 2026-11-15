/**
 * The configuration check that runs before the Neon SDK is constructed.
 *
 * It lives in its own module, free of any `@neondatabase/*` import, for one
 * reason: the SDK's server entrypoint cannot be loaded outside a Next build
 * (it imports `next/headers`, which does not resolve under plain Vitest), so a
 * test that imported lib/auth-server.ts to reach this rule would fail at module
 * load without ever running it. Keeping the rule here means it is covered by an
 * ordinary unit assertion, and lib/auth-server.ts calls it before the one line
 * that needs the SDK.
 */

/** Neon's own minimum for the cookie-signing secret; createNeonAuth throws below it. */
export const MIN_COOKIE_SECRET_LENGTH = 32

/**
 * The cookie secret, or a thrown error naming the variable to set.
 *
 * Callers reach this only once NEON_AUTH_BASE_URL is configured, so a missing
 * or too-short secret is a half-finished setup rather than a machine that has
 * deliberately opted out of Neon Auth. Checked here rather than left to the SDK
 * so the failure says which variable is wrong instead of surfacing as an
 * opaque constructor throw.
 */
export function requireCookieSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.NEON_AUTH_COOKIE_SECRET
  if (!secret || secret.length < MIN_COOKIE_SECRET_LENGTH)
    throw new Error(
      `NEON_AUTH_COOKIE_SECRET must be set to at least ${MIN_COOKIE_SECRET_LENGTH} characters when NEON_AUTH_BASE_URL is configured`,
    )
  return secret
}
