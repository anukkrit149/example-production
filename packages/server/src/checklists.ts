import { prisma, Prisma, type Stage } from '@hf/db'
import { CHECKLIST_CATEGORIES, checklistCategoryFor, measureWithin, pickChecklistVersion, scopeKey, STYLE_CATEGORIES, type ChecklistCategory, type ChecklistItemKind, type ChecklistStep } from '@hf/domain'
import type { ChecklistAnswers, ChecklistDraftInput, CreateOverrideInput, MaterialLine } from '@hf/contracts'
import { ApiError } from './api'

export type ResolvedItem = { id: string; position: number; kind: ChecklistItemKind; textEn: string; textHi: string; pictogram: string; unit: string | null; min: number | null; max: number | null }
export type ResolvedChecklist = { id: string; checklistId: string; number: number; programId: string | null; step: ChecklistStep; stage: Stage | null; category: string; items: ResolvedItem[] }

const itemSelect = { id: true, position: true, kind: true, textEn: true, textHi: true, pictogram: true, unit: true, min: true, max: true } as const

/** Prisma's `Decimal` on `min`/`max` is converted to `number` (or kept `null`) the moment a row is read. */
const toItem = (i: { id: string; position: number; kind: ChecklistItemKind; textEn: string; textHi: string; pictogram: string; unit: string | null; min: Prisma.Decimal | null; max: Prisma.Decimal | null }): ResolvedItem =>
  ({ id: i.id, position: i.position, kind: i.kind, textEn: i.textEn, textHi: i.textHi, pictogram: i.pictogram, unit: i.unit, min: i.min === null ? null : Number(i.min), max: i.max === null ? null : Number(i.max) })

/** `checklistCategoryFor` casts, so the caller's string is checked first. */
const asStyleCategory = (category: string) => {
  if (!(STYLE_CATEGORIES as readonly string[]).includes(category)) throw new ApiError(422, 'unknown style category', 'invalid_category')
  return checklistCategoryFor(category)
}

/**
 * The version a scan uses for one (step, stage, category) in one program.
 * Both the default and the override are loaded in one query; the pure rule
 * in @hf/domain decides. Outerwear reads the jacket lists.
 */
export async function resolveChecklistVersion(a: { step: ChecklistStep; stage: Stage | null; category: string; programId: string | null }): Promise<ResolvedChecklist | null> {
  const category = asStyleCategory(a.category)
  const keys = [scopeKey(a.step, a.stage, category, null), ...(a.programId ? [scopeKey(a.step, a.stage, category, a.programId)] : [])]
  const lists = await prisma.checklist.findMany({ where: { scopeKey: { in: keys } }, include: { versions: { include: { items: { select: itemSelect, orderBy: { position: 'asc' } } } } } })
  const candidates = lists.flatMap((l) => l.versions.map((v) => ({ id: v.id, programId: l.programId, publishedAt: v.publishedAt?.toISOString() ?? null, number: v.number, list: l, version: v })))
  const pick = pickChecklistVersion(candidates)
  if (!pick) return null
  const c = candidates.find((x) => x.id === pick.id)!
  return { id: c.version.id, checklistId: c.list.id, number: c.version.number, programId: c.list.programId, step: c.list.step, stage: c.list.stage, category: c.list.category, items: c.version.items.map(toItem) }
}

/** Category and program come from the piece. */
export async function resolveForPiece(pieceId: string, step: ChecklistStep, stage: Stage | null): Promise<ResolvedChecklist | null> {
  const p = await prisma.piece.findUnique({ where: { id: pieceId }, select: { lineItem: { select: { style: { select: { category: true } }, order: { select: { programId: true } } } } } })
  if (!p) throw new ApiError(404, 'piece not found', 'not_found')
  return resolveChecklistVersion({ step, stage, category: p.lineItem.style.category, programId: p.lineItem.order.programId })
}

export type ChecklistRecord = {
  checklistVersionId: string
  checklistNumber: number
  answers: Array<{ itemId: string; kind: ChecklistItemKind; textEn: string; textHi: string; value: true | number; unit?: string; min?: number | null; max?: number | null; materials?: MaterialLine[] }>
}

/**
 * Every item answered, on the published version the phone started from.
 * `enforceRange` is off for a QA fail: the values are kept as evidence of
 * why it failed, they are not being certified.
 */
