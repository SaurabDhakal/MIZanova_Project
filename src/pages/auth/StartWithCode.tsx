import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import {
  peekGuardianCode,
  redeemGuardianCode,
  type GuardianCodeDetails,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { pathForRole } from '../../lib/roles'
import AuthLayout from './AuthLayout'
import Spinner from '../../components/Spinner'

/**
 * `/link` — the front door for a family, at `mizanova.app/link`.
 *
 * WHY THIS EXISTS. The school hands out a code and nothing else. Without a page
 * to take it to, a parent lands on the ordinary signup form, picks a role from
 * a list that includes Educator and Specialist, registers with whatever address
 * they normally use, and only then discovers the code was issued to a different
 * one — by which point the account exists and the confusion is total.
 *
 * So the CODE comes first and everything else follows from it. Check the code,
 * learn which address it belongs to, and only then make an account. Nobody is
 * asked to choose a role, because there is nothing to choose: a person holding
 * a guardian code is a guardian.
 */
export default function StartWithCode() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  /**
   * `?code=` is filled in AND checked straight away.
   *
   * An earlier version filled it in and waited for the person to press
   * Continue, on the reasoning that a page acting before you have read it is
   * unnerving. That was wrong, and produced a real bug: signup hands back here
   * after making the account, and the parent was shown the code box a second
   * time — looking exactly as though the first attempt had failed.
   *
   * They arrived by clicking a link containing the code. Asking them to confirm
   * the thing they just clicked is not caution, it is a dead end.
   *
   * The trade-off in putting a code in a URL, stated rather than hidden: it
   * reaches browser history. It is single use, expires in 30 days, and is
   * refused unless the address matches — so what lingers is a code already
   * spent by the person who spent it.
   */
  const urlCode = params.get('code')
  const urlEmail = params.get('email')

  const [code, setCode] = useState(() => urlCode ?? '')
  const [found, setFound] = useState<GuardianCodeDetails | null>(null)
  const [autoChecked, setAutoChecked] = useState(false)

  const check = useMutation({
    mutationFn: () => peekGuardianCode(code),
    onSuccess: setFound,
  })

  const redeem = useMutation({
    mutationFn: () => redeemGuardianCode(code),
    /**
     * WHEREVER THIS PERSON ACTUALLY BELONGS, not always /parent.
     *
     * Being a guardian is not a role — it is a link in `student_guardians`,
     * and `can_view_student` honours it outside the role checks entirely. So
     * an account can be a teacher at the school AND a parent of a child there,
     * which is common and which the product should not fight.
     *
     * Sending them to /parent hard-coded bounced exactly those people off a
     * route their role cannot open, immediately after telling them it worked.
     */
    onSuccess: () =>
      navigate(profile ? pathForRole(profile.role) : '/parent', { replace: true }),
  })

  // Arrived by clicking a link that contains the code — check it rather than
  // making them press Continue on something they have already chosen.
  if (urlCode && !autoChecked && !check.isPending && !check.isError) {
    setAutoChecked(true)
    check.mutate()
  }

  if (loading) return <Spinner label="Checking your session" />
  if (urlCode && !found && (check.isPending || !autoChecked)) {
    return <Spinner label="Checking your code" />
  }

  // --- Step 1: what code do you have? --------------------------------------
  if (!found) {
    return (
      <AuthLayout title="Link your child">
        <p className="mb-5 text-sm text-muted-foreground">
          Your child&rsquo;s school has given you a code. Enter it here and we
          will set up your account.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            check.mutate()
          }}
          noValidate
        >
          {check.isError && (
            <p
              role="alert"
              className="mb-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
            >
              {check.error.message}
            </p>
          )}

          <label
            htmlFor="start-code"
            className="block text-sm font-semibold text-foreground"
          >
            Your access code
          </label>
          <input
            id="start-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="K7QP-4M2X-9RTB"
            className="mt-1.5 w-full rounded-btn border border-border bg-card px-4 py-3 font-mono text-lg tracking-widest text-foreground uppercase placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Capitals, dashes and spaces do not matter.
          </p>

          <button
            type="submit"
            disabled={check.isPending || code.trim() === ''}
            className="mt-5 w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {check.isPending ? 'Checking…' : 'Continue'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  // --- Step 2a: not signed in ----------------------------------------------
  if (!session) {
    return (
      <AuthLayout title={`${found.childName}, at ${found.schoolName}`}>
        <div className="rounded-btn border border-border bg-background p-4 text-sm">
          <p className="text-foreground">
            This code links you to{' '}
            <strong className="font-semibold">{found.childName}</strong>.
          </p>
          <p className="mt-2 text-muted-foreground">
            The school issued it to{' '}
            <strong className="font-medium text-foreground">
              {found.emailHint}
            </strong>
            . Your account has to use that address — it is what stops somebody
            else using a code they were not sent.
          </p>
        </div>

        {/* THE CODE TRAVELS WITH THEM. Sending a parent to a bare /signup is
            how they end up with an account the code cannot attach to. */}
        {/* The address goes with them, so signup can fill it in rather than
            asking a parent to remember which of their addresses the school
            holds. Signup checks it against the code before trusting it. */}
        <Link
          to={
            `/signup?code=${encodeURIComponent(code)}` +
            (urlEmail ? `&email=${encodeURIComponent(urlEmail)}` : '')
          }
          className="mt-6 block w-full rounded-btn bg-primary px-4 py-3 text-center font-semibold text-primary-foreground"
        >
          Create my account
        </Link>
        <Link
          to={`/login?next=${encodeURIComponent('/parent/link-child')}`}
          className="mt-3 block w-full rounded-btn border border-border px-4 py-3 text-center font-semibold text-foreground"
        >
          I already have an account
        </Link>
      </AuthLayout>
    )
  }

  // --- Step 2b: signed in already ------------------------------------------
  return (
    <AuthLayout title={`Link ${found.childName}`}>
      {redeem.isError && (
        <p
          role="alert"
          className="mb-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
        >
          {redeem.error.message}
        </p>
      )}

      <div className="rounded-btn border border-border bg-background p-4 text-sm">
        <p className="text-foreground">
          This code links you to{' '}
          <strong className="font-semibold">{found.childName}</strong> at{' '}
          {found.schoolName}.
        </p>
        <p className="mt-2 text-muted-foreground">
          You are signed in as {session.user.email}. The code was sent to{' '}
          {found.emailHint} — if those do not match, it will be refused.
        </p>
      </div>

      <button
        type="button"
        onClick={() => redeem.mutate()}
        disabled={redeem.isPending}
        className="mt-6 w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
      >
        {redeem.isPending ? 'Linking…' : `Link ${found.childName} to my account`}
      </button>
    </AuthLayout>
  )
}
