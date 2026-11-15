import { defineCloudflareConfig } from '@opennextjs/cloudflare'

/**
 * Defaults are deliberate.
 *
 * No incremental cache override is configured: every page in the checkpoint app
 * is per-operator and per-piece, rendered behind an auth check, so there is
 * nothing safely cacheable to put in one. Adding an R2 or KV cache here would
 * risk serving one operator's piece view to another.
 */
export default defineCloudflareConfig()
