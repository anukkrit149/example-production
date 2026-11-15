import { defineCloudflareConfig } from '@opennextjs/cloudflare'
/** No incremental cache: every page is behind auth and reflects the floor's last scan. */
export default defineCloudflareConfig()
