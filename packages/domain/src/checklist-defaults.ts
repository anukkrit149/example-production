import type { Stage } from './piece-state'
import type { StyleCategory } from './size-scales'

export type ChecklistStep = 'activate' | 'qa' | 'issue' | 'receive' | 'pack' | 'ship'
export type ChecklistItemKind = 'confirm' | 'photo' | 'materials' | 'measure'

export type DefaultItem = { kind: ChecklistItemKind; en: string; hi: string; pictogram: string }
export type DefaultChecklist = { step: ChecklistStep; stage: Stage | null; category: StyleCategory; items: DefaultItem[] }

const c = (en: string, hi: string, pictogram: string): DefaultItem => ({ kind: 'confirm', en, hi, pictogram })
const PHOTO: DefaultItem = { kind: 'photo', en: 'Take the photo', hi: 'फ़ोटो लें', pictogram: 'camera' }
const MATERIALS: DefaultItem = { kind: 'materials', en: 'Materials issued: zips, lining, thread', hi: 'सामान दिया: ज़िप, लाइनिंग, धागा', pictogram: 'materials' }

const COUNT = c('Count is right', 'गिनती सही है', 'count')
const SET = c('Set is complete', 'सेट पूरा है', 'set-complete')
const RIGHT_WORKER = c('Right worker confirmed', 'सही कारीगर है', 'hand-over')
const QTY_CONFIRMED = c('Quantity confirmed', 'गिनती सही है', 'quantity')
const SAME_WORKER = c('Same worker returning', 'वही कारीगर लौटा रहा है', 'take-back')
const QTY_RETURNED = c('Quantity returned', 'गिनती वापस मिली', 'quantity')
const NO_DAMAGE = c('No damage or shortage', 'कोई नुकसान या कमी नहीं', 'damage')

/** The owner's jacket practice (4 Sept 2026). `outerwear` resolves to these at runtime. */
const JACKET: DefaultChecklist[] = [
  { step: 'activate', stage: null, category: 'jacket', items: [
    c('Leather lot matches the ticket', 'चमड़े का लॉट टिकट से मेल खाता है', 'leather-lot'),
    c('All panels for this piece are cut', 'इस पीस के सारे पैनल कट गए हैं', 'panels'),
    c('No hole, scar or thin patch on the panels', 'पैनल में कोई छेद, निशान या पतली जगह नहीं', 'flaw'),
    PHOTO,
  ] },
  { step: 'qa', stage: 'cutting', category: 'jacket', items: [
    COUNT, c('Set is complete, all panels both sides', 'सेट पूरा है, सारे पैनल दोनों साइड', 'set-complete'),
    c('Cut follows the pattern line', 'कटाई पैटर्न की लाइन पर है', 'inspect'),
    c('Left and right panels match in size', 'बाएँ-दाएँ पैनल नाप में बराबर हैं', 'measure'),
    PHOTO,
  ] },
  { step: 'issue', stage: 'pasting', category: 'jacket', items: [RIGHT_WORKER, QTY_CONFIRMED, PHOTO] },
  { step: 'issue', stage: 'stitching', category: 'jacket', items: [
    c('Right tailor confirmed', 'सही टेलर है', 'hand-over'), QTY_CONFIRMED, MATERIALS, PHOTO,
  ] },
  { step: 'issue', stage: 'finishing', category: 'jacket', items: [RIGHT_WORKER, QTY_CONFIRMED, PHOTO] },
  { step: 'receive', stage: 'pasting', category: 'jacket', items: [SAME_WORKER, QTY_RETURNED, NO_DAMAGE, PHOTO] },
  { step: 'receive', stage: 'stitching', category: 'jacket', items: [SAME_WORKER, QTY_RETURNED, NO_DAMAGE, PHOTO] },
  { step: 'receive', stage: 'finishing', category: 'jacket', items: [SAME_WORKER, QTY_RETURNED, NO_DAMAGE, PHOTO] },
  { step: 'qa', stage: 'pasting', category: 'jacket', items: [
    COUNT, SET,
    c('Pasting even, no glue on the face', 'पेस्टिंग एक-सी, ऊपर गोंद नहीं', 'glue'),
    c('Edges folded clean, not lifting', 'किनारे साफ़ मुड़े, उठे नहीं', 'inspect'),
    PHOTO,
  ] },
  { step: 'qa', stage: 'stitching', category: 'jacket', items: [
    c('Both sleeves aligned', 'दोनों बाजू एक लाइन में हैं', 'set-complete'),
    c('Zips aligned', 'ज़िप सीधी और बराबर हैं', 'zip'),
    c('Stitching follows the drawn line', 'सिलाई खींची हुई लाइन पर है', 'stitch'),
    c('No cut on the jacket', 'जैकेट पर कोई कट नहीं', 'flaw'),
    PHOTO,
  ] },
  { step: 'qa', stage: 'finishing', category: 'jacket', items: [
    COUNT, SET,
    c('Surface clean, no marks or glue', 'सतह साफ़, दाग या गोंद नहीं', 'inspect'),
    c('Hardware fixed and working', 'हार्डवेयर पक्का और चलता है', 'hardware'),
    c('Lining sits flat', 'लाइनिंग सपाट बैठी है', 'inspect'),
    PHOTO,
  ] },
  { step: 'qa', stage: 'qc', category: 'jacket', items: [
    COUNT, SET,
    c('Measurements within tolerance', 'नाप सीमा में है', 'measure'),
    c('Labels and tags present and correct', 'लेबल और टैग सही लगे हैं', 'tags'),
    c('Overall look passes', 'कुल मिलाकर ठीक है', 'inspect'),
    PHOTO,
  ] },
  { step: 'pack', stage: null, category: 'jacket', items: [
    c('Carton is labelled', 'कार्टन पर लेबल है', 'label'),
    c('Piece is in the carton', 'पीस कार्टन में है', 'carton'),
    PHOTO,
  ] },
  { step: 'ship', stage: null, category: 'jacket', items: [
    c('Carton closed and sealed', 'कार्टन बंद और सील है', 'carton'),
    c('Carton count matches', 'कार्टन की गिनती सही है', 'count'),
    PHOTO,
  ] },
]

