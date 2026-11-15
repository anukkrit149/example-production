import { prisma } from '@hf/db'

/**
 * A line item as the cutting bench thinks of it: a style in one size and shade,
 * with a count of how many of its pieces have actually been cut.
 *
 * `planned` is how many labels are still unspent — activation consumes the
 * lowest-serial `PLANNED` piece, so a line item with none left cannot be
 * activated at all. `cut` is everything that has started moving, which is not
 * the complement of `planned`: a cancelled piece is neither planned nor cut,
 * and counting it as progress would tell the operator they had finished a
 * bundle they had not.
 */
export type LineItemSummary = {
  id: string
  orderNumber: string
  programName: string
  styleCode: string
  category: string
  size: string
  shade: string
  quantity: number
  planned: number
  cut: number
}

export async function listLineItems(): Promise<LineItemSummary[]> {
  const rows = await prisma.orderLineItem.findMany({
    include: {
      style: true,
      order: { include: { program: true } },
      pieces: { select: { state: true } },
    },
    orderBy: [
      { order: { orderNumber: 'asc' } },
      { style: { styleCode: 'asc' } },
      { size: 'asc' },
    ],
  })

  return rows.map((li) => ({
    id: li.id,
    orderNumber: li.order.orderNumber,
    programName: li.order.program.name,
    styleCode: li.style.styleCode,
    category: li.style.category,
    size: li.size,
    shade: li.shade,
    quantity: li.quantity,
    planned: li.pieces.filter((p) => p.state === 'PLANNED').length,
    cut: li.pieces.filter((p) => p.state !== 'PLANNED' && p.state !== 'CANCELLED').length,
  }))
}
