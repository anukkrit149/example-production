import { describe, expect, it } from 'vitest'
import { attachmentIds, stepFor, withPhoto, type PhotoMap } from './checklist-client'

describe('photos keyed by item', () => {
  it('a second YES on the same item replaces its photo rather than adding one', () => {
    // The operator answers the photo item, walks back, and answers it again.
    let photos: PhotoMap = {}
    photos = withPhoto(photos, 'item-photo', 'att-1')
    photos = withPhoto(photos, 'item-photo', 'att-1')
    expect(attachmentIds(photos)).toEqual(['att-1'])
  })

  it('a retake sends only the new photo', () => {
    let photos: PhotoMap = withPhoto({}, 'item-photo', 'att-old')
    photos = withPhoto(photos, 'item-photo', 'att-new')
    expect(attachmentIds(photos)).toEqual(['att-new'])
  })

  it('keeps one photo per item when several items carry one', () => {
    let photos: PhotoMap = {}
    photos = withPhoto(photos, 'a', 'att-a')
    photos = withPhoto(photos, 'b', 'att-b')
    photos = withPhoto(photos, 'a', 'att-a2')
    expect(attachmentIds(photos)).toEqual(['att-a2', 'att-b'])
  })

  it('answering without a photo drops the one that item had', () => {
    const photos = withPhoto(withPhoto({}, 'a', 'att-a'), 'a', undefined)
    expect(attachmentIds(photos)).toEqual([])
  })

  it('leaves non-photo items out of the payload entirely', () => {
    expect(attachmentIds(withPhoto({}, 'confirm-item', undefined))).toEqual([])
  })
})

describe('stepFor', () => {
  it('reads the current stage for QA and receive, the next custody stage for issue', () => {
    expect(stepFor('submit_qa', { stage: 'cutting', nextCustody: 'pasting' })).toEqual({ step: 'qa', stage: 'cutting' })
    expect(stepFor('receive', { stage: 'pasting', nextCustody: null })).toEqual({ step: 'receive', stage: 'pasting' })
    expect(stepFor('issue', { stage: 'cutting', nextCustody: 'pasting' })).toEqual({ step: 'issue', stage: 'pasting' })
  })

  it('has no stage for the piece-wide steps', () => {
    expect(stepFor('activate', { stage: null, nextCustody: null })).toEqual({ step: 'activate', stage: null })
    expect(stepFor('pack', { stage: 'packaging', nextCustody: null })).toEqual({ step: 'pack', stage: null })
  })
})