export async function assertChecklistPassed(a: { resolved: ResolvedChecklist | null; checklist: ChecklistAnswers }, opts: { enforceRange?: boolean } = {}): Promise<ChecklistRecord> {
  const enforceRange = opts.enforceRange ?? true
  if (!a.resolved) throw new ApiError(422, 'no checklist is published for this step', 'checklist_missing')
  if (a.checklist.versionId !== a.resolved.id) throw new ApiError(422, 'the checklist changed; start the step again', 'checklist_stale')
  const byItem = new Map(a.checklist.answers.map((x) => [x.itemId, x]))
  const answers: ChecklistRecord['answers'] = []
  for (const item of a.resolved.items) {
    const ans = byItem.get(item.id)
    if (!ans) throw new ApiError(422, `not confirmed: ${item.textEn}`, 'checklist_incomplete')
    if (item.kind === 'materials' && !(ans.materials && ans.materials.length > 0))
      throw new ApiError(422, 'list the materials issued with the piece', 'checklist_materials_required')
    if (item.kind === 'measure') {
      if (typeof ans.value !== 'number') throw new ApiError(422, `enter the measurement: ${item.textEn}`, 'checklist_measure_required')
      if (enforceRange && !measureWithin(ans.value, item.min, item.max))
        throw new ApiError(422, `${item.textEn}: ${ans.value} ${item.unit ?? ''} is outside ${item.min ?? '…'}–${item.max ?? '…'}`.trim(), 'checklist_measure_out_of_range')
      answers.push({ itemId: item.id, kind: item.kind, textEn: item.textEn, textHi: item.textHi, value: ans.value, unit: item.unit ?? undefined, min: item.min, max: item.max })
      continue
    }
    if (ans.value !== true) throw new ApiError(422, `not confirmed: ${item.textEn}`, 'checklist_incomplete')
    answers.push({ itemId: item.id, kind: item.kind, textEn: item.textEn, textHi: item.textHi, value: true, ...(item.kind === 'materials' ? { materials: ans.materials } : {}) })
  }
  return { checklistVersionId: a.resolved.id, checklistNumber: a.resolved.number, answers }
}

// ---- admin ----

export type ChecklistSummary = { id: string; step: ChecklistStep; stage: Stage | null; category: string; programId: string | null; publishedNumber: number | null; hasDraft: boolean; itemCount: number }

const summarise = (l: Prisma.ChecklistGetPayload<{ include: { versions: { include: { _count: { select: { items: true } } } } } }>): ChecklistSummary => {
  const published = l.versions.filter((v) => v.publishedAt).sort((a, b) => b.number - a.number)[0]
  return { id: l.id, step: l.step, stage: l.stage, category: l.category, programId: l.programId, publishedNumber: published?.number ?? null, hasDraft: l.versions.some((v) => !v.publishedAt), itemCount: published?._count.items ?? 0 }
}
const withVersions = { versions: { include: { _count: { select: { items: true } } } } } as const

export async function listDefaultChecklists(): Promise<ChecklistSummary[]> {
  const lists = await prisma.checklist.findMany({ where: { programId: null }, include: withVersions, orderBy: [{ category: 'asc' }, { step: 'asc' }, { stage: 'asc' }] })
  return lists.map(summarise)
}

export type ProgramChecklistRow = ChecklistSummary & { customised: boolean; defaultId: string }

/** Every default, marked with whether this program overrides it (and the override's id when it does). */
export async function programChecklistStatus(programId: string): Promise<ProgramChecklistRow[]> {
  const [defaults, overrides] = await Promise.all([
    prisma.checklist.findMany({ where: { programId: null }, include: withVersions, orderBy: [{ category: 'asc' }, { step: 'asc' }, { stage: 'asc' }] }),
    prisma.checklist.findMany({ where: { programId }, include: withVersions }),
  ])
  return defaults.map((d) => {
    // Match on the live scope key, not the field triple: a reverted override
    // keeps its step/stage/category but its key is renamed out of the way,
    // and it must read as "using the default" again.
    const o = overrides.find((x) => x.scopeKey === scopeKey(d.step, d.stage, d.category, programId))
    const s = summarise(o ?? d)
    return { ...s, customised: Boolean(o), defaultId: d.id }
  })
}

export type ChecklistVersionRow = { id: string; number: number; publishedAt: string | null; publishedBy: string | null; itemCount: number }
export type ChecklistDetail = ChecklistSummary & {
  published: { id: string; number: number; items: ResolvedItem[] } | null
  draft: { id: string; number: number; items: ResolvedItem[] } | null
  /** Every version, newest first; the draft is the one with no publishedAt. */
  versions: ChecklistVersionRow[]
}

export async function getChecklist(id: string): Promise<ChecklistDetail> {
  const l = await prisma.checklist.findUnique({
    where: { id },
    include: { versions: { include: { _count: { select: { items: true } }, publishedBy: { select: { name: true } }, items: { select: itemSelect, orderBy: { position: 'asc' } } } } },
  })
  if (!l) throw new ApiError(404, 'checklist not found', 'not_found')
  const published = l.versions.filter((v) => v.publishedAt).sort((a, b) => b.number - a.number)[0] ?? null
  const draft = l.versions.find((v) => !v.publishedAt) ?? null
  const versions: ChecklistVersionRow[] = [...l.versions]
    .sort((a, b) => b.number - a.number)
    .map((v) => ({ id: v.id, number: v.number, publishedAt: v.publishedAt?.toISOString() ?? null, publishedBy: v.publishedBy?.name ?? null, itemCount: v._count.items }))
  return {
    ...summarise(l),
    published: published && { id: published.id, number: published.number, items: published.items.map(toItem) },
    draft: draft && { id: draft.id, number: draft.number, items: draft.items.map(toItem) },
    versions,
  }
}

