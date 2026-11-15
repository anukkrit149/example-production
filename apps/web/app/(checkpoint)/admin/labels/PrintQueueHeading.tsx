'use client'

import { useT } from '@/lib/i18n/useT'

/**
 * The text-bearing half of the print-queue page's header. Split out from the
 * server-rendered page so it can call `useT`, same shape as `PieceActions`.
 */
export function PrintQueueHeading() {
  const { t } = useT()
  return <h1 className="hf-display text-2xl">{t('print_queue_title')}</h1>
}
