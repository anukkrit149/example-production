import { describe, expect, it } from 'vitest'
import { emailFromIdentity, emailIdentity, isAutoAdminEmail, isEmailIdentity } from './identity'

describe('email identity', () => {
  it('lowercases and prefixes', () => {
    expect(emailIdentity('  Merch.One@Example.com ')).toBe('email:merch.one@example.com')
    expect(isEmailIdentity('email:a@b.c')).toBe(true)
    expect(isEmailIdentity('dev:admin')).toBe(false)
    expect(emailFromIdentity('email:a@b.c')).toBe('a@b.c')
    expect(emailFromIdentity('dev:admin')).toBeNull()
  })
})

describe('isAutoAdminEmail', () => {
  it('matches the company domain exactly, case-insensitively', () => {
    expect(isAutoAdminEmail('someone@factory.example')).toBe(true)
    expect(isAutoAdminEmail('  Someone@Factory.EXAMPLE ')).toBe(true)
  })
  it('rejects look-alikes and other domains', () => {
    expect(isAutoAdminEmail('x@factory.example.evil')).toBe(false)
    expect(isAutoAdminEmail('x@evil-factory.example')).toBe(false)
    expect(isAutoAdminEmail('factory.example@not-a-host.example')).toBe(false)
    expect(isAutoAdminEmail('merch.one@example.com')).toBe(false)
    expect(isAutoAdminEmail('not-an-email')).toBe(false)
  })
})
