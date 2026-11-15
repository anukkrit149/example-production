'use client'
import { useState } from 'react'
import { mutate } from '@/lib/client-mutate'
import { FormShell } from '../FormShell'
import { Field, inputClass } from '../ui'

type Existing = { id: string; orderNumber: string; dueDate: string | null }

export function OrderForm({ programId, order }: { programId?: string; order?: Existing }) {
  const [orderNumber, setOrderNumber] = useState(order?.orderNumber ?? '')
  const [dueDate, setDueDate] = useState(order?.dueDate ?? '')
  const submit = async () => {
    const body = { orderNumber: orderNumber.trim(), dueDate: dueDate || null }
    if (order) await mutate(`/api/orders/${order.id}`, body, { method: 'PATCH' })
    else await mutate('/api/orders', { ...body, programId })
  }
  return (
    <FormShell onSubmit={submit} submitLabel={order ? 'Save' : 'Create order'}>
      <Field label="Order number" hint="Unique within the program, e.g. PO-4471"><input className={inputClass} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} required maxLength={40} autoFocus /></Field>
      <Field label="Due date"><input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
    </FormShell>
  )
}
