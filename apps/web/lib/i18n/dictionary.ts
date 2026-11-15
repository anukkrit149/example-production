import type { Action, PieceEventType, PieceState } from '@hf/domain'

export type Lang = 'en' | 'hi'

const en = {
  nav_scan: 'Scan', nav_labels: 'Labels', nav_codes: 'Codes', sign_out: 'Sign out',
  scan_title: 'Scan a piece', scan_hint: 'Point the camera at the label', scan_manual: 'Type the code instead', scan_go: 'Open', scan_unknown: 'No piece has this code', scan_is_badge: 'That is your ID card, not a piece. Scan the label on the piece.',
  no_actions: 'Nothing to do on this piece', history: 'History', scan_another: 'Scan another',
  with: 'With', since: 'Since', last: 'Last', store_room: 'Store room', created: 'Created',
  yes: 'YES', no: 'NO', confirm: 'CONFIRM', back: 'Back', next: 'Next', cancel: 'Cancel', retry: 'Try again', done: 'Done', scan_next: 'Scan next',
  step_of: 'Step {n} of {total}', summary: 'Check everything, then confirm',
  what_is_wrong: 'What is wrong?', put_on_hold: 'Put on hold', reject_piece: 'Reject piece', fail_check: 'Fail this check', go_back: 'Go back to the piece', reason: 'Reason', say_what_happened: 'Say what happened',
  take_photo: 'Take the photo', photo_taken: 'Photo taken', retake: 'Retake',
  leather_lot: 'Leather lot', notes: 'Notes (optional)', worker: 'Worker', carton: 'Carton number', shortage: 'Anything short? (optional)', defects: 'Defects found',
  materials: 'Materials', material_code: 'Material', qty: 'Qty', unit: 'Unit', add_material: 'Add material', remove: 'Remove',
  saving: 'Saving…', changed_rescan: 'This piece changed. Scan it again.', network: 'No connection. Nothing was saved — try again.', checklist_changed: 'The checklist was updated. Starting again.',
  ship_title: 'Ship a carton', ship_pick_order: 'Choose the order', ship_pick_carton: 'Choose the carton', ship_pieces: 'pieces', shipped_ok: 'Carton shipped',
  labels_title: 'Labels to print', labels_planned: 'Planned labels — white stock', labels_kind_planned: 'Planned', labels_kind_stage: 'Stage', export_csv: 'CSV', export_xlsx: 'XLSX', mark_printed: 'Mark printed', activate_without_label: 'Activate without label',
  tick_one_first: 'Tick at least one {tag} label first.', export_conflict: 'Some of those labels were already exported by someone else. Reload the queue.', export_failed: 'Export failed. Nothing was marked — try again.', export_ok: '{n} {tag} label{plural} exported. Open the file in WePrint, print it, then mark the batch printed below.',
  mark_printed_ok: 'Batch marked printed. Stick the labels on the pieces.', mark_printed_conflict: 'That batch was already marked printed.', mark_printed_failed: 'Could not mark the batch printed. Try again.',
  labels_empty_planned: 'No planned labels waiting. New ones appear here as pieces are created.', labels_empty_stage: 'Every requested label has been printed. New ones appear here as pieces pass QA.',
  confirm_hold: 'Confirm hold', confirm_release: 'Confirm release', confirm_reject: 'Confirm reject', confirm_reprint: 'Confirm reprint', why_reprint: 'Why reprint?', reprint_damaged: 'Damaged', reprint_unreadable: 'Unreadable', reprint_missing: 'Missing', reprint_correction: 'Correction', action_failed: 'That did not go through. Try again.',
  reject_form_title: 'Reject piece', reject_form_done_title: 'Piece rejected', reject_form_replacement_title: 'Replacement to cut',
  new_piece_title: 'New piece at cutting', print_queue_title: 'Print queue',
  inv_title: 'Store inventory', inv_received_delivery: 'Received a delivery', inv_to_count: 'To count', inv_recent: 'Your recent receipts', inv_none_to_count: 'Nothing waiting to be counted.',
  inv_receive_title: 'Record a delivery', inv_photo_goods: 'Photo of the goods', inv_photo_place: 'Photo of where you put it', inv_photo_document: 'Photo of the paper receipt', inv_shelf: 'Shelf or rack (optional)', inv_supplier: 'From (supplier)', inv_reference: 'Receipt number',
  inv_items: 'What is in it', inv_pick_one: 'Tick at least one item.', inv_suggested: 'Suggested', inv_reading: 'Reading the photo…', inv_receipt_says: 'Receipt says {n}', inv_no_suggestion: 'No suggestion from the photo', inv_n_photos: '{n} photos',
  inv_recorded_title: 'Recorded', inv_recorded_hint: 'Waiting for the store to count it.', inv_another: 'Another delivery',
  inv_count_title: 'Count against the receipt', inv_expected: 'Receipt says', inv_counted: 'Counted', inv_add_item: 'Add item', inv_count_done: 'Counted', inv_all_match: 'Everything matches the receipt.', inv_short_by: '{code} short by {n}', inv_over_by: '{code} over by {n}', inv_no_expected: '{code}: the receipt gave no number', inv_already_counted: 'This receipt was already counted.', inv_next_to_count: 'Next to count',
  inv_awaiting: 'Waiting for count', inv_counted_status: 'Counted', inv_discrepancy: 'Discrepancy', inv_received_by: 'Received by', inv_photos: 'Photos', inv_close: 'Close',
  nav_home: 'Home', home_title: 'What are you doing?', home_production: 'Production line', home_production_hint: 'Scan a piece, check it, move it on',
  home_pieces: 'Pieces status', home_pieces_hint: 'Where every piece is', home_inventory: 'Inventory', home_inventory_hint: 'Deliveries and stock',
  detail_status: 'Status', detail_next_step: 'Next step', detail_last_signoff: 'Last sign-off', next_btn: 'Next', more_actions: 'More',
  all_questions: 'All questions', signed_off_by: 'Signed off by', approve: 'Approve', reject: 'Reject', submitted: 'Submitted',
  measure_allowed: 'Allowed {min}–{max} {unit}', measure_out_of_range: 'Outside the allowed range',
  approve_blocked_measure: 'A measurement is outside the allowed range. Reject, or go back and re-measure.',
  pieces_title: 'Pieces status', pieces_search: 'Code or style', pieces_filter_all: 'All', pieces_on_hold: 'On hold', pieces_load_more: 'Load more', pieces_empty: 'No pieces here.',
  stage_cutting: 'Cutting', stage_pasting: 'Pasting', stage_stitching: 'Stitching', stage_finishing: 'Finishing', stage_qc: 'QC', stage_packed: 'Packed',
  reason_photo_required: 'A reason and a photo are needed.',
  shutter: 'Take photo', use_system_camera: 'Use the phone camera app instead', camera_denied: 'Camera not available. Use the button below.',
  camera_starting: 'Starting camera',
  dictate: 'Speak', listening: 'Listening… tap to stop',
  inv_step_goods: 'Photo of the goods', inv_step_place: 'Where did you put it?', inv_step_document: 'Photo of the paper receipt', inv_step_items: 'What is in it?', inv_step_details: 'Who sent it?', inv_step_review: 'Check and confirm',
} as const

