'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CartonRow } from '@hf/server'
import { MutateError, mutate } from '@/lib/client-mutate'
import { Drawer, useDrawer } from './Drawer'
import { Button, Empty } from './ui'

type ResolvedItem = { id: string; textEn: string; textHi: string }
type ResolvedChecklist = { id: string; items: ResolvedItem[] }

async function uploadPhoto(file: File): Promise<string> {
  const start = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mime: file.type === 'image/webp' ? 'image/webp' : 'image/jpeg', bytes: file.size }),
  })
  if (!start.ok) throw new Error('could not start the photo upload')
  const { attachmentId, uploadUrl } = (await start.json()) as { attachmentId: string; uploadUrl: string }

  const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } })
  if (!put.ok) throw new Error('photo upload failed, check the network')

  const confirm = await fetch(`/api/uploads/${attachmentId}/confirm`, { method: 'POST' })
  if (!confirm.ok) throw new Error('photo did not reach storage, try again')

  return attachmentId
}

/** The ship drawer's body: the resolved checklist as toggles, a photo, and Ship carton. */
function ShipCartonForm({ orderId, carton }: { orderId: string; carton: string }) {
  const router = useRouter()
  const { close } = useDrawer()
  const [checklist, setChecklist] = useState<ResolvedChecklist | null | undefined>(undefined)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One idempotency key per drawer session, reused across retries: a click
  // after an ambiguous failure (network drop, timeout) must replay the same
  // ship attempt, never mint a second SHIPPED event per piece under a fresh key.
  const [key] = useState(() => crypto.randomUUID())

  useEffect(() => {
    let cancelled = false
    fetch(`/api/checklists/resolve?orderId=${orderId}&carton=${encodeURIComponent(carton)}`)
      .then((r) => r.json())
      .then((body: { checklist: ResolvedChecklist | null }) => { if (!cancelled) setChecklist(body.checklist) })
      .catch(() => { if (!cancelled) setChecklist(null) })
    return () => { cancelled = true }
  }, [orderId, carton])

  const allChecked = checklist ? checklist.items.every((i) => checked[i.id]) : false
  const canSubmit = checklist && allChecked && file && !busy

  const submit = async () => {
    if (!checklist || !file) return
    setBusy(true)
    setError(null)
    try {
      const attachmentId = await uploadPhoto(file)
      await mutate(`/api/cartons/${encodeURIComponent(carton)}/ship`, {
        orderId,
        attachmentIds: [attachmentId],
        checklist: { versionId: checklist.id, answers: checklist.items.map((i) => ({ itemId: i.id, value: true })) },
      }, { key })
      close()
      router.refresh()
    } catch (err) {
      setError(err instanceof MutateError ? err.message : err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (checklist === undefined) return <p className="text-sm" style={{ color: 'var(--hf-muted)' }}>Loading the ship checklist…</p>
  if (checklist === null) return <p className="text-sm" style={{ color: 'var(--hf-muted)' }}>No ship checklist is published for this carton&rsquo;s category.</p>

  return (
    <div className="grid gap-4">
      <ul className="grid gap-2">
        {checklist.items.map((item) => (
          <li key={item.id}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(checked[item.id])}
                onChange={(e) => setChecked((c) => ({ ...c, [item.id]: e.target.checked }))}
              />
              <span>
                {item.textEn}
                <span className="block text-xs" style={{ color: 'var(--hf-muted)' }}>{item.textHi}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="grid gap-1.5">
        <label className="hf-label" style={{ color: 'var(--hf-muted)' }}>Carton photo</label>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
        <Button type="button" disabled={!canSubmit} onClick={submit}>{busy ? 'Shipping…' : 'Ship carton'}</Button>
      </div>
    </div>
  )
}

/** Cartons of an order, derived from PACKED events, with a Ship drawer per unshipped one. */
export function Cartons({ orderId, cartons, canShip }: { orderId: string; cartons: CartonRow[]; canShip: boolean }) {
  if (cartons.length === 0) return <Empty>No cartons yet. A carton appears here once the floor packs a piece into it.</Empty>

  return (
    <div className="overflow-x-auto">
      <table className="hf-table hf-cards w-full">
        <thead>
          <tr>
            <th>Carton</th><th className="hf-num">Packed</th><th className="hf-num">Shipped</th><th>Last packed</th>{canShip && <th />}
          </tr>
        </thead>
        <tbody>
          {cartons.map((c) => {
            const unshipped = c.shipped < c.packed
            return (
              <tr key={c.carton}>
                <td className="font-semibold" data-primary>{c.carton}</td>
                <td className="hf-num" data-label="Packed">{c.packed}</td>
                <td className="hf-num" data-label="Shipped">{c.shipped}</td>
                <td data-label="Last packed">{new Date(c.lastPackedAt).toLocaleString()}</td>
                {canShip && (
                  <td className="text-right">
                    {unshipped ? (
                      <Drawer title={`Ship carton ${c.carton}`} trigger="Ship" variant="ghost">
                        <ShipCartonForm orderId={orderId} carton={c.carton} />
                      </Drawer>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--hf-muted)' }}>Shipped</span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
