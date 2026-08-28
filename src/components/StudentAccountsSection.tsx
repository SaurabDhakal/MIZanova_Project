import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createInvitation,
  fetchStudentAccounts,
  queryKeys,
  type StudentAccount,
} from '../lib/api'
import { ErrorState, LoadingCards } from './QueryState'
import { showToast } from '../lib/toast'

/**
 * Giving a student their own sign-in — db/076.
 *
 * ---------------------------------------------------------------------------
 * THE SCREEN SHOWS TWO LOCKS, BECAUSE THERE ARE TWO
 * ---------------------------------------------------------------------------
 * db/074 opens a student account only when the school has linked one AND a
 * guardian has granted `student_portal_access`. This section is where the
 * school turns its key, and it can turn only its own.
 *
 * Showing both states side by side is the whole design. An administrator who
 * sends an invitation and sees "waiting for the family" understands why the
 * child says the site is empty; one who sees only "invited" would raise a
 * support ticket about a bug that is not one.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE CAN GRANT THE CONSENT
 * ---------------------------------------------------------------------------
 * There is deliberately no "mark as consented" button. A school ticking a box
 * on a family's behalf is exactly the failure the second key exists to prevent,
 * and it would be a single click away from making the whole double lock
 * decorative. The family grants it on their own Privacy & Consent screen and
 * nowhere else.
 */

function KeyState({ student }: { student: StudentAccount }) {
  const linked = student.profile_id !== null

  /*
   * Four states, and each says what to DO rather than what is true. "No
   * account" is a fact; "invite them" is a next step, and this screen is a
   * queue rather than a report.
   */
  if (linked && student.hasConsent) {
    return (
      <span className="rounded-btn bg-success-subtle px-2 py-1 text-xs font-semibold text-success-foreground">
        Signed in and working
      </span>
    )
  }
  if (linked && !student.hasConsent) {
    return (
      <span className="rounded-btn bg-warning-subtle px-2 py-1 text-xs font-semibold text-warning-foreground">
        Waiting for the family to agree
      </span>
    )
  }
  if (student.invitePending) {
    return (
      /* ISSUED, not "sent". Whether the email actually left is known only in
         the response to the request that created it — the server returns
         `emailSent`, and nothing persists it. A row rendered from the database
         a day later cannot tell a delivered invitation from one the mail
         provider refused, and the overview has a `mail.invitation_not_sent`
         event proving that is not hypothetical. */
      <span className="rounded-btn bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
        Invitation issued, not used yet
      </span>
    )
  }
  return (
    <span className="rounded-btn bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
      No account
    </span>
  )
}

export default function StudentAccountsSection() {
  const queryClient = useQueryClient()
  const [inviting, setInviting] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const students = useQuery({
    queryKey: queryKeys.studentAccounts,
    queryFn: fetchStudentAccounts,
  })

  const invite = useMutation({
    mutationFn: (studentId: string) =>
      createInvitation({ email: email.trim(), role: 'student', studentId }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentAccounts })
      setLink(result.acceptUrl)
      setEmail('')
      setInviting(null)
      setError(null)
      showToast(
        result.emailSent
          ? 'Invitation sent.'
          : 'Invitation created. Email did not send — pass the link on yourself.',
        result.emailSent ? undefined : 'error',
      )
    },
    onError: (e) => setError(e.message),
  })

  if (students.isPending) return <LoadingCards count={2} />
  if (students.isError) {
    return (
      <ErrorState
        message={students.error.message}
        onRetry={() => void students.refetch()}
      />
    )
  }

  const withAccounts = students.data.filter(
    (s) => s.profile_id !== null || s.invitePending,
  )
  const without = students.data.filter(
    (s) => s.profile_id === null && !s.invitePending,
  )

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">
        Student sign-ins
      </h2>
      <p className="mt-1 mb-4 max-w-prose text-sm text-muted-foreground">
        An older student can have their own account to see the goals they are
        working on. They never see behaviour notes, safeguarding records, plan
        documents or anything about another child. Two things have to happen:
        you invite them, and a guardian agrees on their Privacy &amp; Consent
        screen.
      </p>

      {/*
        SHOWN ONCE, LIKE THE STAFF INVITATION. db/035 stores the token hashed,
        so this link cannot be recovered from the database afterwards — an
        administrator who loses it has to reissue rather than look it up.
      */}
      {link && (
        <div className="mb-4 rounded-card border border-success bg-success-subtle p-4">
          <p className="text-sm font-semibold text-success-foreground">
            Their sign-up link — copy it now, it is not shown again.
          </p>
          <code className="mt-2 block break-all text-xs text-success-foreground">
            {link}
          </code>
          <button
            type="button"
            onClick={() => setLink(null)}
            className="mt-3 rounded-btn border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground"
          >
            Done
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
        >
          {error}
        </p>
      )}

      {withAccounts.length > 0 && (
        <ul className="mb-6 space-y-2">
          {withAccounts.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-3"
            >
              <span className="font-medium text-foreground">
                {s.display_name}
              </span>
              <span className="ml-auto">
                <KeyState student={s} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {without.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Every active student has been invited.
        </p>
      ) : (
        <ul className="space-y-2">
          {without.map((s) => (
            <li
              key={s.id}
              className="rounded-card border border-border bg-card p-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium text-foreground">
                  {s.display_name}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <KeyState student={s} />
                  <button
                    type="button"
                    onClick={() => {
                      setInviting(inviting === s.id ? null : s.id)
                      setError(null)
                    }}
                    className="rounded-btn border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground"
                  >
                    {inviting === s.id ? 'Cancel' : 'Invite'}
                  </button>
                </span>
              </div>

              {inviting === s.id && (
                <form
                  className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (email.trim() === '')
                      return setError('Enter the address they will sign in with.')
                    setError(null)
                    invite.mutate(s.id)
                  }}
                >
                  <div className="min-w-56 flex-1">
                    <label
                      htmlFor={`student-email-${s.id}`}
                      className="block text-sm font-medium text-foreground"
                    >
                      Their email address
                    </label>
                    <input
                      id={`student-email-${s.id}`}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@school.edu.au"
                      className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                    />
                    {/* Said here because it decides whether this feature is
                        usable at all: most Australian schools issue student
                        addresses, and a child without one cannot be invited by
                        this route. Better to say so than to have somebody type
                        a parent's address and give the family two logins. */}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Their own school address, not a parent&rsquo;s.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={invite.isPending}
                    className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {invite.isPending ? 'Sending…' : 'Send the invitation'}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 max-w-prose text-xs text-muted-foreground">
        There is no way to agree on a family&rsquo;s behalf from this screen, and
        that is deliberate — a guardian grants it themselves and can withdraw it
        at any time, which closes the child&rsquo;s sign-in immediately. Whether
        a particular student should have an account is a judgement for you and
        their family together; nothing here decides it by age.
      </p>
    </section>
  )
}
