'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { capturePhoto } from '@/lib/client-photo'
import { useT } from '@/lib/i18n/useT'
import { CameraCapture } from './CameraCapture'

/**
 * The photo control for every step that needs evidence.
 *
 * The live camera opens straight on the screen so the operator never leaves
 * it to shoot; `capture="environment"` on the always-present hidden input is
 * the fallback for a denied or absent camera, and a small link lets anyone
 * switch to it on purpose. Thumbnails come from a local object URL — instant,
 * no signed round trip — while the real upload runs behind them.
 *
 * Tasks 15 and 16 consume this component; it is not redefined there.
 */
export function PhotoCapture({
  value,
  onChange,
  required,
}: {
  value: string[]
  onChange: (ids: string[]) => void
  required?: boolean
}) {
  const { t } = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [cameraDenied, setCameraDenied] = useState(false)
  const [useSystem, setUseSystem] = useState(false)
  // Bumped whenever an upload fails without ever producing a preview (the
  // camera-capture path uploads a single blob with nothing to fall back to),
  // so `CameraCapture` knows to reopen the stream instead of sitting frozen
  // on a dead frame forever.
  const [resetKey, setResetKey] = useState(0)

  // Stable identity across every re-render — including the ones upload
  // progress causes — so CameraCapture's start effect never mistakes a
  // parent re-render for a reason to restart the live stream.
  const onDenied = useCallback(() => setCameraDenied(true), [])

  // Object URLs hold the decoded frame in memory until they are revoked; a long
  // shift on one screen would otherwise stack up full-size photos. The
  // cleanup below only runs once, on unmount, so it needs the *latest*
  // `previews` at that moment rather than the empty array captured by the
  // mount-time closure — mirror it into a ref on every render and revoke
  // that.
  const previewsRef = useRef(previews)
  useEffect(() => {
    previewsRef.current = previews
  })
  useEffect(
    () => () => {
      previewsRef.current.forEach((p) => URL.revokeObjectURL(p))
    },
    [],
  )

  const upload = async (list: Array<Blob | File>) => {
    if (!list.length) return
    setBusy(true)
    setError(null)
    const ids: string[] = []
    try {
      for (const [i, f] of list.entries()) {
        setProgress(list.length > 1 ? `Uploading photo ${i + 1} of ${list.length}…` : 'Uploading…')
        ids.push(await capturePhoto(f))
        const url = URL.createObjectURL(f)
        setPreviews((p) => [...p, url])
      }
      onChange([...value, ...ids])
      setProgress(null)
    } catch (e) {
      // Whatever did upload is still worth keeping: hand those ids up so the
      // operator does not retake a photo that already landed.
      if (ids.length) onChange([...value, ...ids])
      setProgress(null)
      setError(e instanceof Error ? e.message : 'photo failed')
      // A shot the camera took but never got a preview for (the single-blob
      // path failed before any URL was created) leaves CameraCapture frozen
      // on a dead frame with no preview to retake from — bump the key so its
      // effect reopens the stream.
      if (!ids.length) setResetKey((k) => k + 1)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return
    void upload(Array.from(files))
  }

  const count = value.length
  const lastPreview = previews[previews.length - 1] ?? null
  const showCamera = !cameraDenied && !useSystem
  const showSystemButton = cameraDenied || useSystem

  return (
    <div className="grid gap-3">
      {showCamera && (
        <CameraCapture
          busy={busy}
          preview={lastPreview}
          resetKey={resetKey}
          onCapture={async (blob) => {
            await upload([blob])
          }}
          onRetake={() => {
            const last = previews[previews.length - 1]
            if (last) URL.revokeObjectURL(last)
            setPreviews((p) => p.slice(0, -1))
            onChange(value.slice(0, -1))
          }}
          onDenied={onDenied}
        />
      )}

      {/* Always present: the hard contract every existing e2e step relies on. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      {showSystemButton && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="hf-ui flex min-h-16 w-full items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 text-base uppercase disabled:opacity-60"
          style={{
            borderColor: count ? 'var(--hf-oxblood-lit)' : 'var(--hf-line)',
            color: count ? 'var(--hf-oxblood-lit)' : 'var(--hf-ink)',
            background: 'var(--hf-card)',
          }}
        >
          <CameraIcon />
          {busy ? 'Uploading…' : count ? t('retake') : t('take_photo')}
        </button>
      )}

      {showCamera && (
        <button
          type="button"
          onClick={() => setUseSystem(true)}
          className="hf-ui text-sm underline"
          style={{ color: 'var(--hf-muted)' }}
        >
          {t('use_system_camera')}
        </button>
      )}

      {cameraDenied && (
        <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
          {t('camera_denied')}
        </p>
      )}

      {previews.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {previews.slice(0, -1).map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p}
              src={p}
              alt={`Photo ${i + 1}`}
              className="h-20 w-20 rounded-lg border object-cover"
              style={{ borderColor: 'var(--hf-line)' }}
            />
          ))}
        </div>
      )}

      {progress && (
        <p aria-live="polite" className="text-base" style={{ color: 'var(--hf-muted)' }}>
          {progress}
        </p>
      )}

      {!progress && count > 0 && (
        <p aria-live="polite" className="text-base" style={{ color: 'var(--hf-muted)' }}>
          {t('photo_taken')} ({count})
        </p>
      )}

      {required && count === 0 && !busy && !error && (
        <p className="text-base" style={{ color: 'var(--hf-muted)' }}>
          A photo is required for this step.
        </p>
      )}

      {error && (
        <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
          {error}
        </p>
      )}
    </div>
  )
}

function CameraIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1-1.7A1 1 0 0 1 9 3.8h6a1 1 0 0 1 .85.48L16.8 6h1.7A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
