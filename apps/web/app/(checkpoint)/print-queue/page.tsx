import { redirect } from 'next/navigation'

/**
 * The print queue moved under Admin. This folder stays as a signpost only —
 * a bookmark or a link out in the wild lands here and is bounced straight on,
 * rather than 404ing.
 */
export default function PrintQueueRedirect() {
  redirect('/admin/labels')
}
