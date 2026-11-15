import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Runs inside each worker process before any test module is imported, so this
// is the last word on which database the suite talks to. It must beat the
// dotenv call inside @hf/db, which would otherwise load the real DATABASE_URL
// (Neon, in a linked checkout) and point destructive tests at production.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../..', '.env') })

const webDb = process.env.WEB_TEST_DATABASE_URL
if (!webDb) throw new Error('WEB_TEST_DATABASE_URL is required for the web integration suite')
if (/neon\.tech/i.test(webDb)) throw new Error('refusing to run destructive tests against Neon')

process.env.DATABASE_URL = webDb
process.env.TEST_DATABASE_URL = webDb