export type Key = keyof typeof en

const hi: Record<Key, string> = {
  nav_scan: 'स्कैन', nav_labels: 'लेबल', nav_codes: 'कोड', sign_out: 'साइन आउट',
  scan_title: 'पीस स्कैन करें', scan_hint: 'कैमरा लेबल पर रखें', scan_manual: 'कोड टाइप करें', scan_go: 'खोलें', scan_unknown: 'इस कोड का कोई पीस नहीं', scan_is_badge: 'यह आपका ID कार्ड है, पीस नहीं। पीस पर लगे लेबल को स्कैन करें।',
  no_actions: 'इस पीस पर अभी कुछ नहीं करना', history: 'इतिहास', scan_another: 'दूसरा स्कैन करें',
  with: 'किसके पास', since: 'कब से', last: 'आख़िरी', store_room: 'स्टोर रूम', created: 'बनाया गया',
  yes: 'हाँ', no: 'नहीं', confirm: 'पक्का करें', back: 'पीछे', next: 'आगे', cancel: 'रद्द', retry: 'फिर कोशिश करें', done: 'हो गया', scan_next: 'अगला स्कैन',
  step_of: 'कदम {n} / {total}', summary: 'सब जाँचें, फिर पक्का करें',
  what_is_wrong: 'क्या गलत है?', put_on_hold: 'रोक कर रखें', reject_piece: 'पीस रिजेक्ट करें', fail_check: 'यह जाँच फेल', go_back: 'पीस पर वापस', reason: 'कारण', say_what_happened: 'क्या हुआ, लिखें',
  take_photo: 'फ़ोटो लें', photo_taken: 'फ़ोटो ले ली', retake: 'फिर से लें',
  leather_lot: 'चमड़े का लॉट', notes: 'नोट (ज़रूरी नहीं)', worker: 'कारीगर', carton: 'कार्टन नंबर', shortage: 'कुछ कम है? (ज़रूरी नहीं)', defects: 'खराबी',
  materials: 'सामान', material_code: 'सामान', qty: 'मात्रा', unit: 'इकाई', add_material: 'सामान जोड़ें', remove: 'हटाएँ',
  saving: 'सेव हो रहा है…', changed_rescan: 'यह पीस बदल गया। फिर से स्कैन करें।', network: 'नेटवर्क नहीं। कुछ सेव नहीं हुआ — फिर कोशिश करें।', checklist_changed: 'चेकलिस्ट बदल गई। फिर से शुरू।',
  ship_title: 'कार्टन भेजें', ship_pick_order: 'ऑर्डर चुनें', ship_pick_carton: 'कार्टन चुनें', ship_pieces: 'पीस', shipped_ok: 'कार्टन भेज दिया',
  labels_title: 'छापने के लेबल', labels_planned: 'प्लान लेबल — सफ़ेद', labels_kind_planned: 'प्लान', labels_kind_stage: 'स्टेज', export_csv: 'CSV', export_xlsx: 'XLSX', mark_printed: 'छप गया', activate_without_label: 'बिना लेबल शुरू करें',
  tick_one_first: 'कम से कम एक {tag} लेबल चुनें।', export_conflict: 'कुछ लेबल किसी और ने पहले ही एक्सपोर्ट कर दिए। कतार फिर से लोड करें।', export_failed: 'एक्सपोर्ट नहीं हुआ। कुछ सेव नहीं हुआ — फिर कोशिश करें।', export_ok: '{n} {tag} लेबल{plural} एक्सपोर्ट हो गए। फ़ाइल WePrint में खोलें, छापें, फिर नीचे बैच को छपा हुआ दर्ज करें।',
  mark_printed_ok: 'बैच छपा हुआ दर्ज हुआ। लेबल पीस पर चिपकाएँ।', mark_printed_conflict: 'यह बैच पहले ही छपा हुआ दर्ज हो चुका है।', mark_printed_failed: 'बैच दर्ज नहीं हुआ। फिर कोशिश करें।',
  labels_empty_planned: 'कोई प्लान लेबल बाकी नहीं। नए पीस बनने पर यहाँ दिखेंगे।', labels_empty_stage: 'हर माँगा गया लेबल छप चुका है। QA पास होने पर नए यहाँ दिखेंगे।',
  confirm_hold: 'रोकना पक्का करें', confirm_release: 'रोक हटाना पक्का करें', confirm_reject: 'रिजेक्ट पक्का करें', confirm_reprint: 'फिर छापना पक्का करें', why_reprint: 'फिर क्यों छापें?', reprint_damaged: 'खराब हुआ', reprint_unreadable: 'पढ़ा नहीं जा रहा', reprint_missing: 'गुम है', reprint_correction: 'सुधार', action_failed: 'यह नहीं हुआ। फिर कोशिश करें।',
  reject_form_title: 'पीस रिजेक्ट करें', reject_form_done_title: 'पीस रिजेक्ट हो गया', reject_form_replacement_title: 'कटाई के लिए रिप्लेसमेंट',
  new_piece_title: 'कटाई पर नया पीस', print_queue_title: 'छपाई की कतार',
  inv_title: 'स्टोर का सामान', inv_received_delivery: 'सामान आया है', inv_to_count: 'गिनना बाकी', inv_recent: 'आपकी हाल की रसीदें', inv_none_to_count: 'गिनने के लिए कुछ बाकी नहीं।',
  inv_receive_title: 'सामान दर्ज करें', inv_photo_goods: 'सामान की फ़ोटो', inv_photo_place: 'जहाँ रखा उसकी फ़ोटो', inv_photo_document: 'कागज़ की रसीद की फ़ोटो', inv_shelf: 'शेल्फ़ या रैक (ज़रूरी नहीं)', inv_supplier: 'किससे आया (सप्लायर)', inv_reference: 'रसीद नंबर',
  inv_items: 'इसमें क्या है', inv_pick_one: 'कम से कम एक चीज़ चुनें।', inv_suggested: 'सुझाव', inv_reading: 'फ़ोटो पढ़ी जा रही है…', inv_receipt_says: 'रसीद में {n}', inv_no_suggestion: 'फ़ोटो से कोई सुझाव नहीं', inv_n_photos: '{n} फ़ोटो',
  inv_recorded_title: 'दर्ज हो गया', inv_recorded_hint: 'स्टोर की गिनती बाकी है।', inv_another: 'और सामान दर्ज करें',
  inv_count_title: 'रसीद से गिनती मिलाएँ', inv_expected: 'रसीद में', inv_counted: 'गिना', inv_add_item: 'चीज़ जोड़ें', inv_count_done: 'गिनती हो गई', inv_all_match: 'सब रसीद से मिलता है।', inv_short_by: '{code} {n} कम', inv_over_by: '{code} {n} ज़्यादा', inv_no_expected: '{code}: रसीद में संख्या नहीं', inv_already_counted: 'यह रसीद पहले ही गिनी जा चुकी है।', inv_next_to_count: 'अगली गिनती',
  inv_awaiting: 'गिनती बाकी', inv_counted_status: 'गिनी गई', inv_discrepancy: 'फ़र्क', inv_received_by: 'किसने लिया', inv_photos: 'फ़ोटो', inv_close: 'बंद करें',
  nav_home: 'होम', home_title: 'आप क्या कर रहे हैं?', home_production: 'प्रोडक्शन लाइन', home_production_hint: 'पीस स्कैन करें, जाँचें, आगे बढ़ाएँ',
  home_pieces: 'पीस की स्थिति', home_pieces_hint: 'हर पीस कहाँ है', home_inventory: 'स्टोर सामान', home_inventory_hint: 'सामान और डिलीवरी',
  detail_status: 'स्थिति', detail_next_step: 'अगला कदम', detail_last_signoff: 'आख़िरी साइन-ऑफ़', next_btn: 'आगे', more_actions: 'और',
  all_questions: 'सारे सवाल', signed_off_by: 'साइन-ऑफ़', approve: 'मंज़ूर', reject: 'रिजेक्ट', submitted: 'जमा हो गया',
  measure_allowed: 'तय सीमा {min}–{max} {unit}', measure_out_of_range: 'तय सीमा से बाहर',
  approve_blocked_measure: 'एक नाप तय सीमा से बाहर है। रिजेक्ट करें, या पीछे जाकर फिर नापें।',
  pieces_title: 'पीस की स्थिति', pieces_search: 'कोड या स्टाइल', pieces_filter_all: 'सभी', pieces_on_hold: 'रोके गए', pieces_load_more: 'और दिखाएँ', pieces_empty: 'यहाँ कोई पीस नहीं।',
  stage_cutting: 'कटाई', stage_pasting: 'पेस्टिंग', stage_stitching: 'सिलाई', stage_finishing: 'फिनिशिंग', stage_qc: 'क्यूसी', stage_packed: 'पैक',
  reason_photo_required: 'कारण और फ़ोटो, दोनों ज़रूरी हैं।',
  shutter: 'फ़ोटो लें', use_system_camera: 'इसके बजाय फ़ोन का कैमरा ऐप इस्तेमाल करें', camera_denied: 'कैमरा उपलब्ध नहीं। नीचे दिया बटन इस्तेमाल करें।',
  camera_starting: 'कैमरा शुरू हो रहा है',
  dictate: 'बोलें', listening: 'सुन रहा है… रोकने के लिए टैप करें',
  inv_step_goods: 'सामान की फ़ोटो', inv_step_place: 'कहाँ रखा?', inv_step_document: 'कागज़ की रसीद की फ़ोटो', inv_step_items: 'इसमें क्या है?', inv_step_details: 'किसने भेजा?', inv_step_review: 'जाँचें और पक्का करें',
}

