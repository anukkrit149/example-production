import { Prisma } from '@hf/db'
import { ApiError } from './api'

export type ConflictContext = Partial<Record<'orderNumber' | 'programName' | 'styleCode' | 'size' | 'shade' | 'itemCode', string>>

/**
 * Which unique constraint tripped, as a string we can search for column names.
 *
 * Prisma reports P2002 with `meta.target` as an array of field names on most
 * paths and as the constraint name on some driver-adapter paths; both are
 * folded into one string so the matching below works either way. The error
 * message is appended as a last resort.
 */
function targetOf(e: Prisma.PrismaClientKnownRequestError): string {
  const t = (e.meta as { target?: unknown } | undefined)?.target
  const head = Array.isArray(t) ? t.join(',') : typeof t === 'string' ? t : ''
  return `${head} ${e.message}`
}

const isP2002 = (e: unknown): e is Prisma.PrismaClientKnownRequestError =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'

/** The readable sentence for each unique constraint a dashboard write can hit. */
export function conflictMessage(target: string, ctx: ConflictContext): string {
  if (target.includes('order_number')) return `Order ${ctx.orderNumber ?? ''} already exists in ${ctx.programName ?? 'this program'}`.replace('  ', ' ')
  if (target.includes('shade') || (target.includes('style_id') && target.includes('size')))
    return `${ctx.styleCode ?? 'That style'} ${ctx.size ?? ''} ${ctx.shade ?? ''} is already on ${ctx.orderNumber ?? 'this order'}. Change its quantity instead.`.replace(/\s+/g, ' ')
  if (target.includes('style_code')) return `Style code ${ctx.styleCode ?? ''} is already taken`.replace('  ', ' ')
  if (ctx.itemCode !== undefined && target.includes('code')) return `Item code ${ctx.itemCode} is already taken`
  if (target.includes('auth_identity')) return 'Someone with that email is already on the team'
  if (target.includes('reference_attachment_id')) return 'That photo is already the reference for another style'
  return 'That record already exists'
}

/** Rethrow a Prisma unique violation as a 409 the form can show; pass everything else through. */
export function translatePrismaError(e: unknown, ctx: ConflictContext = {}): never {
  if (isP2002(e)) throw new ApiError(409, conflictMessage(targetOf(e), ctx), 'conflict')
  throw e
}

export const isUniqueViolation = (e: unknown, column: string): boolean => isP2002(e) && targetOf(e).includes(column)
