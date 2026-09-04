import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../lib/auth'
import { listTotpFactors, verifyExistingFactor } from '../../lib/mfa'
import { supabase } from '../../lib/supabase'
import AuthLayout from './AuthLayout'
import Spinner from '../../components/Spinner'

/**
 * The second factor, asked for after the password.
 *
 * A ROUTE RATHER THAN A STEP ON THE LOGIN PAGE. A session that has passed the
 * password and not the code is a real, persisted session — it survives a
 * refresh and a new tab. If this only ran at the moment of signing in, closing
 * the tab and reopening it would walk straight past. ProtectedRoute sends
 * anyone in that state here, wherever they were heading.
 *
 * There is deliberately no "cancel" — only sign out. Somewhere between the two
 * factors is not a state to browse the app from.
 */
export default function VerifyTwoFactor() {
  const { session, mfaRequired, loading, signOut } = useAuth()
  const location = useLocation() as { state?: { from?: string } }

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const factors = useQuery({
    queryKey: ['mfa-factors', session?.user.id ?? null],
    queryFn: listTotpFactors,
    enabled: Boolean(session),
  })

  if (loading) return <Spinner label="Checking your session" />
  if (!session) return <Navigate to="/login" replace />

  // Already satisfied — either just now, or in another tab.
  if (mfaRequired === false) {
    return <Navigate to={location.state?.from ?? '/'} replace />
  }

  const factor = (factors.data ?? []).find((f) => f.verified)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!factor) return

    setError(null)
    setSubmitting(true)
    try {
      await verifyExistingFactor(factor.id, code)
      // Nothing to navigate: verifying issues a new token, which updates the
      // session, which re-runs the assurance check, which sends the redirect
      // above. One code path, the same as Login.
      //
      // The profile query is keyed on the user and will not refetch by itself,
      // so nudge the client to pick up the upgraded token.
      await supabase.auth.refreshSession()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
      setCode('')
    }
  }

  return (
    <AuthLayout
      title="Enter your code"
      subtitle="Open your authenticator app and type the six digits it shows."
    >
      {factors.isPending ? (
        <Spinner label="Loading your security settings" />
      ) : !factor ? (
        // Should not happen — we only arrive here because Supabase says a
        // factor is owed. If it does, say so rather than showing a form that
        // cannot work.
        <div
          role="alert"
          className="rounded-btn border border-danger bg-danger-subtle p-4 text-sm text-danger-foreground"
        >
          <p className="font-semibold">
            Your account needs a code, but no authenticator could be found.
          </p>
          <p className="mt-2">
            Sign out and in again. If it keeps happening, ask a platform
            administrator to reset two-factor authentication on your account.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error && (
            <div
              role="alert"
              className="rounded-btn border border-danger bg-danger-subtle p-3 text-sm font-medium text-danger-foreground"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="totp"
              className="block text-sm font-semibold text-foreground"
            >
              Six-digit code
            </label>
            <input
              id="totp"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              // Lets a phone offer the code straight from the keyboard.
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              placeholder="000000"
              className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-3 text-center font-mono text-2xl tracking-[0.4em] text-foreground"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || code.trim().length < 6}
            className="w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {submitting ? 'Checking…' : 'Continue'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Lost your phone?{' '}
        <Link
          to="/recover-2fa"
          className="font-semibold text-primary hover:underline"
        >
          Use a recovery code
        </Link>
      </p>

      <p className="mt-2 text-center text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => void signOut()}
          className="font-semibold text-primary hover:underline"
        >
          Sign out
        </button>
      </p>
    </AuthLayout>
  )
}
