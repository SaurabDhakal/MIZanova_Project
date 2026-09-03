import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { pathForRole } from '../../lib/roles'
import FormField from '../../components/FormField'
import Spinner from '../../components/Spinner'
import AuthLayout from './AuthLayout'

/**
 * Sign-in page, built from `docs/Figma Pages Design/Login Page.png`.
 *
 * Two deliberate differences from that design:
 *
 * 1. The Figma email field shows placeholder letters "E  P  S  SA  PA" — a
 *    role switcher left over from prototyping. Real login must NEVER ask which
 *    role you are: the role comes from your account in the database. Asking
 *    would mean trusting the browser about who you are.
 *
 * 2. The Google and Microsoft buttons are omitted for now. They need OAuth
 *    providers configured in Supabase; a button that looks real and does
 *    nothing is worse than no button.
 *
 * ---------------------------------------------------------------------------
 * IT USES AuthLayout, AND WAS THE LAST PAGE THAT DID NOT
 * ---------------------------------------------------------------------------
 * AuthLayout was extracted once four copies of this frame existed. Login kept
 * its own, and drifted: a plain text wordmark instead of Joe's mark, and no
 * link home, on the one screen every single person sees first. Seven other
 * signed-out pages had the logo; this one had the word.
 *
 * That is the cost of a hand-maintained copy, and it is exactly what the
 * layout's own header comment predicted would happen.
 */
export default function Login() {
  const { signIn, session, profile, loading } = useAuth()
  const location = useLocation() as { state?: { from?: string }; search: string }

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <Spinner label="Checking your session" />

  // Already signed in — go where this person belongs.
  //
  // `?next=` exists for the invitation flow: somebody who already has an
  // account clicks "I already have one" and must land back on the invitation,
  // not on their dashboard with the invitation forgotten. Restricted to
  // in-app paths, because an open redirect on a sign-in page is how phishing
  // links get to wear your domain.
  const next = new URLSearchParams(location.search).get('next')
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null

  if (session && profile) {
    return (
      <Navigate
        to={safeNext ?? location.state?.from ?? pathForRole(profile.role)}
        replace
      />
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
      // No navigate() here: signing in updates the session, this component
      // re-renders, and the redirect above takes over. One code path.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'

      if (/invalid login credentials/i.test(message)) {
        // Supabase returns the same message for a wrong password and an
        // unknown email, on purpose — telling an attacker which one was wrong
        // hands them a way to discover who has an account here.
        setError('That email and password do not match an account.')
      } else if (
        /failed to fetch|networkerror|network request failed|load failed/i.test(
          message,
        )
      ) {
        // The app itself opens offline, so someone can reach this form with no
        // connection and be told "Failed to fetch" — which reads as a broken
        // site rather than the one thing that genuinely cannot work offline.
        // A password can only be checked by the server.
        setError(
          'You appear to be offline. Signing in needs a connection, because only the server can check a password. Everything else will work once you are back in.',
        )
      } else {
        setError(message)
      }
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue supporting your students."
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && (
              // role="alert" makes a screen reader announce this the moment it
              // appears, instead of the user wondering why nothing happened.
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

            <div>
              <FormField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {/*
                `min-h-11` — a 44px touch target instead of the 20px these used
                to be, which was the height of their own text. Fine with a
                mouse, poor with a thumb, and "Show password" is the worse of
                the two: the moment somebody reaches for it is the moment a
                password has just been rejected, usually one-handed.

                NO NEGATIVE MARGIN, and that was the first attempt. `-my-3`
                keeps the row occupying its original 20px, which looks tidy —
                but the button's hit area then extends 12px upward over the
                bottom of the password field, so tapping the field toggles the
                password instead of focusing it. A touch fix that creates a
                touch bug.

                The row is simply taller now. `mt-1.5` is gone because the
                44px box already carries 12px of space above its own text.
              */}
              <div className="flex flex-wrap items-center gap-x-4">
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                >
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>
                <Link
                  to="/forgot-password"
                  className="ml-auto inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {/* Not "Create an account" any more: /signup no longer creates
            one. An account comes from an invitation, a code, or Special
            Miles setting up a school, so the link asks the question this
            person actually has. */}
        Don’t have an account?{' '}
        <Link to="/signup" className="font-semibold text-primary hover:underline">
          How do I get one?
        </Link>
      </p>
    </AuthLayout>
  )
}