export const DICT: Record<Lang, Record<Key, string>> = { en, hi }
export const KEYS = Object.keys(en) as Key[]

/** `t('step_of', { n: 2, total: 5 })` — braces are replaced; unknown keys fall back to English. */
export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let s = DICT[lang][key] ?? DICT.en[key]
  for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, String(v))
  return s
}

const STATES: Record<PieceState, [string, string]> = {
  PLANNED: ['Planned', 'प्लान'], CUT_PENDING_QA: ['Cutting QA due', 'कटाई QA बाकी'], CUT_OK: ['Cut OK', 'कटाई OK'],
  WITH_PASTING: ['With pasting', 'पेस्टिंग में'], PASTED_PENDING_QA: ['Pasting QA due', 'पेस्टिंग QA बाकी'], PASTE_OK: ['Paste OK', 'पेस्टिंग OK'],
  WITH_STITCHING: ['With stitching', 'सिलाई में'], STITCHED_PENDING_QA: ['Stitching QA due', 'सिलाई QA बाकी'], STITCH_OK: ['Stitch OK', 'सिलाई OK'],
  WITH_FINISHING: ['With finishing', 'फिनिशिंग में'], FINISHED_PENDING_QA: ['Finishing QA due', 'फिनिशिंग QA बाकी'], FINISH_OK: ['Finish OK', 'फिनिशिंग OK'],
  QC_OK: ['QC passed', 'QC पास'], PACKED: ['Packed', 'पैक'], SHIPPED: ['Shipped', 'भेज दिया'],
  ON_HOLD: ['On hold', 'रोका हुआ'], REJECTED: ['Rejected', 'रिजेक्ट'], CANCELLED: ['Cancelled', 'रद्द'],
}
export const stateName = (s: PieceState, lang: Lang) => STATES[s][lang === 'hi' ? 1 : 0]

