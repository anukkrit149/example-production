'use client'
import { useState } from 'react'
import type { ReceiptPhoto } from '@hf/server'
import { useT } from '@/lib/i18n/useT'

/** Three thumbnails; tap one to see it full size over the page. */
export function ReceiptPhotos({ photos }: { photos: ReceiptPhoto[] }) {
  const { t } = useT()
  const [open, setOpen] = useState<ReceiptPhoto | null>(null)
  const label = (p: ReceiptPhoto) => t(p.purpose === 'goods' ? 'inv_photo_goods' : p.purpose === 'place' ? 'inv_photo_place' : 'inv_photo_document')
  return (
    <section className="grid gap-2">
      <h2 className="hf-label text-[10px]" style={{ color: 'var(--hf-muted)' }}>{t('inv_photos')}</h2>
      <ul className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(p)} aria-label={label(p)} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived url */}
              <img src={p.url} alt={label(p)} className="h-24 w-24 rounded-lg border object-cover" style={{ borderColor: 'var(--hf-line)' }} />
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={label(open)} className="fixed inset-0 z-50 grid place-items-center p-3" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived url */}
          <img src={open.url} alt={label(open)} className="max-h-full max-w-full rounded-lg" />
          <button type="button" onClick={() => setOpen(null)} className="hf-ui absolute right-3 top-3 rounded-md border-2 px-4 py-2 text-base uppercase" style={{ borderColor: 'var(--hf-paper)', color: 'var(--hf-paper)' }}>{t('inv_close')}</button>
        </div>
      )}
    </section>
  )
}
