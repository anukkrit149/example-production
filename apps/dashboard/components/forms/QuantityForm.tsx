'use client'
import { useState } from 'react'
import { mutate } from '@/lib/client-mutate'
import { FormShell } from '../FormShell'
import { Field, inputClass } from '../ui'

/**
 * Raising adds planned pieces. Lowering cancels planned pieces (never cut ones)
 * and needs a reason, which lands on every cancellation event.
 */
export function QuantityForm({ lineItemId, current, activated }: { lineItemId: string; current: number; activated: number }) {
  const [quantity, setQuantity] = useState(String(current))
  const [reason, setReason] = useState('')
  const target = Number(quantity)
  const decreasing = Number.isFinite(target) && target < current
  const submit = async () => {
    await mutate(`/api/line-items/${lineItemId}/quantity`, { quantity: target, ...(decreasing ? { reason: reason.trim() } : {}) })
  }
  return (
    <FormShell onSubmit={submit} submitLabel="Change quantity">
      <p className="text-sm" style={{ color: 'var(--hf-muted)' }}>Currently {current} ordered; {activated} already cut. The quantity cannot go below {activated}.</p>
      <Field label="New quantity"><input type="number" min={activated} max={5000} className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} required autoFocus /></Field>
      {decreasing && (
        <Field label="Reason" hint={`${current - target} planned ${current - target === 1 ? 'piece' : 'pieces'} will be cancelled. ${current - target === 1 ? 'Its label' : 'Their labels'}, if printed, must be destroyed.`}>
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={200} />
        </Field>
      )}
    </FormShell>
  )
}
