import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Runs in each worker before any test module imports @hf/db, so this is the
// last word on which database the suite talks to.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../..', '.env') })

const db = process.env.DASHBOARD_TEST_DATABASE_URL
if (!db) throw new Error('DASHBOARD_TEST_DATABASE_URL is required for the dashboard integration suite')
if (/neon\.tech/i.test(db)) throw new Error('refusing to run destructive tests against Neon')

process.env.DATABASE_URL = db
process.env.TEST_DATABASE_URL = db
process.env.DEV_AUTH = 'true'
delete process.env.NEON_AUTH_BASE_URL   // the Neon session path is mocked per test, never live
