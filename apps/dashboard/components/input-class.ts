/**
 * The shared input look, as a plain string in a plain module.
 *
 * It lives outside ui.tsx on purpose: that file is 'use client', and a value
 * imported from a client module into a server component arrives as a client
 * reference, not a string — the class attribute then carries an error message.
 * Server components import from here; client components may use either.
 */
export const inputClass =
  'h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:outline-3 [border-color:var(--hf-line)] [background:var(--hf-card)]'
