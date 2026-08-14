import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import FormField from '../../components/FormField'
import Spinner from '../../components/Spinner'
import AuthLayout from './AuthLayout'

/** Our own floor, above Supabase's default of six. */
const MIN_LENGTH = 8

/**
 * Step two: where the emailed link lands.
 *
 * HOW THE LINK SIGNS YOU IN. Supabase puts recovery tokens in the URL and the
 * client exchanges them for a session automatically, so by the time this
 * renders the visitor is signed in as the owner of that mailbox. That is why
 * there is no "current password" field — someone resetting a password does not
 * have one to give. Proving they can read the inbox is the proof.
 *
 * WHICH MEANS: no session here is not a bug to hide. The link has expired, has
 * already been used, or was opened in a different browser from the one that
 * requested it. Each of those needs the same thing — request another — so they
 * get one honest message rather than a guess at which happened.
 */
export default function ResetPassword() {
  const { session, loading, setNewPassword } = useAuth()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (loading) return <Spinner label="Checking your link" />

  if (!session) {
    return (
      <AuthLayout title="That link no longer works">
        <div
          role="alert"
          className="rounded-btn border border-danger bg-danger-subtle p-4 text-sm text-danger-foreground"
        >
          <p className="font-semibold">
            This reset link has expired, has already been used, or was opened in
            a different browser.
          </p>
          <p className="mt-2">
            Ask for a new one — they are valid for an hour and can only be used
            once.
          </p>
        </div>

        <Link
          to="/forgot-password"
          className="mt-6 block w-full rounded-btn bg-primary px-4 py-3 text-center font-semibold text-primary-foreground"
        >
          Send a new link
        </Link>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout title="Password changed">
        <div
          role="status"
          className="rounded-btn border border-success bg-success-subtle p-4 text-sm text-success-foreground"
        >
          <p className="font-semibold">Your new password is saved.</p>
          <p className="mt-2">
            You are already signed in on this device. You will need the new
            password anywhere else you use MiZanova.
          </p>
        </div>

        <Link
          to="/"
          className="mt-6 block w-full rounded-btn bg-primary px-4 py-3 text-center font-semibold text-primary-foreground"
        >
          Continue
        </Link>
      </AuthLayout>
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    // Checked here so the person is told immediately, rather than after a
    // round trip that returns a message written for developers.
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await setNewPassword(password)
      setDone(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(
        /should be different|same as the old/i.test(message)
          ? 'That is the password you already have. Choose a different one.'
          : message,
      )
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle={session.user.email ?? undefined}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-btn border border-danger bg-danger-subtle p-3 text-sm font-medium text-danger-foreground"
          >
            {error}
          </div>
        )}

        <FormField
          label="New password"
          type={show ? 'text' : 'password'}
          name="new-password"
          autoComplete="new-password"
          required
          hint={`At least ${MIN_LENGTH} characters. A short phrase you will remember beats a short jumble you will not.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <FormField
          label="Confirm new password"
          type={show ? 'text' : 'password'}
          name="confirm-password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {/* 44px touch target rather than the height of its own text — and no
            negative margin to hide the extra height, which would overlap the
            field above it. See the note in Login.tsx. */}
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          {show ? 'Hide passwords' : 'Show passwords'}
        </button>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthLayout>
  )
}
