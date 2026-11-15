import { describe, expect, it } from 'vitest'
import { CountReceiptInput, CreateInventoryItemInput, RecordReceiptInput, SuggestOutput, UpdateInventoryItemInput } from './index'

const id = () => crypto.randomUUID()
const photos = () => ({ goods: [id()], place: [id()], document: [id()] })

describe('inventory contracts', () => {
  it('item codes are short uppercase tokens; names are required in both languages', () => {
    expect(CreateInventoryItemInput.safeParse({ code: 'wash-lbl', nameEn: 'Wash label', nameHi: 'वॉश लेबल' }).data?.code).toBe('WASH-LBL')
    expect(CreateInventoryItemInput.safeParse({ code: 'A', nameEn: 'x', nameHi: 'य' }).success).toBe(false)
    expect(CreateInventoryItemInput.safeParse({ code: 'ZIP', nameEn: 'Zip' }).success).toBe(false)
    expect(CreateInventoryItemInput.parse({ code: 'ZIP', nameEn: 'Zip', nameHi: 'ज़िप' })).toMatchObject({ unit: 'pcs', position: 0 })
    expect(UpdateInventoryItemInput.safeParse({ code: 'NEW' }).data).not.toHaveProperty('code')
  })

  it('a receipt needs at least one item and one photo of each purpose; items are unique', () => {
    const item = id()
    expect(RecordReceiptInput.safeParse({ items: [{ itemId: item }], photos: photos() }).success).toBe(true)
    expect(RecordReceiptInput.safeParse({ items: [], photos: photos() }).success).toBe(false)
    expect(RecordReceiptInput.safeParse({ items: [{ itemId: item }], photos: { ...photos(), document: [] } }).success).toBe(false)
    expect(RecordReceiptInput.safeParse({ items: [{ itemId: item }, { itemId: item }], photos: photos() }).success).toBe(false)
    expect(RecordReceiptInput.safeParse({ items: [{ itemId: item, expectedQty: -1 }], photos: photos() }).success).toBe(false)
    expect(RecordReceiptInput.safeParse({ items: [{ itemId: item, expectedQty: 500 }], photos: photos(), supplier: 'Rex Zips', reference: 'DC-1182' }).success).toBe(true)
  })

  it('a count carries the version, every line a counted quantity', () => {
    const item = id()
    expect(CountReceiptInput.safeParse({ lines: [{ itemId: item, countedQty: 3 }] }).success).toBe(false)
    expect(CountReceiptInput.safeParse({ expectedVersion: 0, lines: [{ itemId: item, expectedQty: 5, countedQty: 3 }] }).success).toBe(true)
    expect(CountReceiptInput.safeParse({ expectedVersion: 0, lines: [{ itemId: item }] }).success).toBe(false)
    expect(CountReceiptInput.safeParse({ expectedVersion: 0, lines: [] }).success).toBe(false)
  })

  it('suggest output is either unavailable or one of the two shapes', () => {
    expect(SuggestOutput.safeParse({ available: false }).success).toBe(true)
    expect(SuggestOutput.safeParse({ available: true, kind: 'goods', items: [{ code: 'ZIP', confidence: 0.9 }] }).success).toBe(true)
    expect(SuggestOutput.safeParse({ available: true, kind: 'document', document: { supplier: 'Rex', reference: null, date: null, lines: [{ text: 'YKK zip 5"', quantity: 500, code: 'ZIP', confidence: 0.8 }] } }).success).toBe(true)
    expect(SuggestOutput.safeParse({ available: true, kind: 'goods' }).success).toBe(false)
  })
})
