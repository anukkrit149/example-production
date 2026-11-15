import Link from 'next/link'
import { stageForState } from '@hf/domain'
import type { PieceListRow } from '@hf/server'
import { formatAge, formatEventType, formatSerial, formatState, stageColor, stageTextColor } from '@hf/server/format'
import { Empty } from './ui'

export function PieceTable({ pieces, showLine = true }: { pieces: PieceListRow[]; showLine?: boolean }) {
  if (pieces.length === 0) return <Empty>No pieces match.</Empty>
  return (
    <div className="overflow-x-auto">
      <table className="hf-table hf-cards w-full">
        <thead>
          <tr><th>Serial</th><th>Token</th>{showLine && <><th>Order</th><th>Style</th><th>Size</th><th>Shade</th></>}<th>State</th><th>With</th><th>Since</th><th>Last event</th></tr>
        </thead>
        <tbody>
          {pieces.map((p) => {
            const stage = stageForState(p.state)
            return (
              <tr key={p.id}>
                <td data-primary className="hf-num"><Link href={`/pieces/${p.id}`} className="font-semibold hover:underline">#{formatSerial(p.serial)}</Link></td>
                <td data-label="Token" className="font-mono text-xs">{p.qrToken}</td>
                {showLine && <><td data-label="Order"><Link href={`/orders/${p.orderId}`} className="hover:underline">{p.orderNumber}</Link></td><td data-label="Style">{p.styleCode}</td><td data-label="Size">{p.size}</td><td data-label="Shade">{p.shade}</td></>}
                <td data-label="State"><span className="hf-ui rounded px-2 py-0.5 text-[11px] uppercase" style={{ background: stageColor(stage), color: stageTextColor(stage) }}>{formatState(p.state)}</span></td>
                <td data-label="With">{p.worker ?? <span style={{ color: 'var(--hf-muted)' }}>Store room</span>}</td>
                <td data-label="Since">{formatAge(p.ageMinutes)}</td>
                <td data-label="Last event">{p.lastEvent ? formatEventType(p.lastEvent.type) : <span style={{ color: 'var(--hf-muted)' }}>Created</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
