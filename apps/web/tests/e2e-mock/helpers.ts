import { expect, type Page, type Route } from '@playwright/test'

const COOKIE = 'hf_mock_scenario'
const ORIGIN = 'http://localhost:3051'

/**
 * Name the scenario file, then sign in through the dev picker.
 *
 * The floor defaults to Hindi. Specs assert the English copy, so the phone's
 * language choice is set before the first document loads.
 */
export async function signIn(page: Page, name: string, scenario = 'factory'): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('hf_lang', 'en'))
  await page.context().addCookies([{ name: COOKIE, value: scenario, url: ORIGIN }])
  await page.goto('/dev-login')
  await page.getByRole('button', { name: new RegExp(`^${name}\\b`, 'i') }).click()
  await expect(page).toHaveURL(/\/home$/)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
}

/**
 * Anything under `/api` that a spec did not describe answers 500.
 * Register the specific routes after this one; Playwright gives the later
 * registration priority.
 */
export async function blockUnmockedApi(page: Page): Promise<void> {
  await page.route('**/api/**', (route: Route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'unmocked api' } }) }),
  )
}
