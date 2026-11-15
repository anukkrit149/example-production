/**
 * One-off: seed the factory-default checklists (`seedChecklists` from
 * '../src/seed-data.ts') against whatever database `DATABASE_URL` names.
 *
 * Idempotent — safe to run twice. A checklist that already has any version
 * (published or draft) is left alone; only a checklist with none gets its
 * version 1. Run it once against production after the migration deploys;
 * running it again (by mistake, or to confirm) creates nothing further and
 * prints 0.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... pnpm --filter @hf/db seed:checklists
 *
 * `.env` at the repo root is loaded the same way prisma.config.ts loads it,
 * but with override:false — an explicit DATABASE_URL on the command line (as
 * above, for a production run from a trusted machine) always wins over
 * whatever `.env` has locally.
 */
import { config } from 'dotenv'

config({ path: new URL('../../../.env', import.meta.url).pathname, override: false })

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Refusing to guess which database to seed.')
  console.error('Usage: DATABASE_URL=postgresql://... pnpm --filter @hf/db seed:checklists')
  process.exit(1)
}

const { DEFAULT_CHECKLISTS } = await import('@hf/domain')
const { prisma, seedChecklists } = await import('../src/index')

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '(unparsable DATABASE_URL)'
  }
}

console.log(`Writing to: ${hostOf(process.env.DATABASE_URL)}`)
console.log(`Factory-default checklists defined in code: ${DEFAULT_CHECKLISTS.length}`)

const created = await seedChecklists(prisma)

console.log(`Checklists created: ${created}`)
console.log(
  created === 0
    ? 'Nothing to do — every default checklist already has a version. Safe: this is what a second run looks like.'
    : `Seeded ${created} default checklist(s), each published as version 1.`,
)

await prisma.$disconnect()
