import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import FormField from '../../components/FormField'
import AuthLayout from './AuthLayout'

/**
 * Step one of a password reset: ask where to send the link.
 *
 * THE CONFIRMATION IS DELIBERATELY VAGUE. It says "if an account exists" and
 * shows the same words whether or not one does. Confirming that an address is
 * registered here tells anyone who asks which staff and which families are
 * connected to a school's neurodiversity programme — a disclosure about
 * children by implication. Login.tsx refuses to distinguish a wrong password
 * from an unknown email for the same reason.
 *
 * Supabase already behaves this way: resetPasswordForEmail does not report an
 * unknown address. This screen simply does not undo that.
 */
export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth()

  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await requestPasswordReset(email.trim())
      setSent(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'

      // These two are worth translating. Neither reveals whether an account
      // exists — one is about the address itself, the other about how often
      // this button has been pressed — so saying them plainly costs nothing
      // and saves someone staring at a message written for a developer.
      if (/rate|too many|seconds/i.test(message)) {
        setError('Too many requests. Wait a minute and try again.')
      } else if (/invalid/i.test(message) && /email/i.test(message)) {
        setError(
          'That address cannot receive email, so no link can be sent to it. Check the spelling — and note that a made-up domain will always be refused.',
        )
      } else {
        setError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout title="Check your email">
        <div
          role="status"
          className="rounded-btn border border-success bg-success-subtle p-4 text-sm text-success-foreground"
        >
          <p className="font-semibold">
            If an account exists for {email.trim()}, a reset link is on its way.
          </p>
          <p className="mt-2">
            The link works once and expires after an hour. Check your junk
            folder if it has not arrived in a few minutes.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a link to choose a new one."
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
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@school.nsw.edu.au"
        />

        <button
          type="submit"
          disabled={submitting || email.trim() === ''}
          className="w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
