'use client'
import { createAuthClient } from '@neondatabase/auth/next'

/**
 * Zero-argument on purpose: the Next entrypoint's client talks to this app's
 * own /api/auth/[...path] proxy, which is where the Neon base URL and the
 * cookie secret live. No Neon URL is ever shipped to the browser.
 */
export const authClient = createAuthClient()
