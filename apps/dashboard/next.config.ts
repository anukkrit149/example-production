import type { NextConfig } from 'next'

/**
 * Prisma generates two clients from one schema (see packages/db/prisma/schema.prisma):
 * `generated` for Node and `generated-workerd` for Cloudflare. The Node client
 * compiles its query compiler from bytes at runtime, which workerd forbids —
 * "Wasm code generation disallowed by embedder" — while the workerd client
 * imports `.wasm?module`, which Node and Vitest cannot parse. Neither serves
 * both, so the swap happens here, at build time.
 */
const BUILDING_FOR_WORKERS = process.env.OPEN_NEXT_BUILD === '1'

const config: NextConfig = {
  // @hf/db imports its Prisma client through the package-internal specifier
  // `#prisma-client`, whose `imports` map in packages/db/package.json resolves
  // to the workerd client under the `workerd` condition and the Node client
  // otherwise. Turbopack has no option to turn a resolve condition on, so the
  // Workers build states the same choice as an alias instead.
  //
  // The key must be a BARE specifier. An earlier attempt keyed this map on the
  // relative paths @hf/db used to import ('./generated/client'); Turbopack
  // matches resolveAlias like webpack's resolve.alias — package specifiers, not
  // relative paths — so those keys silently never matched. The build succeeded,
  // deployed, and kept running the Node client, which is why the Wasm error was
  // unchanged. `#prisma-client` is bare, so it matches.
  //
  // The alias target is a workspace package subpath rather than a file path,
  // because a leading-slash value is read as a server-relative URL and an alias
  // is resolved from THIS directory — which also rules the mechanism out for
  // exceljs, whose only visible copy under pnpm lives in packages/labels. That
  // one is handled at runtime instead; see packages/labels/src/weprint.ts.
  turbopack: BUILDING_FOR_WORKERS
    ? {
        resolveAlias: {
          '#prisma-client': '@hf/db/client-workerd',
        },
      }
    : {},
  transpilePackages: ['@hf/db', '@hf/domain', '@hf/contracts', '@hf/server'],

  // The adapters stay external in both builds: @hf/db picks between them at
  // runtime — adapter-pg over TCP on Node, adapter-neon over WebSocket on
  // Workers — and bundling either one would defeat that choice.
  //
  // `@prisma/client` is the exception, and only on Workers. The workerd client
  // reaches its query compiler with
  //
  //     await import("./query_compiler_fast_bg.wasm?module")
  //
  // which is a STATIC specifier: `?module` is a bundler instruction, not
  // something the runtime can resolve. It only becomes a real Wasm module if a
  // bundler sees the import and emits the .wasm as a Worker module at build
  // time. An external package is copied to the Worker and resolved from
  // node_modules at runtime, so the bundler never sees that import — which is
  // why aliasing the client alone changed nothing, and why the Node client's
  // `new WebAssembly.Module(bytes)` was still what ran and threw
  // "Wasm code generation disallowed by embedder": workerd forbids compiling
  // Wasm from bytes for the same reason it forbids eval.
  //
  // So on Workers the client must be BUNDLED for the alias above to mean
  // anything. On Node it stays external, because bundling the Node client drags
  // its node:-prefixed filesystem access through Turbopack for no benefit.
  serverExternalPackages: [
    ...(BUILDING_FOR_WORKERS ? [] : ['@prisma/client', '.prisma/client']),
    '@prisma/adapter-pg',
    'pg',
    '@prisma/adapter-neon',
    '@neondatabase/serverless',
  ],
}

export default config
