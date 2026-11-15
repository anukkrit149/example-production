import { describe, expect, it } from 'vitest'
import { appendTranscript } from './use-dictation'

describe('appendTranscript', () => {
  it('appends with one space and never replaces', () => {
    expect(appendTranscript('', ' shelf two ')).toBe('shelf two')
    expect(appendTranscript('R2', 'B')).toBe('R2 B')
    expect(appendTranscript('R2 ', '')).toBe('R2')
  })
})
