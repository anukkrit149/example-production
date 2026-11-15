import { config } from 'dotenv'

// @hf/db no longer loads .env itself — it must be importable inside a Worker,
// which has no filesystem — so every Node entry point that needs it loads it.
//
// The imports below are dynamic, and deliberately so: static imports are
// hoisted above this call, and ../src/index reads DATABASE_URL as it is
// evaluated.
config({ path: new URL('../../../.env', import.meta.url).pathname, override: false })

const { prisma } = await import('../src/index')
const { seedAll } = await import('../src/seed-data')

const r = await seedAll(prisma)
console.log(`seeded ${r.pieces.length} pieces`)
await prisma.$disconnect()
