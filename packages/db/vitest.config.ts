import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

config({ path: '../../.env' })

// This suite truncates every table between tests, so it owns TEST_DATABASE_URL
// outright. `env` is scoped to this project's worker processes, which keeps the
// web integration suite (on its own database) unaffected when both run together.
const dbUrl = process.env.HF_DB_TEST_URL ?? process.env.TEST_DATABASE_URL!

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['tests-setup.ts'],
    fileParallelism: false,
    isolate: true,
    pool: 'forks',
    env: { DATABASE_URL: dbUrl, TEST_DATABASE_URL: dbUrl },
  },
})
