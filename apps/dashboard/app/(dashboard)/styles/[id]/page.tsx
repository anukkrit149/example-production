import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getStyle, listOrganizations } from '@hf/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shadcn/card'
import { Drawer } from '@/components/Drawer'
import { StyleForm } from '@/components/forms/StyleForm'
import { Empty, PageHeader } from '@/components/ui'
import { pageUser } from '@/lib/page-user'
import { canWrite } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export default async function StylePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await pageUser()
  const [style, orgs] = await Promise.all([getStyle(id), listOrganizations()])
  if (!style) notFound()
  return (
    <>
      <PageHeader eyebrow="Style" title={style.styleCode}>
        {canWrite(user) && (
          <Drawer title="Edit style" trigger="Edit" variant="ghost">
            <StyleForm owners={orgs.filter((o) => o.active && o.type === 'buyer')} style={{ id: style.id, styleCode: style.styleCode, description: style.description, ownerId: style.owner?.id ?? null, active: style.active, frozen: style.frozen, referenceAttachmentId: style.referenceAttachmentId, referencePhotoUrl: style.referencePhotoUrl }} />
          </Drawer>
        )}
      </PageHeader>
      <section className="mb-6 grid gap-4 md:grid-cols-[minmax(0,480px)_1fr] md:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="hf-label" style={{ color: 'var(--hf-muted)' }}>Reference photo</CardTitle>
          </CardHeader>
          <CardContent>
            {style.referencePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
              <img src={style.referencePhotoUrl} alt={`Reference photo for ${style.styleCode}`} className="w-full rounded-lg border object-contain" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)', maxHeight: 480 }} />
            ) : (
              <div className="grid h-40 place-items-center rounded-lg border border-dashed text-sm" style={{ borderColor: 'var(--hf-line)', color: 'var(--hf-muted)' }}>
                No reference photo{canWrite(user) ? ' — add one from Edit' : ''}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="hf-label" style={{ color: 'var(--hf-muted)' }}>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              {([
                ['Category', style.category],
                ['Gender', style.gender],
                ['Owner', style.owner?.name ?? 'Factory base style'],
                ['Description', style.description ?? '—'],
                ['Active', style.active ? 'Yes' : 'No'],
                ['Code', style.frozen ? 'Frozen — on printed labels' : 'Editable'],
              ] as Array<[string, React.ReactNode]>).map(([k, v]) => (
                <div key={k}>
                  <dt className="hf-label" style={{ color: 'var(--hf-muted)' }}>{k}</dt>
                  <dd className="mt-1 text-[15px]">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>
      <h2 className="hf-display mb-3 text-xl">Orders using this style</h2>
      {style.orders.length === 0 ? <Empty>Not on any order yet.</Empty> : (
        <table className="hf-table hf-cards w-full">
          <thead><tr><th>Order</th><th>Program</th><th className="hf-num">Ordered</th></tr></thead>
          <tbody>{style.orders.map((o) => <tr key={o.id}><td data-primary><Link href={`/orders/${o.id}`} className="font-semibold hover:underline">{o.orderNumber}</Link></td><td data-label="Program">{o.programName}</td><td data-label="Ordered" className="hf-num">{o.quantity}</td></tr>)}</tbody>
        </table>
      )}
    </>
  )
}
