import { describe, expect, it } from 'vitest'
import { ApiError } from '@hf/server'
import { requireSameOrigin } from './same-origin'

const req = (headers: Record<string, string>) =>
  new Request('http://localhost/api/auth/badge', { method: 'POST', headers })

const json = { 'content-type': 'application/json' }

describe('requireSameOrigin', () => {
  it('allows a same-origin JSON post', () => {
    expect(() =>
      requireSameOrigin(req({ ...json, origin: 'http://localhost:3000', host: 'localhost:3000' })),
    ).not.toThrow()
  })

  it('allows a JSON post with no Origin at all', () => {
    // Some browsers omit it on same-origin requests, and every server-side
    // caller does. Absence proves nothing either way; a wrong value proves
    // everything.
    expect(() => requireSameOrigin(req(json))).not.toThrow()
  })

  it('refuses a cross-origin post even with the right content type', () => {
    expect(() =>
      requireSameOrigin(req({ ...json, origin: 'https://evil.example', host: 'localhost:3000' })),
    ).toThrow(ApiError)
  })

  it('refuses the content types an HTML form can actually send', () => {
    // This is the vector: a form is the only way another site can POST here
    // without a CORS preflight, and a form cannot send JSON.
    for (const ct of [
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
      '',
    ]) {
      expect(() => requireSameOrigin(req({ 'content-type': ct }))).toThrow(ApiError)
    }
  })

  it('accepts a charset on the content type', () => {
    expect(() =>
      requireSameOrigin(req({ 'content-type': 'application/json; charset=utf-8' })),
    ).not.toThrow()
  })

  it('refuses an unparseable Origin, and one with no Host to check it against', () => {
    expect(() => requireSameOrigin(req({ ...json, origin: 'not a url', host: 'localhost' }))).toThrow(
      ApiError,
    )
    expect(() => requireSameOrigin(req({ ...json, origin: 'http://localhost' }))).toThrow(ApiError)
  })
})
