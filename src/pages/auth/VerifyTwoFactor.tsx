import { useEffect, useRef, useState } from 'react'
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

  const factor = (factors.data ?? []).find((f) => f.verified)

  /*
   * ---------------------------------------------------------------------------
   * THE CODE BOX IS WHERE THE CURSOR BELONGS, AND `autoFocus` WAS NOT ENOUGH
   * ---------------------------------------------------------------------------
   * Saurab: "after loggin in the option to type number should be at first but
   * that it is not the case".
   *
   * The input has carried `autoFocus` all along, and it genuinely works one
   * screen over — /recover-2fa focuses its field every time. The difference is
   * WHEN the element appears. Recovery renders its form on the first commit.
   * This screen renders `{factors.isPending ? <Spinner/> : <form/>}`, so the
   * input does not exist until a React Query resolves, which is a later commit
   * — by then the browser has settled focus on <body> after the navigation and
   * the mount-time autoFocus does not reclaim it.
   *
   * An effect keyed on the form actually being there does not care about commit
   * order. `autoFocus` stays as the belt to this braces.
   *
   * BOTH HOOKS SIT ABOVE THE EARLY RETURNS. The first version put them after,
   * which is a Rules of Hooks violation eslint caught and `tsc` did not: this
   * component returns early three times, so the hook order changed the moment
   * the session finished loading. Reading `factors.data` before the guards is
   * safe — it is undefined while the query is pending, which makes `factor`
   * undefined, which is exactly the condition the effect waits on.
   *
   * It matters more here than on most screens: somebody arrives holding a phone
   * with a six-digit code that expires in under thirty seconds, and being made
   * to click a box first is the wrong thing to ask at that moment.
   */
  const codeRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (factor) codeRef.current?.focus()
  }, [factor])

  if (loading) return <Spinner label="Checking your session" />
  if (!session) return <Navigate to="/login" replace />

  // Already satisfied — either just now, or in another tab.
  if (mfaRequired === false) {
    return <Navigate to={location.state?.from ?? '/'} replace />
  }

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
              ref={codeRef}
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
            className="pressable w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
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
          className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
        >
          Sign out
        </button>
      </p>
    </AuthLayout>
  )
}
