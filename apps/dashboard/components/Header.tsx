import { SignOutButton } from './SignOutButton'

export function Header({ name, role, neon }: { name: string; role: string; neon: boolean }) {
  return (
    <header className="hidden h-12 items-center justify-end gap-4 border-b px-8 md:flex" style={{ borderColor: 'var(--hf-line)' }}>
      <span className="text-sm">{name}</span>
      <span className="hf-label" style={{ color: 'var(--hf-oxblood-lit)' }}>{role}</span>
      <SignOutButton neon={neon} />
    </header>
  )
}
