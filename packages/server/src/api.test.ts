import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validationMessage } from './api'

const issuesOf = (schema: z.ZodType, value: unknown) => {
  const r = schema.safeParse(value)
  if (r.success) throw new Error('expected a failure')
  return r.error.issues
}

describe('validationMessage', () => {
  it('names the field and keeps the schema message', () => {
    const schema = z.object({ styleCode: z.string().regex(/^[A-Z]/, 'must start with a letter') })
    expect(validationMessage(issuesOf(schema, { styleCode: '1-BAD' }))).toBe('Style code: must start with a letter')
  })

  it('splits camelCase and nested paths into words', () => {
    const schema = z.object({ line: z.object({ dueDate: z.string().min(1) }) })
    expect(validationMessage(issuesOf(schema, { line: { dueDate: '' } }))).toMatch(/^Line due date: /)
  })

  it('falls back to the bare message at the root, and to a default with no issues', () => {
    expect(validationMessage(issuesOf(z.string(), 42))).toMatch(/^Invalid input/)
    expect(validationMessage([])).toBe('invalid input')
  })
})
