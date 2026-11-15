import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'
import { resolve } from 'node:path'

// `__dirname`, not `import.meta.url`: apps/web has no `"type": "module"`, so
// Playwright transpiles this file to CommonJS and `import.meta` is a syntax
// error there.
const repoRoot = resolve(__dirname, '../..')

// The suite's own copy of the environment, loaded before anything reads it.
// `globalSetup` resets and reseeds whatever DATABASE_URL names, so the value
// here is load-bearing: it decides which database is about to be wiped.
config({ path: resolve(repoRoot, '.env') })

/**
 * Port 3050, not 3000.
 *
 * A developer almost always has `pnpm dev` already up on 3000 pointed at their
 * working database. This suite destroys and reseeds its database on every run,
 * so it must never be able to attach to that server by accident — a distinct
 * port makes the two physically incapable of colliding.
 */
const PORT = 3050

/**
 * `localhost`, and emphatically not `127.0.0.1`.
 *
 * Next 16 blocks requests to its dev resources from any origin it did not
 * expect, and the dev server's expected origin is `localhost`. Browsing the
 * same server through the loopback IP is treated as cross-origin: the HMR
 * client is refused, and with it the dev runtime never hands the page to
 * React — every screen renders its server HTML and then stays permanently
 * dead. No console error, no failed chunk, just buttons that do nothing.
 * Losing an afternoon to that once is enough.
 */
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',

  // 60s per test: a happy-path case walks six screens, each of which uploads a
  // photo through a presigned PUT to MinIO and waits for the confirm round trip.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /*
   * Serial, always. Every case activates pieces out of the same finite pool of
   * seeded PLANNED rows and the double-tap case counts rows in the event table;
   * two workers racing through those would make the counts meaningless. This is
   * a correctness constraint, not a speed trade-off.
   */
  fullyParallel: false,
  workers: 1,

  // Zero retries on purpose. A retry hides exactly the flake this suite exists
  // to catch, and a green run that needed a second attempt is not green.
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    // The floor runs this on a phone held in one hand, so the tests do too.
    ...devices['Pixel 7'],
    // Granted so the scanner's getUserMedia call fails on "no camera" rather
    // than on "denied"; either way it falls back to the typed-code field, which
    // is what a scuffed label forces on a real bench anyway.
    permissions: ['camera'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: {
      // Chromium's synthetic camera: CameraCapture and QrScanner both open a
      // real getUserMedia stream, and a headless runner has no hardware to
      // grant. These two flags hand back a fake video device instead of
      // denying the call, so the live-camera UI is exercised for real.
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },

  webServer: {
    // `next dev` rather than a production build: the suite is about the app's
    // behaviour, and a build step per run would add minutes to every iteration.
    command: `pnpm exec next dev --port ${PORT}`,
    url: `${BASE_URL}/signin`,
    // Locally, reusing a server started by hand saves a cold Next boot. In CI
    // there is never one to reuse and silently attaching to a stray process
    // would be a way to test the wrong build.
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      // Spread first: `env` replaces the child's environment rather than
      // extending it, so omitting this would start the server without
      // DATABASE_URL, S3 credentials or PATH.
      ...process.env,
      // The dev picker is how every case but the operator-code one signs in:
      // this suite is here to prove the production workflow, not the keypad.
      DEV_AUTH: 'true',
    },
  },
})
