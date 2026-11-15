import { RecordReceiptInput } from '@hf/contracts'
import { handle, json, listReceipts, readMutation, recordReceipt } from '@hf/server'
import { requireUser } from '@/lib/auth'

/** Anyone holding the phone can say "this arrived". */
export const POST = handle(async (req) => {
  const user = await requireUser()
  const { input, idempotencyKey } = await readMutation(req, RecordReceiptInput)
  const { receipt, replayed } = await recordReceipt({ input, user, idempotencyKey })
  return json({ receipt, replayed }, { status: replayed ? 200 : 201 })
})

/**
 * `?mine=1` — the caller's own recent receipts, any role.
 * `?status=RECEIVED|COUNTED` — the store's queue, store and admin only.
 */
export const GET = handle(async (req) => {
  const url = new URL(req.url)
  const mine = url.searchParams.get('mine') === '1'
  const status = url.searchParams.get('status')
  const user = mine ? await requireUser() : await requireUser(['store'])
  const page = await listReceipts({
    ...(mine ? { receivedById: user.id, limit: 5 } : {}),
    ...(status === 'RECEIVED' || status === 'COUNTED' ? { status } : {}),
    ...(url.searchParams.get('before') ? { before: url.searchParams.get('before')! } : {}),
  })
  return json(page)
})
