import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  confirmEnrolment,
  generateRecoveryCodes,
  listTotpFactors,
  recoveryCodesRemaining,
  removeFactor,
  startEnrolment,
  type EnrolmentStart,
} from '../../lib/mfa'
import { useAuth } from '../../lib/auth'
import { MFA_REQUIRED_ROLES } from '../../lib/roles'
import { ErrorState } from '../../components/QueryState'
import Spinner from '../../components/Spinner'
import FormField from '../../components/FormField'
import NotBuiltYet from '../../components/NotBuiltYet'
import { showToast } from '../../lib/toast'

/**
 * Security settings — docs/Figma Pages Design/Specialist · Settings/Security & 2FA.png.
 *
 * WHAT IS DELIBERATELY NOT HERE, and why. The design shows six more controls
 * than this page has:
 *
 *   SMS one-time password   — needs a paid SMS provider. Not configured.
 *   Auto-lock after 20 min  — nothing implements it.
 *   OTP for sensitive actions — nothing implements it.
 *   New-device alerts       — nothing implements it.
 *   Active sessions         — Supabase does not expose a user's session list
 *                             to the browser, so the list would be invented.
 *   Login activity          — sign-ins are not recorded anywhere.
 *
 * Six switches that look authoritative and change nothing would be worse than
 * absent on a page whose entire subject is whether this account is protected.
 * The note at the bottom says what is missing rather than pretending.
 */
