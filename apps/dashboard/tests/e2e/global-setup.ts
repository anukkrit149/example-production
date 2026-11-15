import { execFileSync } from 'node:child_process'
import { config } from 'dotenv'
import { resolve } from 'node:path'

// `__dirname` rather than `import.meta.url`: Playwright transpiles this to
// CommonJS because apps/web is not an ES module package.
const repoRoot = resolve(__dirname, '../../../..')

/**
 * A known database, seeded the same way every run.
 *
 * Every case here activates pieces, appends events and counts them, so it needs
 * to start from the same 65 seeded pieces each time or the counts drift and the
 * suite starts failing for reasons that have nothing to do with the app.
 *
 * This is the most dangerous file in the repository: it empties every table in
 * whatever DATABASE_URL names. The guards below are therefore not defensive
 * style, they are the whole point — a checkout linked to Neon has a production
 * url sitting in .env, and running this against it would delete a factory's
 * records. Refusing loudly is the only safe failure.
 *
 * `migrate deploy` plus an explicit truncate, rather than `migrate reset`:
 * reset is interactive-gated in Prisma 7 (it refuses outright when it detects
 * it was invoked by an agent), and a suite that cannot run unattended is not a
 * suite. deploy is idempotent and ungated, and the truncate below is derived
 * from the live schema rather than a hand-kept table list, so it cannot fall
 * behind a migration the way a literal list would.
 */
export default async function globalSetup() {
  config({ path: resolve(repoRoot, '.env') })

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required to run the end-to-end suite')

  // Hosted Postgres, by any of the names it answers to. A managed url means
  // shared data and no undo; the suite has no business there under any flag.
  if (/neon\.tech|neon\.build|\.rds\.amazonaws\.com|supabase\.co|render\.com/i.test(url)) {
    throw new Error(
      `refusing to reset a hosted database: ${redact(url)}. The e2e suite empties every table — point DATABASE_URL at a local database.`,
    )
  }

  // Belt and braces on top of the hostname check: a local tunnel to production
  // would pass the test above. A database that does not say it is for testing
  // is not one this suite may destroy.
  const dbName = databaseName(url)
  if (!/e2e|test/i.test(dbName)) {
    throw new Error(
      `refusing to reset database "${dbName}": the e2e suite empties every table, so its database name must contain "e2e" or "test".`,
    )
  }

  execFileSync('pnpm', ['--filter', '@hf/db', 'exec', 'prisma', 'migrate', 'deploy'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  })

  // Imported after the guards, and after DATABASE_URL is settled: @hf/db builds
  // its singleton from that variable the moment the module is evaluated.
  const { makePrismaClient, seedAll } = (await import('@hf/db')) as typeof import('@hf/db')
  const db = makePrismaClient(url)
  try {
    await truncateEverything(db)
    const seeded = await seedAll(db)
    // Seeding is what the whole suite stands on, so a silent partial seed must
    // not be allowed to look like a pass three tests later.
    if (seeded.pieces.length === 0) throw new Error('seed produced no pieces')
    console.log(`e2e: reseeded ${dbName} with ${seeded.pieces.length} pieces`)
  } finally {
    await db.$disconnect()
  }
}

/**
 * Empty every application table, in one statement.
 *
 * Read out of `information_schema` rather than written down, so a migration
 * that adds a table cannot leave stale rows behind for the next run to trip
 * over. Prisma's own `_prisma_migrations` is excluded — dropping it would
 * un-apply the migrations we just deployed.
 */
async function truncateEverything(db: {
  $queryRawUnsafe: (q: string) => Promise<unknown>
  $executeRawUnsafe: (q: string) => Promise<unknown>
}) {
  const rows = (await db.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  )) as Array<{ tablename: string }>
  if (rows.length === 0) throw new Error('no tables found to truncate — did the migration run?')

  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

/** The database name out of a Postgres url, without throwing on a malformed one. */
function databaseName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return ''
  }
}

/** Never put a password in an error message someone will paste into a chat. */
function redact(url: string): string {
  return url.replace(/\/\/[^@]*@/, '//***@')
}
