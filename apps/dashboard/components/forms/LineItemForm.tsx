'use client'
import { useMemo, useState } from 'react'
import { sizesFor } from '@hf/domain'
import { mutate } from '@/lib/client-mutate'
import { FormShell } from '../FormShell'
import { Field, inputClass } from '../ui'

type StyleOpt = { id: string; styleCode: string; category: string; description: string | null }

export function LineItemForm({ orderId, styles }: { orderId: string; styles: StyleOpt[] }) {
  const [styleId, setStyleId] = useState(styles[0]?.id ?? '')
  const style = useMemo(() => styles.find((s) => s.id === styleId), [styles, styleId])
  const sizes = sizesFor(style?.category ?? '')
  const [size, setSize] = useState(sizes[0] ?? '')
  const [shade, setShade] = useState('')
  const [quantity, setQuantity] = useState('')

  const pickStyle = (id: string) => {
    setStyleId(id)
    const next = styles.find((s) => s.id === id)
    setSize(sizesFor(next?.category ?? '')[0] ?? '')
  }

  const submit = async () => {
    await mutate('/api/line-items', { orderId, styleId, size, shade: shade.trim().toUpperCase(), quantity: Number(quantity) })
  }

  return (
    <FormShell onSubmit={submit} submitLabel="Add line item">
      <Field label="Style">
        <select className={inputClass} value={styleId} onChange={(e) => pickStyle(e.target.value)} required>
          {styles.map((s) => <option key={s.id} value={s.id}>{s.styleCode} · {s.category}{s.description ? ` · ${s.description}` : ''}</option>)}
        </select>
      </Field>
      <Field label="Size" hint={sizes.length === 1 ? 'This category is one size.' : undefined}>
        <select className={inputClass} value={size} onChange={(e) => setSize(e.target.value)} required disabled={sizes.length === 1}>
          {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Shade" hint="As printed on the label, e.g. BLK-02"><input className={inputClass} value={shade} onChange={(e) => setShade(e.target.value)} required maxLength={32} /></Field>
      <Field label="Quantity" hint="One planned piece, with its own QR token, is created per unit."><input type="number" min={1} max={5000} className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></Field>
    </FormShell>
  )
}
