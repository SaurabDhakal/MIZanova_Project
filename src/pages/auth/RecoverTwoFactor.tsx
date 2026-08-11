import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { redeemRecoveryCode } from '../../lib/mfa'
import { supabase } from '../../lib/supabase'
import AuthLayout from './AuthLayout'
import Spinner from '../../components/Spinner'

/**
 * "I have lost my phone."
 *
 * WHAT THIS DOES, SAID PLAINLY ON SCREEN TOO: it does not let anyone past the
 * second factor. It REMOVES the authenticator, dropping the account back to
 * password-only, and then makes you set a new one up. A recovery code is not a
 * spare key to the door; it is permission to change the lock.
 *
 * Said on screen because "recovery code" sounds like a password substitute,
 * and someone using one on a colleague's borrowed laptop should understand
 * that their old phone will stop working afterwards.
 */
export default function RecoverTwoFactor() {
  const { session, loading } = useAuth()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (loading) return <Spinner label="Checking your session" />
  if (!session) return <Navigate to="/login" replace />

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await redeemRecoveryCode(code)
      // The account now has no factor, so the assurance check will stop asking
      // for one — but only once this tab has a token that reflects it.
      await supabase.auth.refreshSession()
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <AuthLayout title="Authenticator removed">
        <div
          role="status"
          className="rounded-btn border border-success bg-success-subtle p-4 text-sm text-success-foreground"
        >
          <p className="font-semibold">That code was accepted.</p>
          <p className="mt-2">
            Your old authenticator no longer works and the code you just used is
            spent. Set up your new phone now — your account is protected by its
            password alone until you do.
          </p>
        </div>

        <Link
          to="/account/security"
          className="mt-6 block w-full rounded-btn bg-primary px-4 py-3 text-center font-semibold text-primary-foreground"
        >
          Set up a new authenticator
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Use a recovery code"
      subtitle="One of the ten codes you saved when you set up two-factor authentication."
    >
      <div className="mb-5 rounded-btn border border-warning bg-warning-subtle p-4 text-sm text-warning-foreground">
        <p className="font-semibold">This removes your current authenticator.</p>
        <p className="mt-1">
          A recovery code is not a way past the check — it lets you replace the
          phone that is doing the checking. Your old one will stop working, and
          you will be asked to set up a new one straight away.
        </p>
      </div>

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
            htmlFor="recovery-code"
            className="block text-sm font-semibold text-foreground"
          >
            Recovery code
          </label>
          <input
            id="recovery-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="A1B2C3D4E5-F6A7B8C9D0"
            className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-3 font-mono text-foreground placeholder:text-muted-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Upper or lower case, spaces do not matter. Each code works once.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting || code.trim() === ''}
          className="w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {submitting ? 'Checking…' : 'Remove my authenticator'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Still have your phone?{' '}
        <Link to="/verify-2fa" className="font-semibold text-primary hover:underline">
          Enter a code instead
        </Link>
      </p>
    </AuthLayout>
  )
}
