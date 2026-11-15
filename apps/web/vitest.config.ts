import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import path from 'node:path'

config({ path: '../../.env' })

// The web integration suite runs against its own database so it never races the
// @hf/db suite, which truncates every table between its tests. `env` is scoped
// to this project's worker processes, unlike mutating process.env at load time.
const webDb = process.env.WEB_TEST_DATABASE_URL!

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    include: ['tests/integration/**/*.test.ts', 'components/**/*.test.ts', 'lib/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    fileParallelism: false,
    isolate: true,
    pool: 'forks',
    environment: 'node',
    env: { DATABASE_URL: webDb, TEST_DATABASE_URL: webDb },
  },
})
