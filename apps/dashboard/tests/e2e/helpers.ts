import { expect, type Page } from '@playwright/test'
import type { PrismaClient } from '@hf/db'

let client: PrismaClient | undefined

export async function connectDb(): Promise<void> {
  if (client) return
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required to run the end-to-end suite')
  if (/neon\.tech/i.test(url)) throw new Error('refusing to run the e2e suite against Neon')
  const { makePrismaClient } = (await import('@hf/db')) as typeof import('@hf/db')
  client = makePrismaClient(url)
}
export async function disconnectDb(): Promise<void> { await client?.$disconnect(); client = undefined }
export function db(): PrismaClient {
  if (!client) throw new Error('connectDb() must run before db()')
  return client
}

/** Through the dev picker; the real door is Neon Auth, which no test can complete without a mailbox. */
export async function signIn(page: Page, name: string): Promise<void> {
  await page.goto('/dev-login')
  await page.getByRole('button', { name: new RegExp(`^${name}\\b`, 'i') }).click()
  await expect(page).toHaveURL(/\/overview$/)
}

/** Sidebar navigation: Next's client-side transition is async, so wait for the URL before touching the new page. */
export async function nav(page: Page, label: string, url: RegExp): Promise<void> {
  await page.getByRole('link', { name: label }).click()
  await expect(page).toHaveURL(url)
}

/** Fill the open drawer's form by label and submit. */
export async function fillDrawer(page: Page, fields: Record<string, string>, submit: RegExp): Promise<void> {
  const drawer = page.getByRole('dialog')
  for (const [label, value] of Object.entries(fields)) {
    const control = drawer.getByLabel(label, { exact: true })
    if ((await control.evaluate((el) => el.tagName)) === 'SELECT') await control.selectOption({ label: value })
    else await control.fill(value)
  }
  await drawer.getByRole('button', { name: submit }).click()
  await expect(drawer).toBeHidden()
}
