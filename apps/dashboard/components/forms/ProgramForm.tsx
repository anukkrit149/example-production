'use client'
import Link from 'next/link'
import { useState } from 'react'
import { mutate } from '@/lib/client-mutate'
import { FormShell } from '../FormShell'
import { Field, inputClass } from '../ui'

type Org = { id: string; name: string }
type Existing = { id: string; name: string; season: string | null; agentId: string | null }

export function ProgramForm({ buyers, agents, program }: { buyers: Org[]; agents: Org[]; program?: Existing }) {
  const [name, setName] = useState(program?.name ?? '')
  const [buyerId, setBuyerId] = useState(buyers[0]?.id ?? '')
  const [agentId, setAgentId] = useState(program?.agentId ?? '')
  const [season, setSeason] = useState(program?.season ?? '')

  const submit = async () => {
    const body = { name, season: season || null, agentId: agentId || null }
    if (program) await mutate(`/api/programs/${program.id}`, body, { method: 'PATCH' })
    else await mutate('/api/programs', { ...body, buyerId })
  }

  return (
    <FormShell onSubmit={submit} submitLabel={program ? 'Save' : 'Create program'}>
      <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus /></Field>
      {!program && (
        <Field label="Buyer" hint={<>Not listed? <Link href="/organizations" className="underline">Add the buyer under Buyers</Link>, then come back.</>}>
          <select className={inputClass} value={buyerId} onChange={(e) => setBuyerId(e.target.value)} required>
            {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Buying house" hint={<>Leave as Direct when the buyer works with the factory directly. New house? <Link href="/organizations" className="underline">Add it under Buyers</Link>.</>}>
        <select className={inputClass} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">Direct</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Season" hint="e.g. AW26"><input className={inputClass} value={season} onChange={(e) => setSeason(e.target.value)} maxLength={32} /></Field>
    </FormShell>
  )
}
