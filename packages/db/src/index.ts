/**
 * `#prisma-client` is a package-internal import (see the `imports` field in
 * this package's package.json). It resolves to the workerd client under the
 * `workerd` export condition and to the Node client otherwise.
 *
 * The indirection is what lets one source file serve both runtimes. The two
 * clients differ in exactly one load-bearing way — how they reach the query
 * compiler:
 *
 *   Node      new WebAssembly.Module(Buffer.from(base64))   // compile at runtime
 *   workerd   import("./query_compiler_fast_bg.wasm?module") // static, bundled
 *
 * workerd forbids the first for the same reason it forbids eval, which is the
 * "Wasm code generation disallowed by embedder" error. But the second is a
 * BUNDLER specifier: `?module` is an instruction to the bundler, not something
 * a runtime can resolve, so it only becomes a real Wasm module if the bundler
 * sees the import and emits the .wasm at build time. Node and Vitest, meanwhile,
 * cannot parse `?module` at all — which is why the Node build must keep the
 * plain client, and why a single client cannot serve both.
 *
 * The swap has to happen during `next build`: Turbopack compiles @hf/db into a
 * .next chunk there, before OpenNext's own esbuild pass (which does set
 * `conditions: ["workerd"]`) ever runs, so that later pass is too late.
 * Turbopack has no option to enable a resolve condition, so the Workers build
 * states the choice as a resolveAlias on this same `#prisma-client` specifier
 * (see apps/web/next.config.ts). The `imports` map below is what makes Node,
 * Vitest, tsc and the packages/db scripts resolve it without any bundler.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { PrismaClient } from '#prisma-client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaPg } from '@prisma/adapter-pg'

export * from '#prisma-client'
export { seedAll, seedChecklists } from './seed-data'
export type { SeedResult } from './seed-data'

/**
 * True inside workerd (Cloudflare Workers). `navigator.userAgent` is the
 * runtime's own advertised identity and is the documented way to detect it.
 * It is read through `globalThis` because `navigator` is not declared in the
 * Node type environment this package is compiled against.
 */
const onWorkers =
  typeof (globalThis as { navigator?: { userAgent?: string } }).navigator !== 'undefined' &&
  (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent === 'Cloudflare-Workers'

/**
 * The adapter is chosen at runtime, not by the bundler.
 *
 * Workers have no TCP, so `@prisma/adapter-pg` cannot open a socket there; the
 * Neon serverless driver tunnels Postgres over a WebSocket, which workerd does
 * support. The reverse holds too — that driver only speaks to Neon's endpoint,
 * so local development and the whole test suite, which run against a plain
 * Postgres container, need the TCP adapter.
 *
 * Importing both is safe: each import only defines a class, and `pg` and
 * `@neondatabase/serverless` are both in the app's `serverExternalPackages`, so
 * neither is inlined into the bundle. Only the branch taken here ever opens a
 * connection.
 *
 * A package export condition (`workerd` vs `default`) was tried first and does
 * not work: `next build` targets Node, resolves `default`, and bakes the pg
 * adapter into .next before OpenNext ever sees the code.
 *
 * `pg` does still reach the Worker bundle this way, and it drags in its
 * optional `pg-cloudflare` socket shim, whose `workerd` export the OpenNext
 * copy step never carries across. That is resolved by a pnpm patch (see
 * patches/pg-cloudflare@1.4.0.patch), not by contorting this import.
 */
function make(url: string) {
  return new PrismaClient({
    adapter: onWorkers ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url }),
  })
}

/**
 * On Node the client is cached on `globalThis` so a dev-server reload does not
 * leak a new connection pool each time.
 *
 * `dotenv` is gone from this module on purpose — it reads the filesystem, which
 * a Worker does not have. Loading `.env` is now the job of the entry points that
 * need it (the vitest setup files, the Prisma CLI config, and the scripts under
 * packages/db), while on Workers `process.env` is already populated from the
 * deployed secrets.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/**
 * On Workers the client is cached PER REQUEST, never for the life of the
 * isolate.
 *
 * A Worker isolate serves many requests, and a Neon connection is a WebSocket —
 * an I/O object that workerd binds to the request context that opened it. Reuse
 * it from a later request and the runtime kills that request with "Cannot
 * perform I/O on behalf of a different request", or hangs until it is cancelled.
 * An isolate-wide singleton does exactly that, and it was observed doing it on
 * the deployed Worker.
 *
 * This is a correctness fix, not a performance one. `runPieceAction` takes
 * `SELECT ... FOR UPDATE` and needs the lock and the statements it guards to sit
 * on ONE connection. A client shared across request contexts cannot promise
 * that, so the double-tap protection — the thing standing between a bad-wifi
 * double tap and two events on one piece — would be silently unsound even while
 * every local test passed.
 *
 * AsyncLocalStorage is what makes per-request caching safe rather than
 * per-property-access: everything within one request, transactions included,
 * resolves to the same client, while nothing leaks between requests. It is real
 * in workerd under `nodejs_compat`.
 *
 * Two constraints have to hold at once, and only this shape satisfies both:
 *
 *   1. WITHIN one request, the whole `$transaction` — the `SELECT ... FOR
 *      UPDATE`, the version check, the event insert, the piece update — must run
 *      on ONE connection, or the lock guards nothing.
 *   2. ACROSS requests, no connection may be shared, because workerd forbids it.
 *
 * A per-isolate singleton satisfies (1) and violates (2). Building a client per
 * property access satisfies (2) and violates (1). One client per request, built
 * when the request starts and discarded at the end, is the only shape that
 * satisfies both — which is why the earlier "cache per isolate" note that stood
 * here was wrong for workerd even though its reasoning is right for Node.
 */
