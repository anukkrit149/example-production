'use client'
import { AuthView } from '@neondatabase/auth-ui'
import { Providers } from '../providers'

/**
 * `AuthView`, not `SignInForm`. The installed package's `SignInForm` is the
 * bare inner form: it requires a `localization` prop and renders no card, no
 * OTP step and no magic-link step, so it cannot express the flow on its own.
 * `AuthView view="SIGN_IN"` is the documented full flow, takes its strings and
 * its enabled methods from the provider, and drives the email-OTP and
 * magic-link steps itself.
 */
export function SignIn() {
  return (
    <Providers>
      <AuthView view="SIGN_IN" />
    </Providers>
  )
}