const ACTIONS: Record<Action, [string, string]> = {
  activate: ['Start cutting', 'कटाई शुरू करें'], submit_qa: ['Do the QA', 'QA करें'], issue: ['Hand to worker', 'कारीगर को दें'], receive: ['Take back', 'वापस लें'],
  hold: ['Put on hold', 'रोक कर रखें'], release: ['Release hold', 'रोक हटाएँ'], reject: ['Reject piece', 'पीस रिजेक्ट करें'], reprint: ['Reprint label', 'लेबल फिर छापें'],
  cancel: ['Cancel', 'रद्द'], pack: ['Pack', 'पैक करें'],
}
export const actionLabel = (a: Action, lang: Lang) => ACTIONS[a][lang === 'hi' ? 1 : 0]

const EVENTS: Partial<Record<PieceEventType, [string, string]>> = {
  PIECE_ACTIVATED: ['Cutting started', 'कटाई शुरू'], STAGE_QA_PASSED: ['QA passed', 'QA पास'], STAGE_QA_FAILED: ['QA failed', 'QA फेल'],
  ISSUED: ['Handed to worker', 'कारीगर को दिया'], RECEIVED: ['Taken back', 'वापस लिया'], PIECE_HELD: ['Put on hold', 'रोका'], PIECE_RELEASED: ['Released', 'रोक हटी'],
  PIECE_REJECTED: ['Rejected', 'रिजेक्ट'], PIECE_CANCELLED: ['Cancelled', 'रद्द'], PACKED: ['Packed', 'पैक'], SHIPPED: ['Shipped', 'भेजा'],
  LABEL_PRINT_REQUESTED: ['Label requested', 'लेबल माँगा'], LABEL_REPRINT_REQUESTED: ['Reprint requested', 'लेबल फिर माँगा'],
}
export const eventName = (t: PieceEventType, lang: Lang, fallback: string) => EVENTS[t]?.[lang === 'hi' ? 1 : 0] ?? fallback
