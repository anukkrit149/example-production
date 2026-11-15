/**
 * Whether the dev sign-in picker is available. The single answer for every
 * caller in both apps — the picker page, its action, the link on /signin, and
 * the cookie fallback in getCurrentUser.
 *
 * DEV_AUTH alone is not trusted, because it is not only set deliberately.
 * OpenNext compiles the project's `.env` files into the deployed Worker and
 * fills any key the Worker's own secrets left unset; both `.env` files in this
 * repo are untracked developer config carrying DEV_AUTH=true, so the Cloudflare
 * deploy shipped the bypass to production without anyone choosing to. That was
 * observed live on the deployed Worker, and is the reason this predicate exists.
 *
 * The second clause is what makes it safe: workerd advertises itself through
 * `navigator.userAgent`, so the deployed Worker refuses the dev path no matter
 * what DEV_AUTH says. Local `next dev` and Vitest both run on Node, where that
 * check is false, so the flag still works exactly as before for the people who
 * need it. Blanking the flag at the build step instead would be one deploy
 * script away from regressing; this cannot.
 *
 * The third clause exists for the same reason as the first: a compiled `.env`
 * once shipped `DEV_AUTH=true` to a deployed Worker, so a production Node
 * build (no Cloudflare `navigator.userAgent` to catch it) gets the same
 * protection by refusing whenever `NODE_ENV=production`.
 */
export function devAuthEnabled(): boolean {
  if (process.env.DEV_AUTH !== 'true') return false
  if (process.env.NODE_ENV === 'production') return false
  const ua = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent
  return ua !== 'Cloudflare-Workers'
}
