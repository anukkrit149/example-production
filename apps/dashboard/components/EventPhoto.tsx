'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * A single history-event photo. The bucket is private, so the signed url can
 * expire between page render and the browser fetching it, and the underlying
 * object can be missing entirely — either way this swaps the broken-image
 * glyph for a plain "unavailable" placeholder instead of showing it.
 *
 * The server streams the `<img>` tag before React hydrates, so the browser
 * can start (and fail) the request before any `onError` listener is attached
 * — the event never re-fires once that happens. A ref callback runs the same
 * check the moment the node mounts (`complete` with a zero `naturalWidth` is
 * the browser's own signal for "this failed"), so a photo that 404s during
 * that window is still caught.
 */
export function EventPhoto({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  const checked = useRef(false)

  const ref = useCallback((img: HTMLImageElement | null) => {
    if (!img || checked.current) return
    checked.current = true
    if (img.complete && img.naturalWidth === 0) setFailed(true)
  }, [])

  if (failed) {
    return (
      <div
        className="flex h-24 w-24 items-center justify-center rounded border border-dashed p-1 text-center text-[11px]"
        style={{ borderColor: 'var(--hf-line)', color: 'var(--hf-muted)' }}
      >
        Photo unavailable
      </div>
    )
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={url} alt={alt} className="h-24 w-24 rounded border object-cover" style={{ borderColor: 'var(--hf-line)' }} onError={() => setFailed(true)} />
}
