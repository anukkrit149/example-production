import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PICTOGRAMS } from '@hf/domain'

describe('pictogram set', () => {
  it('ships one SVG per registered key, 96x96, stroke only', () => {
    for (const k of PICTOGRAMS) {
      const p = resolve(__dirname, '../public/pictograms', `${k}.svg`)
      expect(existsSync(p), k).toBe(true)
      const svg = readFileSync(p, 'utf8')
      expect(svg).toContain('viewBox="0 0 96 96"')
      expect(svg).toContain('stroke="#171714"')
      expect(svg).not.toContain('fill="#')
    }
  })
})
