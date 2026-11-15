'use client'
import { useEffect, useId, useState } from 'react'
import { uploadPhoto } from '@/lib/client-photo'
import { Button } from '../ui'

/**
 * One reference photo for a style. The file goes straight to the private
 * bucket through the same presign → PUT → confirm path the floor uses; the
 * form only ever holds the confirmed attachment id.
 */
export function ReferencePhotoField({ value, currentUrl, onChange }: { value: string | null | undefined; currentUrl: string | null; onChange: (id: string | null) => void }) {
  const id = useId()
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A local preview is a blob URL; release it when it is replaced or the field goes away.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  // value === null: cleared, show nothing. Otherwise a local preview wins;
  // failing that, the existing photo shows only while the field is untouched.
  let shown: string | null
  if (value === null) shown = null
  else if (preview) shown = preview
  else if (value === undefined) shown = currentUrl
  else shown = null

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setError(null); setPreview(null)
    try {
      const attachmentId = await uploadPhoto(file)
      setPreview(URL.createObjectURL(file))
      onChange(attachmentId)
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : 'Upload failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="hf-label" style={{ color: 'var(--hf-muted)' }}>Reference photo</label>
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL or a local object URL
        <img src={shown} alt="Reference photo preview" className="max-h-64 w-full rounded-lg border object-contain" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }} />
      ) : (
        <div className="grid h-32 place-items-center rounded-lg border border-dashed text-xs" style={{ borderColor: 'var(--hf-line)', color: 'var(--hf-muted)' }}>No reference photo</div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input id={id} type="file" accept="image/*" className="text-xs" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
        {shown && <Button type="button" variant="ghost" onClick={() => { setPreview(null); onChange(null) }} disabled={busy}>Remove</Button>}
        {busy && <span role="status" className="text-xs" style={{ color: 'var(--hf-muted)' }}>Uploading…</span>}
      </div>
      <span className="text-xs" style={{ color: 'var(--hf-muted)' }}>JPEG or WebP, shrunk to 1600 px before upload. What the finished sample should look like.</span>
      {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>{error}</p>}
    </div>
  )
}
