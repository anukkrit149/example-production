'use client'
import { useState } from 'react'
import { mutate } from '@/lib/client-mutate'
import { FormShell } from '../FormShell'
import { Field, inputClass } from '../ui'

type Existing = { id: string; name: string; active: boolean }

export function OrganizationForm({ org }: { org?: Existing }) {
  const [type, setType] = useState<'buyer' | 'agent'>('buyer')
  const [name, setName] = useState(org?.name ?? '')
  const [active, setActive] = useState(org?.active ?? true)
  const submit = async () => {
    if (org) await mutate(`/api/organizations/${org.id}`, { name, active }, { method: 'PATCH' })
    else await mutate('/api/organizations', { type, name })
  }
  return (
    <FormShell onSubmit={submit} submitLabel={org ? 'Save' : 'Create'}>
      {!org && (
        <Field label="Type" hint="A buying house coordinates for many buyers; a buyer may also come direct.">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as 'buyer' | 'agent')}>
            <option value="buyer">Buyer</option><option value="agent">Buying house</option>
          </select>
        </Field>
      )}
      <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus /></Field>
      {org && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (offered when creating programs and styles)</label>}
    </FormShell>
  )
}
