import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createGuardianCode,
  fetchGuardianCodes,
  queryKeys,
  revokeGuardianCode,
  type GuardianCodeRow,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { ErrorState } from './QueryState'
import FormField from './FormField'
import { showToast } from '../lib/toast'

/**
 * Giving a family access to their child — db/037.
 *
 * SCHOOL ADMINISTRATORS ONLY, and that is deliberate rather than incidental.
 * Deciding who is a child's guardian is not a classroom judgement; it is one
 * the office makes from enrolment records, and sometimes from a court order.
 * A teacher who knows the family well is still the wrong person to decide it.
 *
 * The code is shown once. Only its hash is stored, so it genuinely cannot be
 * retrieved — a lost code is reissued, never looked up.
 */

const RELATIONSHIPS = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'carer', label: 'Carer' },
  { value: 'other', label: 'Other' },
]

type Status = 'live' | 'used' | 'withdrawn' | 'expired'

function statusOf(code: GuardianCodeRow): Status {
  if (code.redeemed_at) return 'used'
  if (code.revoked_at) return 'withdrawn'
  if (new Date(code.expires_at) < new Date()) return 'expired'
  return 'live'
}

const STATUS_STYLE: Record<Status, string> = {
  live: 'bg-warning-subtle text-warning-foreground',
  used: 'bg-success-subtle text-success-foreground',
  withdrawn: 'bg-danger-subtle text-danger-foreground',
  expired: 'bg-background text-muted-foreground',
}

const STATUS_LABEL: Record<Status, string> = {
  live: 'Not used yet',
  used: 'Used — they are linked',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
}

export default function GuardianAccessSection({
  studentId,
}: {
  studentId: string
}) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [relationship, setRelationship] = useState('guardian')
  const [issued, setIssued] = useState<{
    code: string
    childName: string
    link: string
    emailSent: boolean
    emailError: string | null
    to: string
  } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const isAdmin =
    profile?.role === 'school_admin' || profile?.role === 'platform_admin'

  const codes = useQuery({
    queryKey: queryKeys.guardianCodes(studentId),
    queryFn: () => fetchGuardianCodes(studentId),
    enabled: isAdmin,
  })

  const refresh = () =>
    void queryClient.invalidateQueries({
      queryKey: queryKeys.guardianCodes(studentId),
    })

  const create = useMutation({
    mutationFn: () =>
      createGuardianCode({ studentId, email: email.trim(), relationship }),
    onSuccess: (result) => {
      // The address is included because the administrator typed it and the code
      // is bound to it — so the parent cannot be asked to remember which of
      // their addresses the school holds. Signup checks it against the code
      // before trusting it, so a tampered link falls back to being typed.
      const link =
        `${window.location.origin}/link` +
        `?code=${encodeURIComponent(result.code)}` +
        `&email=${encodeURIComponent(email.trim())}`

      setIssued({ ...result, link, to: email.trim() })
      setEmail('')
      setFormError(null)
      refresh()
    },
    onError: (error) => setFormError(error.message),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => revokeGuardianCode(id),
    onSuccess: () => {
      refresh()
      showToast('Code withdrawn. It will no longer work.')
    },
    onError: (error) => showToast(error.message),
  })

  // Not a permission check — RLS is. This only avoids rendering a form whose
  // every submission the server would refuse.
  if (!isAdmin) return null

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">Family access</h2>
      <p className="mt-1 mb-4 max-w-prose text-sm text-muted-foreground">
        Give a parent or carer their own account for this child. You name them
        and their email address; they get a code to enter once. Only that
        address can use it, so a forwarded letter is not enough on its own.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (email.trim() === '') return setFormError('Enter their email address.')
          setIssued(null)
          create.mutate()
        }}
        className="mb-5 rounded-card border border-border bg-card shadow-raised p-5"
        noValidate
      >
        {formError && (
          <p
            role="alert"
            className="mb-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
          >
            {formError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <FormField
            label="Their email address"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="parent@example.com"
          />

          <div>
            <label
              htmlFor="guardian-relationship"
              className="block text-sm font-semibold text-foreground"
            >
              Relationship
            </label>
            <select
              id="guardian-relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {create.isPending ? 'Creating…' : 'Create code'}
          </button>
        </div>

        <p className="mt-3 max-w-prose text-xs text-muted-foreground">
          Check the address against your enrolment records before you send it.
          This is the step that decides who can read this child&rsquo;s history.
        </p>
      </form>

      {issued && (
        <div
          role="status"
          className="mb-5 rounded-card border border-success bg-success-subtle p-5"
        >
          <p className="font-semibold text-success-foreground">
            Code for {issued.childName}. Copy it now — it is not shown again.
          </p>
          {/* Whether it SENT, not whether it was tried. A family waiting for
              an email that never left is a family who cannot reach their
              child's record and does not know why. */}
          <p className="mt-1 text-sm text-success-foreground">
            {issued.emailSent
              ? `Emailed to ${issued.to}.`
              : 'No email was sent — pass this on the way you normally contact this family.'}{' '}
            It expires in 30 days and works once.
          </p>

          {!issued.emailSent && issued.emailError && (
            <p className="mt-2 text-xs text-success-foreground opacity-90">
              Reason: {issued.emailError}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="rounded-btn border border-border bg-card px-4 py-3 font-mono text-xl tracking-widest text-foreground">
              {issued.code}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(issued.code)
                  .then(() => showToast('Code copied.'))
                  .catch(() => showToast('Could not copy — select it and copy manually.'))
              }}
              className="rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-primary"
            >
              Copy code
            </button>
            {/* A LINK, NOT JUST A CODE. On its own a code leaves a parent to
                work out where to take it, and the answer is an app they have
                never heard of. The link carries the code and the address, so
                the only thing they have to invent is a password. */}
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(issued.link)
                  .then(() => showToast('Link copied — paste it into your email.'))
                  .catch(() => showToast('Could not copy.'))
              }}
              className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Copy sign-up link
            </button>
          </div>

          <input
            readOnly
            value={issued.link}
            aria-label="Sign-up link for the family"
            onFocus={(e) => e.currentTarget.select()}
            className="mt-3 w-full rounded-btn border border-border bg-card px-3 py-2 font-mono text-xs text-foreground"
          />

          <p className="mt-2 text-xs text-success-foreground">
            The link fills in the code and their email address for them. Send
            the code as well if you would rather read it out over the phone.
          </p>
        </div>
      )}

      {codes.isError && <ErrorState message={codes.error.message} />}

      {codes.isSuccess && codes.data.length > 0 && (
        <ul className="space-y-2">
          {codes.data.map((code) => {
            const status = statusOf(code)
            return (
              <li
                key={code.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card shadow-raised p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {code.guardian_email}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {code.relationship} · issued{' '}
                    {new Date(code.issued_at).toLocaleDateString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                    })}
                    {/* Failed attempts are worth surfacing: somebody trying a
                        code with the wrong account is either confused or
                        should not have it, and both deserve a look. */}
                    {code.attempts > 0 &&
                      ` · ${code.attempts} failed attempt${code.attempts === 1 ? '' : 's'}`}
                  </p>
                </div>

                <span
                  className={`rounded-btn px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}
                >
                  {STATUS_LABEL[status]}
                </span>

                {status === 'live' && (
                  <button
                    type="button"
                    onClick={() => revoke.mutate(code.id)}
                    disabled={revoke.isPending}
                    className="ml-auto text-sm font-semibold text-danger-foreground underline disabled:opacity-60"
                  >
                    Withdraw
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
