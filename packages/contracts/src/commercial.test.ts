import { describe, expect, it } from 'vitest'
import {
  ChangeQuantityInput, CreateLineItemInput, CreateOrderInput, CreateOrganizationInput,
  CreateProgramInput, CreateStyleInput, CreateTeamMemberInput, UpdateStyleInput,
} from './commercial'

const uuid = '11111111-1111-4111-8111-111111111111'

describe('commercial contracts', () => {
  it('organisation needs a type and a name', () => {
    expect(CreateOrganizationInput.safeParse({ type: 'buyer', name: 'Nordheim GmbH' }).success).toBe(true)
    expect(CreateOrganizationInput.safeParse({ type: 'buying_house', name: 'X' }).success).toBe(false)
    expect(CreateOrganizationInput.safeParse({ type: 'agent', name: '' }).success).toBe(false)
  })
  it('program: buyer required, agent optional and nullable', () => {
    expect(CreateProgramInput.safeParse({ name: 'Autumn 26', buyerId: uuid }).success).toBe(true)
    expect(CreateProgramInput.safeParse({ name: 'Autumn 26', buyerId: uuid, agentId: null, season: 'AW26' }).success).toBe(true)
    expect(CreateProgramInput.safeParse({ name: 'Autumn 26' }).success).toBe(false)
  })
  it('order: due date is a plain date or null', () => {
    expect(CreateOrderInput.safeParse({ programId: uuid, orderNumber: 'PO-4471', dueDate: '2026-11-15' }).success).toBe(true)
    expect(CreateOrderInput.safeParse({ programId: uuid, orderNumber: 'PO-4471', dueDate: null }).success).toBe(true)
    expect(CreateOrderInput.safeParse({ programId: uuid, orderNumber: 'PO-4471', dueDate: '15/11/2026' }).success).toBe(false)
  })
  it('style code is normalised then validated', () => {
    const ok = CreateStyleInput.parse({ styleCode: ' lj-204 ', category: 'jacket', gender: 'mens' })
    expect(ok.styleCode).toBe('LJ-204')
    expect(CreateStyleInput.safeParse({ styleCode: '1AB', category: 'jacket', gender: 'mens' }).success).toBe(false)
    expect(CreateStyleInput.safeParse({ styleCode: 'LJ-204', category: 'hat', gender: 'mens' }).success).toBe(false)
  })
  it('a style may carry one reference attachment id, or null to clear it', () => {
    expect(CreateStyleInput.safeParse({ styleCode: 'LJ-1', category: 'jacket', gender: 'mens', referenceAttachmentId: uuid }).success).toBe(true)
    expect(CreateStyleInput.safeParse({ styleCode: 'LJ-1', category: 'jacket', gender: 'mens', referenceAttachmentId: 'nope' }).success).toBe(false)
    expect(UpdateStyleInput.safeParse({ referenceAttachmentId: null }).success).toBe(true)
    expect(UpdateStyleInput.safeParse({}).data).not.toHaveProperty('referenceAttachmentId')
  })
  it('line item quantity is a positive integer up to 5000', () => {
    const base = { orderId: uuid, styleId: uuid, size: 'M', shade: 'BLK-02' }
    expect(CreateLineItemInput.safeParse({ ...base, quantity: 20 }).success).toBe(true)
    expect(CreateLineItemInput.safeParse({ ...base, quantity: 0 }).success).toBe(false)
    expect(CreateLineItemInput.safeParse({ ...base, quantity: 5001 }).success).toBe(false)
    expect(CreateLineItemInput.safeParse({ ...base, quantity: 2.5 }).success).toBe(false)
  })
  it('quantity change allows zero and an optional reason', () => {
    expect(ChangeQuantityInput.safeParse({ quantity: 0 }).success).toBe(true)
    expect(ChangeQuantityInput.safeParse({ quantity: 12, reason: 'buyer cut the order' }).success).toBe(true)
    expect(ChangeQuantityInput.safeParse({ quantity: 12, reason: 'no' }).success).toBe(false)
    expect(ChangeQuantityInput.safeParse({ quantity: -1 }).success).toBe(false)
  })
  it('team member email is lowercased', () => {
    const t = CreateTeamMemberInput.parse({ name: 'Merch One', email: 'Merch.One@Example.com', role: 'merchandiser' })
    expect(t.email).toBe('merch.one@example.com')
    expect(CreateTeamMemberInput.safeParse({ name: 'P', email: 'not-an-email', role: 'merchandiser' }).success).toBe(false)
  })
  it('team member email is optional for everyone but an admin', () => {
    expect(CreateTeamMemberInput.safeParse({ name: 'Store One', role: 'store' }).success).toBe(true)
    expect(CreateTeamMemberInput.safeParse({ name: 'Store One', role: 'qa' }).success).toBe(true)
    const admin = CreateTeamMemberInput.safeParse({ name: 'Boss', role: 'admin' })
    expect(admin.success).toBe(false)
    if (!admin.success) expect(admin.error.issues[0]?.path).toEqual(['email'])
    expect(CreateTeamMemberInput.safeParse({ name: 'Boss', email: 'boss@example.com', role: 'admin' }).success).toBe(true)
  })
})
