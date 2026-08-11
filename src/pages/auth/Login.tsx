import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { pathForRole } from '../../lib/roles'
import FormField from '../../components/FormField'
import Spinner from '../../components/Spinner'

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
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card px-6 py-4">
        <p className="text-xl font-bold text-primary">MiZanova</p>
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-card border border-border bg-card shadow-raised p-8">
          <h1 className="text-center text-3xl font-bold text-foreground">
            Welcome back
          </h1>
          <p className="mt-2 text-center text-muted-foreground">
            Sign in to continue supporting your students.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
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
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4">
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>
                <Link
                  to="/forgot-password"
                  className="ml-auto text-sm font-medium text-primary hover:underline"
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
        </div>
      </main>

      <footer className="px-6 py-4 text-center text-xs text-muted-foreground">
        © 2026 MiZanova · Special Miles · Data hosted in Australia
      </footer>
    </div>
  )
}
