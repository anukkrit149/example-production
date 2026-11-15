'use client'

/** A non-2xx answer from the server, carrying the code the UI branches on. */
export class MutateError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'MutateError'
  }
}

/**
 * The single client write path.
 *
 * One idempotency key per logical call, reused across retries: factory wifi
 * drops mid-request often enough that a retry is routine, and the server
 * replays the original event rather than appending a second one. A rejection
 * the server actually reached us with (`MutateError`) is final and never
 * retried — retrying a 409 or a 422 only produces the same answer more slowly.
 */
export async function mutate<T>(
  path: string,
  body: unknown,
  opts: { key?: string } = {},
): Promise<T> {
  const key = opts.key ?? crypto.randomUUID()
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const e = await res
          .json()
          .catch(() => ({ error: { code: 'error', message: res.statusText } }))
        throw new MutateError(
          res.status,
          e.error?.code ?? 'error',
          e.error?.message ?? 'request failed',
        )
      }
      return (await res.json()) as T
    } catch (e) {
      if (e instanceof MutateError) throw e
      lastErr = e
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw new MutateError(0, 'network', `network failure: ${String(lastErr)}`)
}
