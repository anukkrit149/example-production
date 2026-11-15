'use client'
import { useState } from 'react'
import { STYLE_CATEGORIES } from '@hf/domain'
import { GENDERS } from '@hf/contracts'
import { mutate } from '@/lib/client-mutate'
import { FormShell } from '../FormShell'
import { Field, inputClass } from '../ui'
import { ReferencePhotoField } from './ReferencePhotoField'

type Org = { id: string; name: string }
type Existing = { id: string; styleCode: string; description: string | null; ownerId: string | null; active: boolean; frozen: boolean; referenceAttachmentId?: string | null; referencePhotoUrl?: string | null }

export function StyleForm({ owners, style }: { owners: Org[]; style?: Existing }) {
  const [styleCode, setStyleCode] = useState(style?.styleCode ?? '')
  const [category, setCategory] = useState<string>(STYLE_CATEGORIES[0])
  const [gender, setGender] = useState<string>('unisex')
  const [ownerId, setOwnerId] = useState(style?.ownerId ?? '')
  const [description, setDescription] = useState(style?.description ?? '')
  const [active, setActive] = useState(style?.active ?? true)
  // undefined = the photo was not touched, so the patch must leave it alone.
  const [reference, setReference] = useState<string | null | undefined>(undefined)

  const submit = async () => {
    if (style) {
      await mutate(`/api/styles/${style.id}`, { ...(style.frozen ? {} : { styleCode }), description: description || null, ownerId: ownerId || null, active, ...(reference !== undefined ? { referenceAttachmentId: reference } : {}) }, { method: 'PATCH' })
    } else {
      await mutate('/api/styles', { styleCode, category, gender, ownerId: ownerId || null, description: description || null, referenceAttachmentId: reference ?? null })
    }
  }

  return (
    <FormShell onSubmit={submit} submitLabel={style ? 'Save' : 'Create style'}>
      <Field label="Style code" hint={style?.frozen ? 'Printed on labels already; the code cannot change.' : '2–12 characters, letters, digits and hyphens. Printed on every label.'}>
        <input className={`${inputClass} font-mono uppercase`} value={styleCode} onChange={(e) => setStyleCode(e.target.value.toUpperCase())} required pattern="[A-Za-z][A-Za-z0-9\-]{1,11}" disabled={style?.frozen} autoFocus />
      </Field>
      {!style && (
        <>
          <Field label="Category"><select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>{STYLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
          <Field label="Gender"><select className={inputClass} value={gender} onChange={(e) => setGender(e.target.value)}>{GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}</select></Field>
        </>
      )}
      <Field label="Owner" hint="The buyer who owns the design. Leave empty for a factory base style.">
        <select className={inputClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">Factory base style</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </Field>
      <Field label="Description"><input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} /></Field>
      <ReferencePhotoField value={reference} currentUrl={style?.referencePhotoUrl ?? null} onChange={setReference} />
      {style && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (offered when adding line items)</label>}
    </FormShell>
  )
}
