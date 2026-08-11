import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createInvitation,
  fetchInvitations,
  queryKeys,
  revokeInvitation,
  type InvitationRow,
} from '../lib/api'
import { ROLE_CONFIG } from '../lib/roles'
import { EmptyState, ErrorState } from './QueryState'
import FormField from './FormField'
import { showToast } from '../lib/toast'

/**
 * Inviting staff — db/035.
 *
 * The alternative, which is what happened before this existed, is that every
 * teacher signs up claiming a school and an administrator tries to work out
 * which of forty pending strangers actually works there. An invitation reverses
 * that: the administrator says who works here first, and the account arrives
 * already attached and already verified.
 *
 * EMAIL IS AN ENHANCEMENT, NOT THE MECHANISM. The link is shown once either
 * way, and the screen says whether a message actually went — never that one was
 * attempted. If the provider refused, the administrator has to know to pass the
 * link on themselves; an invitation that silently never arrives is a teacher
 * waiting for an email that does not exist.
 *
 * Plenty of schools would rather send it through their own system than have a
 * supplier email their staff, so the copy-the-link path is not a stopgap.
 */

type Status = 'pending' | 'accepted' | 'withdrawn' | 'expired'

function statusOf(invitation: InvitationRow): Status {
  if (invitation.accepted_at) return 'accepted'
  if (invitation.revoked_at) return 'withdrawn'
  if (new Date(invitation.expires_at) < new Date()) return 'expired'
  return 'pending'
}

const STATUS_STYLE: Record<Status, string> = {
  pending: 'bg-warning-subtle text-warning-foreground',
  accepted: 'bg-success-subtle text-success-foreground',
  withdrawn: 'bg-danger-subtle text-danger-foreground',
  expired: 'bg-background text-muted-foreground',
}

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Waiting to be accepted',
  accepted: 'Accepted',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
}

export default function InviteStaffSection({
  /**
   * Which school to invite into. Omitted by a school administrator, whose own
   * school is the only possible answer and is taken from their account by the
   * server — never from the browser, or an admin at one school could invite
   * staff into another by changing a value.
   *
   * A PLATFORM ADMIN MUST PASS IT. They have no school of their own, and the
   * server refuses the request without one.
   */
  schoolId,
  /** Named in the copy, so nobody invites a principal into the wrong school. */
  schoolName,
}: {
  schoolId?: string
  schoolName?: string
} = {}) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'educator' | 'specialist' | 'school_admin'>(
    'educator',
  )
  const [issued, setIssued] = useState<{
    acceptUrl: string
    emailSent: boolean
    emailError: string | null
    to: string
  } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const invitations = useQuery({
    queryKey: schoolId
      ? [...queryKeys.invitations, schoolId]
      : queryKeys.invitations,
    queryFn: () => fetchInvitations(schoolId),
  })

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.invitations })

  const create = useMutation({
    mutationFn: () => createInvitation({ email: email.trim(), role, schoolId }),
    onSuccess: (result) => {
      setIssued({ ...result, to: email.trim() })
      setEmail('')
      setFormError(null)
      refresh()
    },
    onError: (error) => setFormError(error.message),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: () => {
      refresh()
      showToast('Invitation withdrawn. That link no longer works.')
    },
    onError: (error) => showToast(error.message),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (email.trim() === '') return setFormError('Enter their email address.')
    setIssued(null)
    create.mutate()
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">
        {schoolName ? `Invite somebody to ${schoolName}` : 'Invite staff'}
      </h2>
      <p className="mt-1 mb-4 max-w-prose text-sm text-muted-foreground">
        An invited account arrives already attached to
        {schoolName ? ` ${schoolName}` : ' this school'} and already verified,
        because you are the one confirming they work there. They will not have
        to wait in a queue.
        {schoolName && (
          <>
            {' '}
            A school with no administrator yet needs one invited here first —
            after that, they can invite their own staff.
          </>
        )}
      </p>

      <form
        onSubmit={submit}
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
            label="Their work email address"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="j.smith@school.nsw.edu.au"
          />

          <div>
            <label
              htmlFor="invite-role"
              className="block text-sm font-semibold text-foreground"
            >
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as 'educator' | 'specialist' | 'school_admin')
              }
              className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
            >
              <option value="educator">{ROLE_CONFIG.educator.label}</option>
              <option value="specialist">{ROLE_CONFIG.specialist.label}</option>
              <option value="school_admin">{ROLE_CONFIG.school_admin.label}</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {create.isPending ? 'Creating…' : 'Create invitation'}
          </button>
        </div>

        <p className="mt-3 max-w-prose text-xs text-muted-foreground">
          The address matters: the invitation can only be accepted by someone
          signed in with it. Inviting a School Admin gives them everything you
          can do, including inviting others.
        </p>
      </form>

      {/* SHOWN ONCE. The token is stored hashed, so it genuinely cannot be
          retrieved again — a lost invitation is reissued, not recovered. */}
      {issued && (
        <div
          role="status"
          className="mb-5 rounded-card border border-success bg-success-subtle p-5"
        >
          <p className="font-semibold text-success-foreground">
            Invitation created. Copy this link now — it is not shown again.
          </p>

          {/* SAYS WHETHER IT ACTUALLY SENT, never that it was attempted. If the
              provider refused, the administrator has to know to pass the link
              on themselves — an invitation that silently never arrives is a
              teacher waiting for an email that does not exist. */}
          <p className="mt-1 text-sm text-success-foreground">
            {issued.emailSent
              ? `Emailed to ${issued.to}. The link below is the same one, if they need it again.`
              : 'No email was sent — send this the way your school normally contacts staff.'}{' '}
            It expires in 14 days.
          </p>

          {!issued.emailSent && issued.emailError && (
            <p className="mt-2 text-xs text-success-foreground opacity-90">
              Reason: {issued.emailError}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              readOnly
              value={issued.acceptUrl}
              aria-label="Invitation link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-btn border border-border bg-card px-3 py-2 font-mono text-sm text-foreground"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(issued.acceptUrl)
                  .then(() => showToast('Link copied.'))
                  .catch(() => showToast('Could not copy — select it and copy manually.'))
              }}
              className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {invitations.isError && <ErrorState message={invitations.error.message} />}

      {invitations.isSuccess && invitations.data.length === 0 && (
        <EmptyState
          title="No invitations yet"
          detail="Invited staff appear here with whether they have accepted."
        />
      )}

      {invitations.isSuccess && invitations.data.length > 0 && (
        <ul className="space-y-2">
          {invitations.data.map((invitation) => {
            const status = statusOf(invitation)
            return (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card shadow-raised p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{invitation.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {ROLE_CONFIG[invitation.role].label} · invited{' '}
                    {new Date(invitation.created_at).toLocaleDateString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>

                <span
                  className={`rounded-btn px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}
                >
                  {STATUS_LABEL[status]}
                </span>

                {status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => revoke.mutate(invitation.id)}
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
