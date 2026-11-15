import { describe, expect, it } from 'vitest'
import { ChecklistAnswer, ChecklistAnswers, ChecklistItemInput, IssueInput, PackInput, SubmitQaInput } from './index'

const id = () => crypto.randomUUID()
const answers = () => ({ versionId: id(), answers: [{ itemId: id(), value: true as const }] })

describe('checklist contracts', () => {
  it('rejects a false answer', () => {
    expect(ChecklistAnswers.safeParse({ versionId: id(), answers: [{ itemId: id(), value: false }] }).success).toBe(false)
  })
  it('rejects an empty answer list', () => {
    expect(ChecklistAnswers.safeParse({ versionId: id(), answers: [] }).success).toBe(false)
  })
  it('a QA pass needs the checklist, a fail needs a reason', () => {
    expect(SubmitQaInput.safeParse({ stage: 'cutting', result: 'pass' }).success).toBe(false)
    expect(SubmitQaInput.safeParse({ stage: 'cutting', result: 'pass', checklist: answers() }).success).toBe(true)
    expect(SubmitQaInput.safeParse({ stage: 'cutting', result: 'fail' }).success).toBe(false)
    expect(SubmitQaInput.safeParse({ stage: 'cutting', result: 'fail', defectCodes: ['SCRATCH'] }).success).toBe(true)
  })
  it('issue and pack carry the checklist; carton is uppercased', () => {
    expect(IssueInput.safeParse({ stage: 'pasting', workerId: id() }).success).toBe(false)
    const p = PackInput.parse({ carton: ' ctn-07 ', checklist: answers() })
    expect(p.carton).toBe('CTN-07')
  })
  it('answers are true for checks and a finite number for measurements', () => {
    expect(ChecklistAnswer.safeParse({ itemId: id(), value: true }).success).toBe(true)
    expect(ChecklistAnswer.safeParse({ itemId: id(), value: 44.5 }).success).toBe(true)
    expect(ChecklistAnswer.safeParse({ itemId: id(), value: false }).success).toBe(false)
    expect(ChecklistAnswer.safeParse({ itemId: id(), value: '44' }).success).toBe(false)
    expect(ChecklistAnswer.safeParse({ itemId: id(), value: Number.NaN }).success).toBe(false)
  })
  it('a measure item needs a unit and an ordered range; other kinds carry none', () => {
    const base = { textEn: 'Arm hole', textHi: 'आर्म होल', pictogram: 'measure' }
    expect(ChecklistItemInput.safeParse({ kind: 'measure', ...base }).success).toBe(false)
    expect(ChecklistItemInput.safeParse({ kind: 'measure', ...base, unit: 'cm' }).success).toBe(true)
    expect(ChecklistItemInput.safeParse({ kind: 'measure', ...base, unit: 'cm', min: 46, max: 44 }).success).toBe(false)
    expect(ChecklistItemInput.safeParse({ kind: 'measure', ...base, unit: 'cm', min: 44, max: 46 }).success).toBe(true)
    expect(ChecklistItemInput.safeParse({ kind: 'confirm', ...base, unit: 'cm' }).success).toBe(false)
  })
})
