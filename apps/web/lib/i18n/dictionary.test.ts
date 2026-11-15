import { describe, expect, it } from 'vitest'
import { DICT, KEYS, actionLabel, stateName, type Key } from './dictionary'

describe('dictionary', () => {
  it('has every key in both languages, non-empty', () => {
    for (const k of KEYS) {
      expect(DICT.en[k], k).toBeTruthy()
      expect(DICT.hi[k], k).toBeTruthy()
    }
  })
  it('hindi strings are Devanagari', () => {
    // export_csv/export_xlsx are file-format names (CSV, XLSX), not language
    // content — per constraints.md, "data (style codes, shades, tokens...) is
    // never translated," and these two keys hold literal format tokens.
    const NOT_TRANSLATED: Key[] = ['export_csv', 'export_xlsx']
    for (const k of KEYS) {
      if (NOT_TRANSLATED.includes(k)) continue
      expect(/[ऀ-ॿ]/.test(DICT.hi[k]), k).toBe(true)
    }
  })
  it('states and actions are named in both languages', () => {
    expect(stateName('CUT_PENDING_QA', 'hi')).toBe('कटाई QA बाकी')
    expect(actionLabel('issue', 'en')).toBe('Hand to worker')
  })
})
