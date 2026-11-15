import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import path from 'node:path'

config({ path: '../../.env' })

// Own database, never shared with the @hf/db or @hf/web suites: every suite
// truncates every table between tests.
const db = process.env.DASHBOARD_TEST_DATABASE_URL!

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    fileParallelism: false,
    isolate: true,
    pool: 'forks',
    environment: 'node',
    env: { DATABASE_URL: db, TEST_DATABASE_URL: db },
  },
})