const requestScope = onWorkers ? new AsyncLocalStorage<{ client?: PrismaClient }>() : undefined

/**
 * The per-request store. `withRequestScope` establishes one explicitly for API
 * routes; server components do not run through that, so they fall back to
 * workerd's own per-request context object, which is per-request by
 * construction and therefore just as safe to hang a client on.
 *
 * Only if BOTH are absent — which should not happen in a real request — does
 * this return undefined, and `client()` then builds an uncached client rather
 * than reaching for a shared one. That is the safe direction to fail.
 */
function store(): { client?: PrismaClient } | undefined {
  const explicit = requestScope!.getStore()
  if (explicit) return explicit

  const ctx = (globalThis as { [k: symbol]: unknown })[Symbol.for('__cloudflare-context__')] as
    | { [k: symbol]: unknown }
    | undefined
  if (!ctx) return undefined

  const KEY = Symbol.for('__hf_prisma_request_store__')
  return ((ctx as Record<symbol, unknown>)[KEY] ??= {}) as { client?: PrismaClient }
}

/**
 * A Prisma-shaped stand-in that throws on every call.
 *
 * The canned browser suite (`HF_E2E_MOCK=1`) renders real screens against
 * scenario JSON. Importing `@hf/db` still evaluates this module, and on Node
 * that evaluation builds the client immediately. Returning this proxy instead
 * of `make(DATABASE_URL)` means a missing env var never reaches Prisma, and a
 * query that slipped past the scenario layer fails here instead of opening a
 * database.
 */
function mockPrismaClient(): PrismaClient {
  const blocked = (path: string): unknown => {
    const call = () => {
      throw new Error(`HF_E2E_MOCK blocked Prisma (${path})`)
    }
    return new Proxy(call, {
      get(_target, prop) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined
        return blocked(`${path}.${String(prop)}`)
      },
      apply() {
        throw new Error(`HF_E2E_MOCK blocked Prisma (${path})`)
      },
    })
  }
  return blocked('prisma') as PrismaClient
}

let mockClient: PrismaClient | undefined

function client(): PrismaClient {
  if (process.env.HF_E2E_MOCK === '1') return (mockClient ??= mockPrismaClient())
  if (!onWorkers) return (globalForPrisma.prisma ??= make(process.env.DATABASE_URL!))

  const s = store()
  if (!s) return make(process.env.DATABASE_URL!)
  return (s.client ??= make(process.env.DATABASE_URL!))
}

/**
 * Runs `fn` with a fresh per-request client scope. Every `prisma.*` access
 * inside resolves to one client, which is disconnected on the way out so the
 * request does not leave a socket open behind it.
 *
 * On Node this is a pass-through: the singleton is already correct there.
 */
export async function withRequestScope<T>(fn: () => Promise<T>): Promise<T> {
  if (!onWorkers) return fn()
  const scope: { client?: PrismaClient } = {}
  return requestScope!.run(scope, async () => {
    try {
      return await fn()
    } finally {
      await scope.client?.$disconnect().catch(() => {})
    }
  })
}

/**
 * Lazy on Workers, eager on Node.
 *
 * The indirection exists because a Worker's module scope is evaluated at deploy
 * time, when `process.env.DATABASE_URL` is not yet populated from the secret
 * store; building the client eagerly there would throw during startup.
 */
export const prisma: PrismaClient = onWorkers
  ? new Proxy({} as PrismaClient, {
      get: (_t, prop, receiver) => Reflect.get(client(), prop, receiver),
      has: (_t, prop) => prop in client(),
    })
  : client()

if (!onWorkers && process.env.NODE_ENV === 'production') delete globalForPrisma.prisma

export { make as makePrismaClient }
