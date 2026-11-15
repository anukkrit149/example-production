/**
 * exceljs ships a browser bundle with no type declarations of its own.
 *
 * weprint.ts loads it on Cloudflare Workers, where the default Node entry cannot
 * be evaluated (its `fstream` dependency calls `process.umask`, which workerd
 * does not implement). The runtime shape is the same library, and the one class
 * this package uses is structurally typed at the call site, so declaring the
 * module is all TypeScript needs.
 */
declare module 'exceljs/dist/exceljs.bare.min.js' {
  const ExcelJS: unknown
  export default ExcelJS
}
