import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { User, UserRole } from '@hf/db'

type RosterUser = {
  id: string
  name: string
  role: UserRole
  authIdentity: string
  active: boolean
}

function rosterFile(): string {
  const name = 'roster.json'
  const candidates = [
    resolve(process.cwd(), 'tests/e2e-mock/scenarios', name),
    resolve(process.cwd(), 'apps/web/tests/e2e-mock/scenarios', name),
  ]
  const found = candidates.find((path) => {
    try {
      readFileSync(path)
      return true
    } catch {
      return false
    }
  })
  if (!found) throw new Error(`HF_E2E_MOCK roster not found. Looked in ${candidates.join(', ')}`)
  return found
}

/** The people the dev picker can sign in as. There is no users table in this suite. */
export function activeUsers(): User[] {
  const rows = JSON.parse(readFileSync(rosterFile(), 'utf8')) as RosterUser[]
  return rows.filter((user) => user.active).sort((a, b) => a.role.localeCompare(b.role)) as User[]
}

export function userByIdentity(identity: string): User | null {
  return activeUsers().find((user) => user.authIdentity === identity) ?? null
}
