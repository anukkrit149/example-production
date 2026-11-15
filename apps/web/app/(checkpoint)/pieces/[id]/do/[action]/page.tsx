import { notFound, redirect } from 'next/navigation'
import { nextCustodyStage, stageForState } from '@hf/domain'
import { loadPieceView, resolveForPiece } from '@hf/server'
import { getCurrentUser } from '@/lib/auth'
import { PieceCard } from '@/components/PieceCard'
import { ChecklistStepper } from '@/components/checklist/ChecklistStepper'
import { stepFor, type StepAction } from '@/lib/checklist-client'

const ACTIONS: StepAction[] = ['activate', 'submit_qa', 'issue', 'receive', 'pack']

/**
 * The gate, as a screen. `view.actions` decides whether this action is legal
 * right now — never a state list written out here — so an illegal URL is a
 * 404 rather than a form the server would refuse.
 */
export default async function DoPage({ params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params
  if (!(ACTIONS as string[]).includes(action)) notFound()
  const user = await getCurrentUser()
  if (!user) redirect('/signin')
  const view = await loadPieceView({ id })
  if (!view || !view.actions.includes(action as Exclude<StepAction, 'ship'>)) notFound()
  const { step, stage } = stepFor(action as StepAction, { stage: stageForState(view.state), nextCustody: nextCustodyStage(view.state) })
  const checklist = await resolveForPiece(id, step, stage)
  return (
    <main className="grid gap-4 p-4">
      <PieceCard view={view} />
      <ChecklistStepper
        view={view}
        action={action as StepAction}
        stage={stage}
        checklist={checklist}
        signedBy={{ name: user.name, role: user.role }}
      />
    </main>
  )
}
