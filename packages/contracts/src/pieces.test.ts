import { describe, expect, it } from 'vitest'
import { ActivatePieceInput, IssueInput, SubmitQaInput } from './pieces'

const uuid = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const checklist = () => ({ versionId: crypto.randomUUID(), answers: [{ itemId: crypto.randomUUID(), value: true as const }] })

describe('contracts', () => {
  it('accepts a valid activation and defaults attachmentIds', () => {
    const r = ActivatePieceInput.parse({ lineItemId: uuid, leatherLot: 'LOT-22', expectedVersion: 0, checklist: checklist() })
    expect(r.attachmentIds).toEqual([])
  })
  it('rejects a QA pass without the checklist', () => {
    expect(() => SubmitQaInput.parse({ stage: 'cutting', result: 'pass', defectCodes: [] })).toThrow()
  })
  it('rejects issue to a non-custody stage', () => {
    expect(() => IssueInput.parse({ stage: 'qc', workerId: uuid, materials: [], checklist: checklist() })).toThrow()
  })
})
