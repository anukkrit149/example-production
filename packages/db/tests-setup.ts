import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Same contract as the web suite's setup: pin this project's database inside
// the worker, before @hf/db is imported and reads DATABASE_URL.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../..', '.env') })

const dbUrl = process.env.TEST_DATABASE_URL
if (!dbUrl) throw new Error('TEST_DATABASE_URL is required for the @hf/db suite')
if (/neon\.tech/i.test(dbUrl)) throw new Error('refusing to run destructive tests against Neon')

process.env.DATABASE_URL = dbUrl
