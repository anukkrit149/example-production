import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cookies } from 'next/headers'
import type { Action, PieceState } from '@hf/domain'

export const SCENARIO_COOKIE = 'hf_mock_scenario'

const SAFE = /^[a-z0-9-]+$/

export type PieceScript = {
  id: string
  state: PieceState
  actions: Action[]
  serial: number
  qrToken: string
  styleCode?: string
}

export type Scenario = {
  pieces: PieceScript[]
  checklistFor?: string[]
  receipts?: Array<{
    id: string
    status: 'RECEIVED' | 'COUNTED'
    supplier: string | null
    reference: string | null
    hasDiscrepancy: boolean
    receivedBy: string
    receivedById: string
    receivedAt: string
    countedBy: string | null
    countedAt: string | null
    items: Array<{ code: string; expectedQty: number | null; countedQty: number | null }>
    thumbnailUrl: string | null
  }>
  receipt?: Record<string, unknown> | null
  items?: Array<{ id: string; code: string; nameEn: string; nameHi: string; unit: string }>
  orders?: Array<{ orderId: string; orderNumber: string; programName: string; packed: number }>
}

function scenarioPath(name: string): string {
  const file = `${name}.json`
  const candidates = [
    resolve(process.cwd(), 'tests/e2e-mock/scenarios', file),
    resolve(process.cwd(), 'apps/web/tests/e2e-mock/scenarios', file),
  ]
  const found = candidates.find((path) => existsSync(path))
  if (!found) throw new Error(`HF_E2E_MOCK scenario "${name}" not found. Looked in ${candidates.join(', ')}`)
  return found
}

/** The JSON file named by `hf_mock_scenario`, or `factory` when the cookie is absent. */
export async function readScenario(): Promise<Scenario> {
  const jar = await cookies()
  const name = jar.get(SCENARIO_COOKIE)?.value || 'factory'
  if (!SAFE.test(name)) throw new Error(`HF_E2E_MOCK refused scenario name "${name}"`)
  return JSON.parse(readFileSync(scenarioPath(name), 'utf8')) as Scenario
}
