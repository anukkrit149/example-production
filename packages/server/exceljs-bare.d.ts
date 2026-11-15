/**
 * exceljs ships a browser bundle with no type declarations of its own.
 *
 * @hf/labels loads it on Cloudflare Workers, where the default Node entry cannot
 * be evaluated (its `fstream` dependency calls `process.umask`, which workerd
 * does not implement) — see packages/labels/src/weprint.ts.
 *
 * The same declaration lives in packages/labels because that package typechecks
 * on its own; this copy exists because this package's tsc typechecks the
 * @hf/labels sources against @hf/server's own tsconfig, whose `include` does
 * not reach outside this directory. apps/web carries an identical copy for the
 * same reason.
 */
declare module 'exceljs/dist/exceljs.bare.min.js' {
  const ExcelJS: unknown
  export default ExcelJS
}