/** The categories this program's line items use, outerwear read as jacket, in tab order. Empty for a program with no line items. */
export async function programCategories(programId: string): Promise<ChecklistCategory[]> {
  const rows = await prisma.orderLineItem.findMany({ where: { order: { programId } }, select: { style: { select: { category: true } } }, distinct: ['styleId'] })
  const used = new Set(rows.map((r) => checklistCategoryFor(r.style.category)))
  return CHECKLIST_CATEGORIES.filter((c) => used.has(c))
}

/** Replaces the draft's items (creating the draft from the latest published version's number + 1 if needed). Published versions are never touched. */
export async function saveDraft(id: string, input: ChecklistDraftInput): Promise<ChecklistDetail> {
  await prisma.$transaction(async (tx) => {
    const l = await tx.checklist.findUnique({ where: { id }, include: { versions: true } })
    if (!l) throw new ApiError(404, 'checklist not found', 'not_found')
    let draft = l.versions.find((v) => !v.publishedAt)
    if (!draft) {
      const next = Math.max(0, ...l.versions.map((v) => v.number)) + 1
      draft = await tx.checklistVersion.create({ data: { checklistId: id, number: next } })
    }
    await tx.checklistItem.deleteMany({ where: { versionId: draft.id } })
    await tx.checklistItem.createMany({ data: input.items.map((it, i) => ({ versionId: draft!.id, position: i + 1, kind: it.kind, textEn: it.textEn, textHi: it.textHi, pictogram: it.pictogram, unit: it.unit ?? null, min: it.min ?? null, max: it.max ?? null })) })
  })
  return getChecklist(id)
}

export async function publishDraft(id: string, userId: string): Promise<ChecklistDetail> {
  const l = await prisma.checklist.findUnique({ where: { id }, include: { versions: { include: { _count: { select: { items: true } } } } } })
  if (!l) throw new ApiError(404, 'checklist not found', 'not_found')
  const draft = l.versions.find((v) => !v.publishedAt)
  if (!draft) throw new ApiError(422, 'nothing to publish', 'no_draft')
  if (draft._count.items === 0) throw new ApiError(422, 'a checklist needs at least one item', 'empty_draft')
  // The read above is only a pre-check. Guarding on `publishedAt: null` in the
  // write itself closes the check-then-act window: of two concurrent publishes
  // exactly one matches a row, and the loser is refused rather than silently
  // re-stamping a published version.
  const { count } = await prisma.checklistVersion.updateMany({ where: { id: draft.id, publishedAt: null }, data: { publishedAt: new Date(), publishedById: userId } })
  if (count !== 1) throw new ApiError(422, 'nothing to publish', 'no_draft')
  return getChecklist(id)
}

/** A program override starts as a draft copy of the current default. */
export async function createOverride(input: CreateOverrideInput): Promise<ChecklistDetail> {
  const category = asStyleCategory(input.category)
  const key = scopeKey(input.step, input.stage, category, input.programId)
  const existing = await prisma.checklist.findUnique({ where: { scopeKey: key } })
  if (existing) return getChecklist(existing.id)
  const def = await resolveChecklistVersion({ step: input.step, stage: input.stage, category, programId: null })
  const created = await prisma.checklist.create({ data: { step: input.step, stage: input.stage, category, programId: input.programId, scopeKey: key } })
  await saveDraft(created.id, { items: (def?.items ?? []).map((i) => ({ kind: i.kind, textEn: i.textEn, textHi: i.textHi, pictogram: i.pictogram as never, unit: i.unit ?? undefined, min: i.min, max: i.max })) })
  return getChecklist(created.id)
}

/**
 * Retire an override: its published versions are kept (history points at
 * them) but a new "retired" draft-free state is not representable, so the
 * scope key is renamed out of the way. Resolution never sees it again, and
 * customising again creates a fresh override off the current default.
 */
export async function revertOverride(id: string): Promise<void> {
  const l = await prisma.checklist.findUnique({ where: { id }, include: { versions: true } })
  if (!l) throw new ApiError(404, 'checklist not found', 'not_found')
  if (!l.programId) throw new ApiError(422, 'a factory default cannot be reverted', 'not_override')
  await prisma.$transaction(async (tx) => {
    const draft = l.versions.find((v) => !v.publishedAt)
    if (draft) { await tx.checklistItem.deleteMany({ where: { versionId: draft.id } }); await tx.checklistVersion.delete({ where: { id: draft.id } }) }
    await tx.checklist.update({ where: { id }, data: { scopeKey: `${l.scopeKey}|retired|${Date.now()}` } })
  })
}