export default function Security() {
  const { session, profile, changePassword: changePasswordFn } = useAuth()
  const queryClient = useQueryClient()

  const [enrolment, setEnrolment] = useState<EnrolmentStart | null>(null)
  const [code, setCode] = useState('')
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

  /* Both keyed on the person. They share the key shape with AuthProvider, so
     enrolling here still lifts the requirement there without either component
     knowing about the other — invalidateQueries matches by prefix, so the
     calls below need no change. */
  const factors = useQuery({
    queryKey: ['mfa-factors', session?.user.id ?? null],
    queryFn: listTotpFactors,
  })
  const remaining = useQuery({
    queryKey: ['recovery-codes-remaining', session?.user.id ?? null],
    queryFn: recoveryCodesRemaining,
  })

  const active = (factors.data ?? []).find((f) => f.verified)
  const mandatory =
    profile !== null && MFA_REQUIRED_ROLES.includes(profile.role)

  const begin = useMutation({
    mutationFn: startEnrolment,
    onSuccess: (started) => setEnrolment(started),
  })

  const confirm = useMutation({
    mutationFn: async () => {
      if (!enrolment) throw new Error('Start the setup again.')
      await confirmEnrolment(enrolment.factorId, code)
      // Codes are generated only once the factor actually works. Handing
      // someone recovery codes for an authenticator they never finished
      // setting up would be a set of codes for nothing.
      return generateRecoveryCodes()
    },
    onSuccess: (codes) => {
      setEnrolment(null)
      setCode('')
      setFreshCodes(codes)
      void queryClient.invalidateQueries({ queryKey: ['mfa-factors'] })
      void queryClient.invalidateQueries({ queryKey: ['recovery-codes-remaining'] })
      showToast('Two-factor authentication is on.')
    },
  })

  const regenerate = useMutation({
    mutationFn: generateRecoveryCodes,
    onSuccess: (codes) => {
      setFreshCodes(codes)
      void queryClient.invalidateQueries({ queryKey: ['recovery-codes-remaining'] })
    },
  })

  const remove = useMutation({
    mutationFn: (factorId: string) => removeFactor(factorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mfa-factors'] })
      showToast('Authenticator removed.')
    },
  })

  const changePassword = useMutation({
    mutationFn: () => changePasswordFn(currentPassword, password),
    onSuccess: () => {
      setCurrentPassword('')
      setPassword('')
      setConfirmPassword('')
      showToast('Password changed.')
    },
  })

  function submitPassword(event: React.FormEvent) {
    event.preventDefault()
    if (currentPassword === '') {
      setPasswordError('Enter your current password.')
      return
    }
    if (password.length < 8) {
      setPasswordError('Use at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setPasswordError('The two passwords do not match.')
      return
    }
    setPasswordError(null)
    changePassword.mutate()
  }

  if (factors.isPending) return <Spinner label="Loading your security settings" />
  if (factors.isError) return <ErrorState message={factors.error.message} />

  // NO <h1> HERE ANY MORE. AccountLayout carries "Settings" and the tab row,
  // and a second title underneath it read as two pages stacked. The tab is
  // what says which section you are in.
  return (
    <div className="max-w-3xl">
      {/* --- Recovery codes, shown once ------------------------------------ */}
      {freshCodes && (
        <div
          role="alert"
          className="mb-6 rounded-card border border-warning bg-warning-subtle p-5"
        >
          <h2 className="font-bold text-warning-foreground">
            Save these recovery codes now
          </h2>
          <p className="mt-1 max-w-prose text-sm text-warning-foreground">
            They are the only way back into your account if you lose your phone.
            Each one works once. <strong>They cannot be shown again</strong> —
            only a scrambled version is stored, so nobody, including Special
            Miles, can recover them for you.
          </p>

          <ul className="mt-4 grid grid-cols-1 gap-2 font-mono text-sm text-warning-foreground sm:grid-cols-2">
            {freshCodes.map((c) => (
              <li key={c} className="rounded-btn bg-card px-3 py-2">
                {c}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(freshCodes.join('\n'))
                showToast('Recovery codes copied.')
              }}
              className="rounded-btn bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Copy all
            </button>
            <button
              type="button"
              onClick={() => setFreshCodes(null)}
              className="rounded-btn border border-warning px-4 py-2.5 text-sm font-semibold text-warning-foreground"
            >
              I have saved them
            </button>
          </div>
        </div>
      )}

      {/* --- Two-factor authentication -------------------------------------- */}
      <section className="rounded-card border border-border bg-card shadow-raised p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground">
              Two-factor authentication
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A six-digit code from an app on your phone, on top of your
              password.
            </p>
          </div>
          <span
            className={`ml-auto rounded-btn px-3 py-1.5 text-sm font-semibold ${
              active
                ? 'bg-success-subtle text-success-foreground'
                : 'bg-warning-subtle text-warning-foreground'
            }`}
          >
            {active ? '✓ On' : 'Off'}
          </span>
        </div>

        {/* Someone forced here by ProtectedRoute arrives with no explanation of
            why their dashboard would not open. Saying it plainly, and saying
            what unblocks it, beats leaving them to work it out. */}
        {mandatory && !active && (
          <div
            role="alert"
            className="mt-4 rounded-card border border-warning bg-warning-subtle p-4"
          >
            <p className="font-semibold text-warning-foreground">
              Set this up to continue
            </p>
            <p className="mt-1 max-w-prose text-sm text-warning-foreground">
              Your role can open records about identifiable children, so a
              password alone is not enough. The rest of MiZanova stays locked
              until you have added an authenticator. It takes about a minute and
              you will need your phone.
            </p>
          </div>
        )}

        {mandatory && active && (
          <p className="mt-4 rounded-btn bg-background p-3 text-sm text-foreground">
            Your role can open records about children, so two-factor
            authentication is required. You can change which phone you use, but
            not turn it off.
          </p>
        )}

        {/* Already on */}
        {active && !enrolment && (
          <div className="mt-5 border-t border-border pt-5">
            <p className="text-sm text-foreground">
              Recovery codes remaining:{' '}
              <strong>
                {remaining.isPending ? '…' : (remaining.data ?? 0)} of 10
              </strong>
            </p>
            {(remaining.data ?? 0) === 0 && !remaining.isPending && (
              <p className="mt-1 text-sm font-medium text-danger-foreground">
                You have none left. If you lose your phone you will be locked
                out — generate a new set now.
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => regenerate.mutate()}
                disabled={regenerate.isPending}
                className="rounded-btn border border-border px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-60"
              >
                {regenerate.isPending
                  ? 'Generating…'
                  : 'Generate new recovery codes'}
              </button>

              {!mandatory && (
                <button
                  type="button"
                  onClick={() => remove.mutate(active.id)}
                  disabled={remove.isPending}
                  className="rounded-btn border border-danger px-4 py-2.5 text-sm font-semibold text-danger-foreground disabled:opacity-60"
                >
                  {remove.isPending ? 'Removing…' : 'Turn off'}
                </button>
              )}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Generating a new set makes every previous code stop working.
            </p>

            {(regenerate.isError || remove.isError) && (
              <p role="alert" className="mt-3 text-sm text-danger-foreground">
                {(regenerate.error ?? remove.error)?.message}
              </p>
            )}
          </div>
        )}

        {/* Not on yet, and not mid-setup */}
        {!active && !enrolment && (
          <div className="mt-5 border-t border-border pt-5">
            <button
              type="button"
              onClick={() => begin.mutate()}
              disabled={begin.isPending}
              className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
            >
              {begin.isPending ? 'Preparing…' : 'Set up an authenticator app'}
            </button>
            {begin.isError && (
              <p role="alert" className="mt-3 text-sm text-danger-foreground">
                {begin.error.message}
              </p>
            )}
          </div>
        )}

        {/* Mid-setup */}
        {enrolment && (
          <div className="mt-5 border-t border-border pt-5">
            <ol className="space-y-5">
              <li>
                <p className="font-semibold text-foreground">
                  1. Scan this with your authenticator app
                </p>
                <p className="text-sm text-muted-foreground">
                  Google Authenticator, Authy, 1Password, Microsoft
                  Authenticator — any of them.
                </p>
                <img
                  src={enrolment.qrCode}
                  alt="QR code for setting up two-factor authentication"
                  className="mt-3 h-48 w-48 rounded-card border border-border bg-white p-2"
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  Cannot scan? Type this key in instead:
                </p>
                <code className="mt-1 block rounded-btn bg-background px-3 py-2 font-mono text-sm break-all text-foreground">
                  {enrolment.secret}
                </code>
              </li>

              <li>
                <label
                  htmlFor="totp-code"
                  className="font-semibold text-foreground"
                >
                  2. Enter the six-digit code it shows
                </label>
                <input
                  id="totp-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="mt-2 block w-40 rounded-btn border border-border bg-card px-3 py-2.5 font-mono text-lg tracking-widest text-foreground"
                />
              </li>
            </ol>

            {confirm.isError && (
              <p
                role="alert"
                className="mt-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
              >
                {confirm.error.message}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => confirm.mutate()}
                disabled={confirm.isPending || code.trim().length < 6}
                className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
              >
                {confirm.isPending ? 'Checking…' : 'Turn on'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEnrolment(null)
                  setCode('')
                }}
                className="rounded-btn border border-border px-4 py-2.5 font-semibold text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* --- Password ------------------------------------------------------- */}
      <section className="mt-6 rounded-card border border-border bg-card shadow-raised p-6">
        <h2 className="text-lg font-bold text-foreground">Change password</h2>

        <form onSubmit={submitPassword} className="mt-4 max-w-sm space-y-4" noValidate>
          {passwordError && (
            <p
              role="alert"
              className="rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
            >
              {passwordError}
            </p>
          )}
          {changePassword.isError && (
            <p
              role="alert"
              className="rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
            >
              {changePassword.error.message}
            </p>
          )}

          <FormField
            label="Current password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />

          <FormField
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 8 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FormField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <button
            type="submit"
            disabled={changePassword.isPending}
            className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {changePassword.isPending ? 'Saving…' : 'Update password'}
          </button>
        </form>

        {/* The current password is genuinely checked, not decoration.
            Supabase's updateUser ignores it, so AuthProvider verifies it
            against a throwaway client first. Without that, anyone who found a
            signed-in laptop unattended could take the account over and lock its
            owner out — and these are shared classroom machines. */}
        <p className="mt-3 max-w-prose text-xs text-muted-foreground">
          Your current password is checked before the change is made. Changing
          it here does not sign you out of other devices.
        </p>
      </section>

      {/* --- What this page does not do ------------------------------------- */}
      <NotBuiltYet>
        <p>
          The design for this screen also shows SMS codes, a 20-minute
          auto-lock, re-verification before sensitive actions, alerts on
          sign-in from a new device, a list of active sessions, and a sign-in
          history. None of those exist yet, so they are not shown as switches
          here — a control that looks authoritative and changes nothing is
          worse than an admission on a page about whether your account is
          protected.
        </p>
      </NotBuiltYet>
    </div>
  )
}
