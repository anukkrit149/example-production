import { describe, expect, it } from 'vitest'
import { resetTestDb, testPrisma } from '@hf/db/test'
import { seedAll } from '@hf/db'

describe('dashboard test database', () => {
  it('is local, migrated and seedable', async () => {
    expect(process.env.DATABASE_URL).toMatch(/hf_test_dashboard/)
    await resetTestDb()
    const seed = await seedAll(testPrisma)
    expect(seed.users.merchandiser.role).toBe('merchandiser')
    expect(await testPrisma.mutationKey.count()).toBe(0)
  })
})
