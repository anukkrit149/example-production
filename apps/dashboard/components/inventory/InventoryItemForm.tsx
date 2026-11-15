'use client'
import { useState } from 'react'
import { mutate } from '@/lib/client-mutate'
import { FormShell } from '../FormShell'
import { Field, inputClass } from '../ui'

type Existing = { id: string; code: string; nameEn: string; nameHi: string; unit: string; position: number; active: boolean }

/** New item: everything. Edit: everything but the code, which chips and old receipts key on. */
export function InventoryItemForm({ item }: { item?: Existing }) {
  const [code, setCode] = useState(item?.code ?? '')
  const [nameEn, setNameEn] = useState(item?.nameEn ?? '')
  const [nameHi, setNameHi] = useState(item?.nameHi ?? '')
  const [unit, setUnit] = useState(item?.unit ?? 'pcs')
  const [position, setPosition] = useState(String(item?.position ?? 0))
  const [active, setActive] = useState(item?.active ?? true)

  const submit = async () => {
    const pos = Number(position) || 0
    if (item) await mutate(`/api/inventory/items/${item.id}`, { nameEn, nameHi, unit, position: pos, active }, { method: 'PATCH' })
    else await mutate('/api/inventory/items', { code, nameEn, nameHi, unit, position: pos })
  }

  return (
    <FormShell onSubmit={submit} submitLabel={item ? 'Save' : 'Create item'}>
      <Field label="Code" hint={item ? 'Printed on chips and old receipts; the code cannot change.' : '2–16 letters, digits and hyphens. What the phone shows on the chip.'}>
        <input className={`${inputClass} font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required pattern="[A-Za-z0-9][A-Za-z0-9\-]{1,15}" disabled={Boolean(item)} autoFocus={!item} />
      </Field>
      <Field label="English name"><input className={inputClass} value={nameEn} onChange={(e) => setNameEn(e.target.value)} required maxLength={60} /></Field>
      <Field label="Hindi name" hint="Devanagari, as the floor reads it."><input className={inputClass} value={nameHi} onChange={(e) => setNameHi(e.target.value)} required maxLength={60} lang="hi" /></Field>
      <Field label="Unit"><input className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)} required maxLength={12} /></Field>
      <Field label="Position" hint="Chips are ordered by this, lowest first."><input className={inputClass} type="number" min={0} value={position} onChange={(e) => setPosition(e.target.value)} /></Field>
      {item && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (offered on the phone)</label>}
    </FormShell>
  )
}