const WORK_OK = c('Work is acceptable', 'काम ठीक है', 'inspect')

/** Generic sets until the owner sends the real lists for bags, belts and small goods. */
function generic(category: StyleCategory): DefaultChecklist[] {
  const qa = (stage: Stage): DefaultChecklist => ({ step: 'qa', stage, category, items: [COUNT, SET, WORK_OK, PHOTO] })
  return [
    { step: 'activate', stage: null, category, items: [
      c('Leather lot matches the ticket', 'चमड़े का लॉट टिकट से मेल खाता है', 'leather-lot'),
      c('All parts for this piece are cut', 'इस पीस के सारे हिस्से कट गए हैं', 'panels'),
      PHOTO,
    ] },
    qa('cutting'), qa('pasting'), qa('stitching'), qa('finishing'), qa('qc'),
    { step: 'issue', stage: 'pasting', category, items: [RIGHT_WORKER, QTY_CONFIRMED, PHOTO] },
    { step: 'issue', stage: 'stitching', category, items: [RIGHT_WORKER, QTY_CONFIRMED, MATERIALS, PHOTO] },
    { step: 'issue', stage: 'finishing', category, items: [RIGHT_WORKER, QTY_CONFIRMED, PHOTO] },
    { step: 'receive', stage: 'pasting', category, items: [SAME_WORKER, QTY_RETURNED, NO_DAMAGE, PHOTO] },
    { step: 'receive', stage: 'stitching', category, items: [SAME_WORKER, QTY_RETURNED, NO_DAMAGE, PHOTO] },
    { step: 'receive', stage: 'finishing', category, items: [SAME_WORKER, QTY_RETURNED, NO_DAMAGE, PHOTO] },
    { step: 'pack', stage: null, category, items: [c('Carton is labelled', 'कार्टन पर लेबल है', 'label'), c('Piece is in the carton', 'पीस कार्टन में है', 'carton'), PHOTO] },
    { step: 'ship', stage: null, category, items: [c('Carton closed and sealed', 'कार्टन बंद और सील है', 'carton'), c('Carton count matches', 'कार्टन की गिनती सही है', 'count'), PHOTO] },
  ]
}

export const DEFAULT_CHECKLISTS: DefaultChecklist[] = [...JACKET, ...generic('bag'), ...generic('belt'), ...generic('slg')]

/** The one place the uniqueness key is spelled. Nulls become empty strings. */
export const scopeKey = (step: ChecklistStep, stage: Stage | null, category: string, programId: string | null): string =>
  `${step}|${stage ?? ''}|${category}|${programId ?? ''}`
