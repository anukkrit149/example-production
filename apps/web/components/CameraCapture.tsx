'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/useT'

type State = 'starting' | 'live' | 'denied' | 'captured'

/**
 * The camera, already open. One tap on the shutter hands a JPEG frame to
 * `onCapture`; the stream stops after the shot and restarts on Retake so
 * a phone never runs two cameras. Denied or absent camera → `denied`, and
 * the parent shows the system-camera file input instead.
 *
 * `resetKey` is the parent's escape hatch when an upload fails without ever
 * setting `preview`: bumping it re-runs the start effect and reopens the
 * camera, the same as a Retake would once there was a preview to retake from.
 */
export function CameraCapture({
  onCapture,
  busy,
  preview,
  onRetake,
  onDenied,
  resetKey,
}: {
  onCapture: (blob: Blob) => Promise<void> | void
  busy?: boolean
  preview: string | null
  onRetake: () => void
  onDenied?: () => void
  resetKey?: number
}) {
  const { t } = useT()
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [state, setState] = useState<State>(preview ? 'captured' : 'starting')

  // Read through a ref so `start` — and with it the start/stop effect below —
  // never has to depend on the parent's callback identity. A parent that
  // re-renders on every `setProgress`/`setBusy`/`setError` tick during upload
  // must never restart the live stream because of it.
  const onDeniedRef = useRef(onDenied)
  useEffect(() => {
    onDeniedRef.current = onDenied
  }, [onDenied])

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((tr) => tr.stop())
    stream.current = null
  }, [])
  // `start` awaits getUserMedia, and the effect that calls it can be cleaned
  // up mid-await — unmount, Back, "Use the phone camera app instead", or a
  // Retake all tear down this run before the promise settles. `cancelled` is
  // read after the await: when it is true the arriving stream belongs to a
  // screen that is already gone, so it gets stopped immediately and neither
  // `stream.current` nor any state is touched.
  const start = useCallback(async (cancelled: () => boolean) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      if (!cancelled()) {
        setState('denied')
        onDeniedRef.current?.()
      }
      return
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 } },
        audio: false,
      })
      if (cancelled()) {
        s.getTracks().forEach((t) => t.stop())
        return
      }
      stream.current = s
      if (video.current) {
        video.current.srcObject = s
        await video.current.play().catch(() => {})
      }
      if (cancelled()) return
      setState('live')
    } catch {
      if (!cancelled()) {
        setState('denied')
        onDeniedRef.current?.()
      }
    }
  }, [])

  useEffect(() => {
    let done = false
    // Opening getUserMedia is an external-system subscription, the case the
    // lint rule's own doc comment carves out: every setState inside `start`
    // runs after an `await`, in a later microtask, never synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!preview) start(() => done).catch(() => {})
    return () => {
      done = true
      stop()
    }
    // preview and resetKey are the only true triggers: start/stop are stable
    // (empty dep arrays, onDenied read through a ref), so this list is
    // honest — not a suppression of a real dependency.
  }, [preview, resetKey, start, stop])

  const shoot = async () => {
    const v = video.current
    if (!v || v.videoWidth === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')!.drawImage(v, 0, 0)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob) return
    stop()
    setState('captured')
    await onCapture(blob)
  }

  if (state === 'denied') return null
  // A shot has been taken but the parent has not handed back a preview yet —
  // the upload is in flight. The frame stays on screen, frozen, with the
  // shutter gone so nobody taps a dead frame twice while it looks live.
  const saving = state === 'captured' && !preview
  return (
    <div className="grid gap-3" data-camera={state}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl" style={{ background: 'var(--hf-ink)' }}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object url
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <video ref={video} className="h-full w-full object-cover" muted playsInline autoPlay />
        )}
        {(state === 'starting' || saving) && (
          <p className="hf-label absolute inset-x-0 bottom-3 text-center text-xs" style={{ color: 'var(--hf-paper)' }}>
            {saving ? t('saving') : t('camera_starting')}
          </p>
        )}
      </div>
      {preview ? (
        <button
          type="button"
          onClick={() => {
            onRetake()
            setState('starting')
          }}
          className="hf-ui flex min-h-14 w-full items-center justify-center rounded-lg border-2 px-4 text-base uppercase"
          style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}
        >
          {t('retake')}
        </button>
      ) : (
        <button
          type="button"
          aria-label={t('shutter')}
          disabled={busy || saving || state !== 'live'}
          onClick={shoot}
          className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 disabled:opacity-50"
          style={{ borderColor: 'var(--hf-ink)', background: 'var(--hf-paper)' }}
        >
          <span className="h-14 w-14 rounded-full" style={{ background: 'var(--hf-oxblood-lit)' }} />
        </button>
      )}
    </div>
  )
}
