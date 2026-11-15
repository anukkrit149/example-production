import type { LabelRow } from './label-content'

/** The slice of exceljs's Workbook this module uses. */
type ExcelWorkbook = {
  addWorksheet(name: string): { addRow(values: readonly unknown[]): unknown }
  xlsx: { writeBuffer(): Promise<ArrayBuffer> }
}

export const WEPRINT_COLUMNS = ['QR_VALUE', 'STAGE_TEXT', 'STYLE_LINE', 'DETAIL_LINE', 'QTY_LINE', 'CHECK_LINE', 'PRINT_DATE'] as const satisfies readonly (keyof LabelRow)[]

const q = (v: string) => (/[",\r\n]/.test(v) || /[^\x20-\x7E]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function toCsv(rows: LabelRow[]): string {
  const lines = [WEPRINT_COLUMNS.join(','), ...rows.map((r) => WEPRINT_COLUMNS.map((c) => q(r[c])).join(','))]
  return lines.join('\r\n') + '\r\n'
}

/**
 * exceljs is imported here, inside the function, rather than at module scope.
 *
 * Its Node entry pulls in `unzipper` -> `fstream`, which calls `process.umask`.
 * workerd's Node shim does not implement that, so merely EVALUATING the module
 * throws "[unenv] process.umask is not implemented yet!" on Cloudflare. At
 * module scope that cost fell on every route touching @hf/labels — including
 * /api/scan, which only reads label metadata and never builds a spreadsheet —
 * taking the scan route down with a 1101 and /print-queue with a 500.
 *
 * Deferring it here means only the WePrint export path loads it at all, which is
 * what fixes /api/scan and /print-queue. The export path itself still has to not
 * evaluate `fstream`, and that is the runtime branch below: on Workers it loads
 * exceljs's bare browser bundle, which drops the reading-only dependencies and
 * brings its own `process.umask`, so nothing of ours is polyfilled globally.
 *
 * The branch is chosen at runtime rather than by the bundler because the bundler
 * cannot do it here. A package `imports` condition (`workerd`) is the natural
 * mechanism and is what @hf/db uses, but Turbopack has no option to enable that
 * condition, and next.config's resolveAlias cannot stand in for it either:
 * aliases resolve from apps/web, and under pnpm `exceljs` is only reachable from
 * packages/labels, so the alias silently never matched. Branching here resolves
 * both specifiers from this file, where both are visible.
 *
 * Both branches are bundled; only one is ever evaluated, and evaluation is where
 * the umask call lives, so the unused branch costs bundle size and nothing else.
 *
 * The interop dance is because that bundle is UMD: depending on the build, the
 * module namespace is either the library itself or wraps it under `default`.
 */
export async function toXlsx(rows: LabelRow[]): Promise<Uint8Array> {
  const onWorkers =
    (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ===
    'Cloudflare-Workers'

  const mod = (onWorkers
    ? await import('exceljs/dist/exceljs.bare.min.js')
    : await import('exceljs')) as unknown as {
    default?: { Workbook: new () => ExcelWorkbook }
    Workbook?: new () => ExcelWorkbook
  }
  const ExcelJS = (mod.Workbook ? mod : mod.default) as { Workbook: new () => ExcelWorkbook }
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('labels')
  ws.addRow([...WEPRINT_COLUMNS])
  for (const r of rows) ws.addRow(WEPRINT_COLUMNS.map((c) => r[c]))
  return new Uint8Array(await wb.xlsx.writeBuffer())
}
