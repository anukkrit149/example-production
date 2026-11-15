import { prisma, Prisma } from '@hf/db'

/**
 * Run a commercial create once per Idempotency-Key.
 *
 * Inside one transaction: if the key is already recorded, reload the entity it
 * produced and report `replayed: true` without running anything. Otherwise run
 * the write, record the key against the new row's id, and commit both together
 * — so a key can never point at a row that was rolled back, and a row can
 * never exist without its key. `reload` returning null means the entity was
 * deactivated or the key is stale from another environment; the caller gets a
 * fresh run rather than a null.
 */
export async function idempotent<T extends { id: string }>(args: {
  key: string
  entity: string
  run: (tx: Prisma.TransactionClient) => Promise<T>
  reload: (tx: Prisma.TransactionClient, id: string) => Promise<T | null>
}): Promise<{ result: T; replayed: boolean }> {
  return prisma.$transaction(
    async (tx) => {
      const seen = await tx.mutationKey.findUnique({ where: { key: args.key } })
      if (seen && seen.entity === args.entity) {
        const existing = await args.reload(tx, seen.entityId)
        if (existing) return { result: existing, replayed: true }
      }
      const result = await args.run(tx)
      await tx.mutationKey.upsert({
        where: { key: args.key },
        update: { entity: args.entity, entityId: result.id },
        create: { key: args.key, entity: args.entity, entityId: result.id },
      })
      return { result, replayed: false }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  )
}
