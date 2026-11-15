'use client'
import { useState } from 'react'
import { USER_ROLES } from '@hf/contracts'
import { mutate } from '@/lib/client-mutate'
import { FormShell } from '../FormShell'
import { Field, inputClass } from '../ui'

type Existing = { id: string; name: string; role: string; active: boolean }

export function TeamMemberForm({ member }: { member?: Existing }) {
  const [name, setName] = useState(member?.name ?? '')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(member?.role ?? 'merchandiser')
  const [active, setActive] = useState(member?.active ?? true)
  const submit = async () => {
    if (member) await mutate(`/api/team/${member.id}`, { name, role, active }, { method: 'PATCH' })
    else await mutate('/api/team', { name, role, ...(email.trim() ? { email } : {}) })
  }
  return (
    <FormShell onSubmit={submit} submitLabel={member ? 'Save' : 'Add to team'}>
      <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus /></Field>
      {!member && (
        <Field
          label={role === 'admin' ? 'Email' : 'Email (optional)'}
          hint={role === 'admin' ? 'Admins sign in to the dashboard with this address.' : 'For dashboard sign-in. Leave blank for someone who signs in on the phone with a code — issue it from the phone\u2019s Admin screen.'}
        >
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required={role === 'admin'} />
        </Field>
      )}
      <Field label="Role" hint="merchandiser and admin can create and edit; the rest read.">
        <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>{USER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
      </Field>
      {member && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>}
    </FormShell>
  )
}
