'use client'

import { useCallback, useState } from 'react'
import type { CartonRow, PieceView, ResolvedChecklist } from '@hf/server'
import { ChecklistStepper, type SignedBy } from '@/components/checklist/ChecklistStepper'
import { fetchChecklist } from '@/lib/checklist-client'
import { useT } from '@/lib/i18n/useT'

type OrderRow = { orderId: string; orderNumber: string; programName: string; packed: number }

type Stage = { kind: 'order' } | { kind: 'carton'; order: OrderRow } | { kind: 'checklist'; order: OrderRow; carton: CartonRow; checklist: ResolvedChecklist | null }

const BTN = 'hf-ui flex min-h-14 w-full flex-col items-start gap-1 rounded-lg border-2 px-4 py-3 text-left text-lg disabled:opacity-50'

/**
 * Order, then carton, then the checklist — one choice per screen, the same
 * grammar as the rest of the phone app. The checklist step resolves against
 * the carton's own first packed piece, so a mixed-category order still gets
 * the right list rather than whatever `take: 1` happened to return.
 */
export function ShipForm({ orders, signedBy }: { orders: OrderRow[]; signedBy: SignedBy }) {
  const { t } = useT()
  const [stage, setStage] = useState<Stage>({ kind: 'order' })
  const [cartons, setCartons] = useState<CartonRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pickOrder = useCallback(async (order: OrderRow) => {
    setError(null)
    setCartons(null)
    setStage({ kind: 'carton', order })
    try {
      const res = await fetch(`/api/cartons?orderId=${order.orderId}`)
      if (!res.ok) throw new Error('cartons unavailable')
      const { cartons: rows } = (await res.json()) as { cartons: CartonRow[] }
      setCartons(rows)
    } catch {
      setError(t('network'))
    }
  }, [t])

  const pickCarton = useCallback(async (order: OrderRow, carton: CartonRow) => {
    setError(null)
    const firstPieceId = carton.pieceIds[0]
    if (!firstPieceId) return
    try {
      const checklist = await fetchChecklist(firstPieceId, 'ship', null)
      setStage({ kind: 'checklist', order, carton, checklist })
    } catch {
      setError(t('network'))
    }
  }, [t])

  if (stage.kind === 'checklist') {
    // A minimal, view-like object: the stepper and its children (ItemScreen,
    // NoSheet) need somewhere to hang a piece id and version, but a carton is
    // several pieces at once, so nothing here names a single one of them.
    const view: PieceView = {
      id: stage.carton.carton, qrToken: '', serial: 0, state: 'PACKED', version: 0,
      lineItemId: '', orderId: stage.order.orderId, programId: '', styleCode: '', category: '', size: '', shade: '',
      orderNumber: stage.order.orderNumber, programName: stage.order.programName, buyerName: '',
      worker: null, lastEvent: null, ageMinutes: 0, actions: [], labelStage: null,
    }
    return (
      <>
        <ShipHeader order={stage.order} carton={stage.carton} />
        <ChecklistStepper view={view} action="ship" stage={null} checklist={stage.checklist} ship={{ orderId: stage.order.orderId, carton: stage.carton.carton }} signedBy={signedBy} />
      </>
    )
  }

  return (
    <>
      <h1 className="hf-display text-2xl">{t('ship_title')}</h1>

      {stage.kind === 'order' && (
        <section className="grid gap-3">
          <h2 className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>{t('ship_pick_order')}</h2>
          {orders.length === 0 && <p className="text-lg" style={{ color: 'var(--hf-muted)' }}>{t('no_actions')}</p>}
          <ul className="grid gap-2">
            {orders.map((o) => (
              <li key={o.orderId}>
                <button type="button" onClick={() => pickOrder(o)} className={BTN} style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)', color: 'var(--hf-ink)' }}>
                  <span className="font-semibold">{o.orderNumber} · {o.programName}</span>
                  <span className="text-base" style={{ color: 'var(--hf-muted)' }}>{o.packed} {t('ship_pieces')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stage.kind === 'carton' && (
        <section className="grid gap-3">
          <h2 className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>{t('ship_pick_carton')}</h2>
          {cartons === null && !error && <p className="text-lg" style={{ color: 'var(--hf-muted)' }}>{t('saving')}</p>}
          {cartons && (
            <ul className="grid gap-2">
              {cartons.map((c) => {
                const shipped = c.shipped >= c.packed
                return (
                  <li key={c.carton}>
                    <button type="button" disabled={shipped} onClick={() => pickCarton(stage.order, c)} className={BTN}
                      style={shipped
                        ? { borderColor: 'var(--hf-line)', background: 'var(--hf-paper)', color: 'var(--hf-muted)' }
                        : { borderColor: 'var(--hf-line)', background: 'var(--hf-card)', color: 'var(--hf-ink)' }}>
                      <span className="font-semibold">{c.carton}</span>
                      <span className="text-base" style={{ color: 'var(--hf-muted)' }}>{c.packed} {t('ship_pieces')}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <button type="button" onClick={() => setStage({ kind: 'order' })} className="hf-ui text-base underline" style={{ color: 'var(--hf-muted)' }}>{t('back')}</button>
        </section>
      )}

      {error && <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>{error}</p>}
    </>
  )
}

function ShipHeader({ order, carton }: { order: OrderRow; carton: CartonRow }) {
  const { t } = useT()
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
      <p className="hf-display text-2xl leading-tight">{carton.carton}</p>
      <p className="mt-1 text-base" style={{ color: 'var(--hf-muted)' }}>{order.orderNumber} · {order.programName}</p>
      <p className="mt-1 text-base" style={{ color: 'var(--hf-muted)' }}>{carton.packed} {t('ship_pieces')}</p>
    </section>
  )
}
