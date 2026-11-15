import { defineConfig, devices } from '@playwright/test'

/**
 * Browser suite with no database and no object storage.
 *
 * `webServer.env` is a closed set on purpose. Spreading `process.env` would
 * pull DATABASE_URL and S3_* out of a developer's shell or `.env`, and this
 * command is supposed to run without either. PATH, HOME and TMPDIR stay so
 * Node and pnpm can start.
 *
 * Port 3051. The full-stack suite owns 3050 and `pnpm dev` owns 3000, and
 * `reuseExistingServer` is off so this never attaches to one of those.
 */
const PORT = 3051
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'tests/e2e-mock',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    ...devices['Pixel 7'],
    permissions: ['camera'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `${BASE_URL}/signin`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      NODE_ENV: 'development',
      HF_E2E_MOCK: '1',
      DEV_AUTH: 'true',
    },
  },
})
