'use client'

export class MutateError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
    this.name = 'MutateError'
  }
}

/**
 * The single client write path. One idempotency key per logical call, reused
 * across retries, so a retried create replays instead of duplicating. A
 * response the server actually sent (4xx/5xx) is final and never retried.
 */
export async function mutate<T>(path: string, body: unknown, opts: { method?: 'POST' | 'PATCH' | 'PUT'; key?: string } = {}): Promise<T> {
  const method = opts.method ?? 'POST'
  const key = opts.key ?? crypto.randomUUID()
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json', ...(method === 'POST' ? { 'idempotency-key': key } : {}) },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: { code: 'error', message: res.statusText } }))
        throw new MutateError(res.status, e.error?.code ?? 'error', e.error?.message ?? 'request failed')
      }
      return (await res.json()) as T
    } catch (e) {
      if (e instanceof MutateError) throw e
      lastErr = e
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }
  throw new MutateError(0, 'network', `No connection. ${String(lastErr)}`)
}
