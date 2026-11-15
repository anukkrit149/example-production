'use client'
import { cloneElement, isValidElement, useId, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react'

import { inputClass } from './input-class'
// Client modules only. A server component must import inputClass from './input-class' — a value re-exported through this 'use client' module arrives there as a client reference, not a string.
export { inputClass }

export function Button({ variant = 'primary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const style =
    variant === 'primary'
      ? { background: 'var(--hf-oxblood-lit)', borderColor: 'var(--hf-oxblood-lit)', color: 'var(--hf-paper)' }
      : variant === 'danger'
        ? { background: 'var(--hf-card)', borderColor: 'var(--hf-oxblood-deep)', color: 'var(--hf-oxblood-deep)' }
        : { background: 'var(--hf-card)', borderColor: 'var(--hf-line)', color: 'var(--hf-ink)' }
  return (
    <button
      {...rest}
      style={style}
      className={`hf-ui inline-flex h-9 items-center justify-center rounded-md border px-4 text-xs uppercase disabled:opacity-50 ${className}`}
    />
  )
}

export function Field({ label, hint, children, id: givenId }: { label: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  // Explicit for/id association: a <label> wrapping a <select> folds the selected
  // option's text into the label's own text, which breaks exact label lookups
  // (Playwright, some screen readers). An id-linked label names the control and
  // nothing else.
  //
  // Pass `id` (and put the same id on the control) when the child is rendered
  // by a server component: cloning an element that crossed the server→client
  // boundary does not reliably carry the injected id after a full-page form
  // navigation, so the caller owns the pairing in that case.
  const generated = useId()
  const id = givenId ?? generated
  const control = givenId ? children : isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="hf-label" style={{ color: 'var(--hf-muted)' }}>{label}</label>
      {control}
      {hint && <span className="text-xs" style={{ color: 'var(--hf-muted)' }}>{hint}</span>}
    </div>
  )
}

export function PageHeader({ title, eyebrow, children }: { title: string; eyebrow?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
      <div>
        {eyebrow && <div className="hf-label mb-1" style={{ color: 'var(--hf-muted)' }}>{eyebrow}</div>}
        <h1 className="hf-display text-3xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border p-6 text-center text-sm" style={{ borderColor: 'var(--hf-line)', color: 'var(--hf-muted)' }}>{children}</p>
}

/** Key/value header block used on every detail page. */
export function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 rounded-lg border p-4" style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}>
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="hf-label" style={{ color: 'var(--hf-muted)' }}>{k}</dt>
          {/* 15px, a step above body: on a detail page these values are what the reader came for. */}
          <dd className="mt-1 text-[15px]">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
