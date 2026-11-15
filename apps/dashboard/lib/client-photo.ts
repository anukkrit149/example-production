'use client'

/** The upload route rejects anything larger; stay inside it on the client. */
const MAX_BYTES = 2_000_000

async function encode(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('this browser cannot process the photo')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('could not encode photo'))),
      'image/jpeg',
      quality,
    ),
  )
}

/**
 * A merchandiser at the desk drags in whatever the buyer emailed — a photo
 * shot on a phone or camera, often a 4000 px, 6 MB frame. The server caps an
 * upload at 2 MB, so shrink first: 1600 px on the longest edge at quality 0.7
 * is plenty to see a collar shape or a stitch line. If a busy frame still
 * overshoots, step down rather than fail.
 */
async function resizeToJpeg(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('that file is not a photo this browser can read')
  }
  try {
    for (const [maxEdge, quality] of [
      [1600, 0.7],
      [1600, 0.5],
      [1200, 0.5],
    ] as const) {
      const blob = await encode(bitmap, maxEdge, quality)
      if (blob.size <= MAX_BYTES) return blob
    }
    throw new Error('this photo is too large even after shrinking, try again')
  } finally {
    bitmap.close()
  }
}

/**
 * Resize, presign, PUT straight to storage, then confirm.
 *
 * The bytes never pass through the app server. The confirm step is what makes
 * the attachment usable: until the bucket reports the object, nothing may
 * reference it. Returns the attachment id to hand to a style mutation.
 */
export async function uploadPhoto(file: File): Promise<string> {
  const blob = await resizeToJpeg(file)

  const start = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mime: 'image/jpeg', bytes: blob.size }),
  })
  if (!start.ok) throw new Error('could not start the photo upload')
  const { attachmentId, uploadUrl } = (await start.json()) as {
    attachmentId: string
    uploadUrl: string
  }

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'content-type': 'image/jpeg' },
  })
  if (!put.ok) throw new Error('photo upload failed, check the network')

  const confirm = await fetch(`/api/uploads/${attachmentId}/confirm`, { method: 'POST' })
  if (!confirm.ok) throw new Error('photo did not reach storage, try again')

  return attachmentId
}
