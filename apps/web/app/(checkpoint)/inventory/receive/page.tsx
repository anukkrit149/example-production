import { listInventoryItems } from '@hf/server'
import { ReceiveForm } from './ReceiveForm'

export default async function ReceivePage() {
  const items = await listInventoryItems()
  return (
    <main className="grid gap-5 p-4">
      <ReceiveForm items={items.map((i) => ({ id: i.id, code: i.code, nameEn: i.nameEn, nameHi: i.nameHi, unit: i.unit }))} />
    </main>
  )
}
