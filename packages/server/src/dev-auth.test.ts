import { afterEach, describe, expect, it, vi } from 'vitest'
import { devAuthEnabled } from './dev-auth'

describe('devAuthEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as { navigator?: unknown }).navigator
  })

  it('DEV_AUTH unset is false', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_AUTH', '')
    expect(devAuthEnabled()).toBe(false)
  })

  it('DEV_AUTH=true in development is true', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_AUTH', 'true')
    expect(devAuthEnabled()).toBe(true)
  })

  it('DEV_AUTH=true with a Cloudflare Workers user agent is false', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_AUTH', 'true')
    ;(globalThis as { navigator?: { userAgent?: string } }).navigator = { userAgent: 'Cloudflare-Workers' }
    expect(devAuthEnabled()).toBe(false)
  })

  it('DEV_AUTH=true with NODE_ENV=production is false', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEV_AUTH', 'true')
    expect(devAuthEnabled()).toBe(false)
  })
})
