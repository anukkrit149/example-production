import { AwsClient } from 'aws4fetch'

/**
 * Photo storage over the S3 API.
 *
 * WHY NOT THE AWS SDK
 *
 * This used @aws-sdk/client-s3 plus the presigner. Both work, but together they
 * cost about 1.2 MB gzipped in the Worker bundle — the difference between a
 * 3.79 MB deploy that Cloudflare rejects outright and a 2.59 MB one that fits.
 * `aws4fetch` implements the same SigV4 signing in a few kilobytes, and the four
 * operations this module needs (presigned PUT, presigned GET, HEAD, and nothing
 * else) are each a single signed request. Behaviour is unchanged; only the
 * signer differs.
 *
 * It also removes a class of R2 signature mismatches by construction: the SDK
 * adds x-amz-sdk-checksum / x-amz-checksum-crc32 headers to uploads by default,
 * which must then be reproduced exactly by whoever replays the presigned URL.
 * Here the signed request carries only the headers written below.
 *
 * The same code serves MinIO locally and R2 in production — both speak S3, so
 * the difference is entirely in the environment: endpoint, credentials, region
 * ("auto" on R2) and path-style addressing (required by MinIO, optional on R2).
 */

/** One signer, built on first use rather than at import. */
let signer: AwsClient | undefined

function client(): AwsClient {
  return (signer ??= new AwsClient({
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
    // R2 requires "auto"; MinIO ignores it.
    region: process.env.S3_REGION ?? 'us-east-1',
    service: 's3',
  }))
}

/**
 * The URL of one object.
 *
 * Path-style (`{endpoint}/{bucket}/{key}`) is required by MinIO, which serves a
 * single endpoint with no per-bucket DNS. Virtual-hosted style puts the bucket
 * in the hostname instead. R2 accepts both, and its own endpoint is path-style,
 * so that is what the deployment uses.
 *
 * Each key segment is encoded, but `/` is preserved, so
 * `photos/2026-09-04/x.jpg` stays a path rather than one flat escaped name.
 */
function objectUrl(key: string): string {
  const endpoint = process.env.S3_ENDPOINT!.replace(/\/$/, '')
  const bucket = process.env.S3_BUCKET!
  const path = key.split('/').map(encodeURIComponent).join('/')

  if (process.env.S3_FORCE_PATH_STYLE === 'true') return `${endpoint}/${bucket}/${path}`

  const u = new URL(endpoint)
  u.hostname = `${bucket}.${u.hostname}`
  return `${u.origin}/${path}`
}

/**
 * Signs a request into the query string and returns the URL.
 *
 * `signQuery` puts the signature in the URL rather than an Authorization
 * header, which is what makes the result usable by a phone's plain fetch() or
 * an <img> tag with no credentials of its own.
 */
async function presign(key: string, method: 'GET' | 'PUT', expiresIn: number, headers?: HeadersInit): Promise<string> {
  const signed = await client().sign(
    new Request(`${objectUrl(key)}?X-Amz-Expires=${expiresIn}`, { method, headers }),
    { aws: { signQuery: true, allHeaders: false } },
  )
  return signed.url
}

/** A short-lived PUT url the phone uploads the photo straight to. */
export function presignPhotoUpload(key: string, mime: string): Promise<string> {
  // Content-Type is deliberately NOT signed. The browser sets its own on the
  // PUT, and a signed value the client does not reproduce byte-for-byte is the
  // classic cause of SignatureDoesNotMatch against R2.
  void mime
  return presign(key, 'PUT', 300)
}

/** Truth from the bucket: did the upload actually land, and how many bytes? */
export async function objectExists(key: string): Promise<{ exists: boolean; bytes: number }> {
  try {
    const res = await client().fetch(objectUrl(key), { method: 'HEAD' })
    if (!res.ok) return { exists: false, bytes: 0 }
    return { exists: true, bytes: Number(res.headers.get('content-length') ?? 0) }
  } catch {
    return { exists: false, bytes: 0 }
  }
}

/**
 * A short-lived signed GET url for one photo.
 *
 * The bucket is private: these photos are dispute evidence showing a real
 * piece, its order, and who handed it over, so they must never be readable by
 * anyone who can merely reach the storage endpoint. Every view mints its own
 * link, which expires.
 *
 * This is why the R2 bucket must never be given an r2.dev domain or a public
 * custom domain: that would make every key readable to anyone who can guess or
 * recover one, and these signed links would become decoration.
 */
export function photoUrl(key: string, expiresIn = 900): Promise<string> {
  return presign(key, 'GET', expiresIn)
}

/** Signs many photo keys at once, for a history screen rendering a whole timeline. */
export async function photoUrls(keys: string[], expiresIn = 900): Promise<Map<string, string>> {
  const signed = await Promise.all(keys.map(async (k) => [k, await photoUrl(k, expiresIn)] as const))
  return new Map(signed)
}
