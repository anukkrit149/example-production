import { ZodError, type ZodType } from 'zod'
import { withRequestScope } from '@hf/db'

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'error') { super(message) }
}

export const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })

/** "styleCode" -> "Style code", so a Zod issue reads as a sentence about the field the user typed in. */
function fieldLabel(path: PropertyKey[]): string {
  const key = path.filter((p): p is string => typeof p === 'string').join(' ')
  if (!key) return ''
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._]/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The first issue, as one readable line: "Style code: must be 2–12 letters,
 * digits or hyphens, starting with a letter". Forms show `error.message`
 * verbatim, so a bare "invalid input" left the user guessing which field.
 * The full issue list still rides alongside for clients that want it.
 */
export function validationMessage(issues: ZodError['issues']): string {
  const first = issues[0]
  if (!first) return 'invalid input'
  const label = fieldLabel(first.path)
  return label ? `${label}: ${first.message}` : first.message
}

/**
 * Every API route runs inside `withRequestScope`, which gives this request its
 * own database client on Workers (see packages/db/src/index.ts). It is a
 * pass-through on Node. This is the single chokepoint for API routes, so no
 * handler has to remember it; server components use `pageScope` instead.
 */
export function handle(fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await withRequestScope(() => fn(req, ctx))
    } catch (e) {
      if (e instanceof ApiError) return json({ error: { code: e.code, message: e.message } }, { status: e.status })
      if (e instanceof ZodError) return json({ error: { code: 'validation', message: validationMessage(e.issues), issues: e.issues } }, { status: 400 })
      console.error(e)
      return json({ error: { code: 'internal', message: 'internal error' } }, { status: 500 })
    }
  }
}

export async function readMutation<T>(req: Request, schema: ZodType<T>): Promise<{ input: T; idempotencyKey: string }> {
  const idempotencyKey = req.headers.get('idempotency-key')
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) throw new ApiError(400, 'Idempotency-Key header required', 'idempotency_key')
  const body = await req.json().catch(() => { throw new ApiError(400, 'body must be JSON', 'bad_json') })
  return { input: schema.parse(body), idempotencyKey }
}

/** The body of an update request. Updates carry no Idempotency-Key: they are naturally idempotent. */
export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => { throw new ApiError(400, 'body must be JSON', 'bad_json') })
}
