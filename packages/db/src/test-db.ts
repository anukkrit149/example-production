import { makePrismaClient } from './index'

// Tests must NEVER touch the real database. DATABASE_URL points at Neon in a
// linked checkout, so deriving from it would run destructive truncates against
// production. Each suite pins its own local database through its vitest config:
// @hf/db uses TEST_DATABASE_URL, the web integration suite WEB_TEST_DATABASE_URL.
// Application code under test reads DATABASE_URL, which those configs override
// to the same local value, so a test and the code it exercises stay in step.
const url = process.env.TEST_DATABASE_URL

if (!url) throw new Error('TEST_DATABASE_URL is required to run tests')
if (/neon\.tech/i.test(url)) throw new Error('refusing to run destructive tests against a Neon database')

export const testPrisma = makePrismaClient(url)

export async function resetTestDb() {
  await testPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE inventory_events, inventory_receipt_lines, inventory_receipts, inventory_items,
      checklist_items, checklist_versions, checklists, piece_lineage, attachments,
      label_prints, export_batches, piece_events, pieces,
      order_line_items, orders, programs, styles, organizations, operator_sessions, operator_codes,
      users, workers, mutation_keys RESTART IDENTITY CASCADE`)
}
