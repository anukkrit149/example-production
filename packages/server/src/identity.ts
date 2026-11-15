/**
 * How an office user is keyed in `users.auth_identity`: the sign-in email,
 * trimmed and lowercased, behind a prefix so it can never collide with an
 * operator's `dev:` or code-based identity.
 */
export const emailIdentity = (email: string): string => `email:${email.trim().toLowerCase()}`
export const isEmailIdentity = (identity: string): boolean => identity.startsWith('email:')
export const emailFromIdentity = (identity: string): string | null => (isEmailIdentity(identity) ? identity.slice('email:'.length) : null)

/**
 * A person added without an email signs in on the phone with an operator code,
 * never with a password or a mailbox, so their identity is nothing more than a
 * unique tag that keeps the `users.auth_identity` column unique.
 */
export const codeIdentity = (): string => `code:${crypto.randomUUID()}`

/**
 * Addresses on the sample domain are admins by default: anyone signing in
 * with an email on one of these domains gets an active admin row on first
 * sign-in, so nobody has to be added by hand before they can add everyone
 * else. The match is on the exact domain after lowercasing —
 * "x@factory.example.evil" does not count. A row that an admin has since
 * deactivated stays deactivated. `factory.example` is a reserved example
 * name, not a live host.
 */
export const AUTO_ADMIN_DOMAINS = ['factory.example'] as const

export function isAutoAdminEmail(email: string): boolean {
  const at = email.trim().toLowerCase().lastIndexOf('@')
  if (at < 0) return false
  const domain = email.trim().toLowerCase().slice(at + 1)
  return (AUTO_ADMIN_DOMAINS as readonly string[]).includes(domain)
}
