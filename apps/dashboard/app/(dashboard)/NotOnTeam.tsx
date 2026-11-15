import { SignOutButton } from '@/components/SignOutButton'

export function NotOnTeam({ email }: { email: string }) {
  return (
    <main className="mx-auto max-w-md p-10 text-center">
      <h1 className="hf-display mb-3 text-2xl">Not on the team list</h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--hf-muted)' }}>
        You are signed in as <strong>{email}</strong>, but that email has not been added to the dashboard. Ask an administrator to add you on the Team screen, then sign in again.
      </p>
      <SignOutButton neon />
    </main>
  )
}
