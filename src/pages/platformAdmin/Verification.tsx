import { useRef, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { fetchStaffPage, queryKeys, setStaffVerified } from '../../lib/api'
import Pagination from '../../components/Pagination'
import { adminResetMfa, fetchStaffMfaStatus } from '../../lib/mfa'
import { ROLE_CONFIG } from '../../lib/roles'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import { showToast } from '../../lib/toast'

/**
 * Teacher verification (FR18).
 *
 * `profiles.is_verified` cannot be written from a browser: db/004 revoked
 * UPDATE on profiles and granted back only first_name and last_name, so nobody
 * can verify themselves. This page calls a database function that checks the
 * caller is a Platform Admin.
 *
 * What this screen does NOT claim: it does not check a Working With Children
 * Check, or read an uploaded ID. Those are real-world processes done outside
 * the software. Verifying here records that a Platform Admin has completed
 * them — the button is the attestation, not the check.
 */
export default function Verification() {
  const queryClient = useQueryClient()

  /**
   * TWO PAGED QUERIES, not one list split in the browser.
   *
   * This screen used to fetch every staff member and call `.filter()` twice.
   * That is correct only while the fetch holds everybody, and PostgREST stops
   * at a thousand without saying so — at two hundred schools the heading
   * "Awaiting verification (N)" would have quietly understated the queue.
   *
   * Each query now carries its own true total from the database.
   */
  const [waitingPage, setWaitingPage] = useState(0)
  const [verifiedPage, setVerifiedPage] = useState(0)
  const waitingTop = useRef<HTMLHeadingElement>(null)
  const verifiedTop = useRef<HTMLHeadingElement>(null)

  const waiting = useQuery({
    queryKey: [...queryKeys.allStaff, 'unverified', waitingPage],
    queryFn: () => fetchStaffPage(false, waitingPage),
    placeholderData: keepPreviousData,
  })

  const verified = useQuery({
    queryKey: [...queryKeys.allStaff, 'verified', verifiedPage],
    queryFn: () => fetchStaffPage(true, verifiedPage),
    placeholderData: keepPreviousData,
  })

  // Who actually has an authenticator. Without this the reset button looked
  // the same before and after use, and the same for someone who never had 2FA.
  const mfa = useQuery({
    queryKey: ['staff-mfa-status'],
    queryFn: fetchStaffMfaStatus,
  })

  const verify = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      setStaffVerified(id, verified),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.allStaff }),
  })

  // Which person is showing "are you sure". Resetting somebody's second factor
  // on a mis-click leaves them with a password-only account until they notice.
  const [confirmingReset, setConfirmingReset] = useState<string | null>(null)

  const resetMfa = useMutation({
    mutationFn: (id: string) => adminResetMfa(id),
    onSuccess: (result) => {
      setConfirmingReset(null)
      showToast(
        result.removed > 0
          ? `Two-factor cleared for ${result.name}. They must set it up again.`
          : `${result.name} had no authenticator. Their recovery codes were cleared.`,
      )
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminAudit })
      // The whole point of the fix: the badge must change straight away.
      void queryClient.invalidateQueries({ queryKey: ['staff-mfa-status'] })
    },
  })

  if (waiting.isPending || verified.isPending) return <LoadingCards count={3} />
  if (waiting.isError) return <ErrorState message={waiting.error.message} />
  if (verified.isError) return <ErrorState message={verified.error.message} />

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">
          Teacher verification
        </h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Staff who have not been verified can sign in, but see a banner telling
          them their account is awaiting verification.
        </p>
      </header>

      <div
        className="mb-6 rounded-card border border-warning bg-warning-subtle p-4"
        role="note"
      >
        <p className="text-sm font-semibold text-warning-foreground">
          This button is an attestation, not a check
        </p>
        <p className="mt-1 text-sm text-warning-foreground">
          MiZanova does not read a Working With Children Check or validate ID
          documents. Verify someone only once you have completed your
          organisation&rsquo;s real checks. Your name is recorded against it.
        </p>
      </div>

      {verify.isError && (
        <p role="alert" className="mb-4 text-sm font-medium text-danger-foreground">
          {verify.error.message}
        </p>
      )}

      <h2
        ref={waitingTop}
        className="mb-3 scroll-mt-6 text-lg font-semibold text-foreground"
      >
        Awaiting verification ({waiting.data.total})
      </h2>

      {waiting.data.total === 0 ? (
        <EmptyState
          title="Nobody waiting"
          detail="New educators and specialists appear here as soon as they sign up."
        />
      ) : (
        <ul className="space-y-3">
          {waiting.data.rows.map((person) => (
            <li
              key={person.id}
              className="rounded-card border border-border bg-card shadow-raised p-4 sm:flex sm:items-center sm:gap-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  {person.full_name || 'Unnamed'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {ROLE_CONFIG[person.role].label}
                  {person.email && ` · ${person.email}`}
                  {!person.school_id && ' · no school assigned'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => verify.mutate({ id: person.id, verified: true })}
                disabled={verify.isPending}
                className="mt-3 w-full rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60 sm:mt-0 sm:ml-auto sm:w-auto"
              >
                Verify
              </button>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={waiting.data}
        onChange={setWaitingPage}
        label="waiting"
        anchor={waitingTop}
        busy={waiting.isPlaceholderData}
      />

      <h2
        ref={verifiedTop}
        className="mt-10 mb-3 scroll-mt-6 text-lg font-semibold text-foreground"
      >
        Verified ({verified.data.total})
      </h2>

      {verified.data.total === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody verified yet.</p>
      ) : (
        <ul className="space-y-2">
          {verified.data.rows.map((person) => (
            <li
              key={person.id}
              className="rounded-card border border-border bg-card shadow-raised p-4 sm:flex sm:items-center sm:gap-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  {person.full_name || 'Unnamed'}
                  <span className="ml-2 text-sm font-medium text-success-foreground">
                    ✓ verified
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {ROLE_CONFIG[person.role].label}
                  {person.email && ` · ${person.email}`}
                </p>
                <p className="mt-1 text-sm">
                  {mfa.isPending ? (
                    <span className="text-muted-foreground">
                      Checking two-factor…
                    </span>
                  ) : mfa.data?.[person.id]?.hasAuthenticator ? (
                    <span className="font-medium text-success-foreground">
                      🔒 Two-factor on ·{' '}
                      {mfa.data[person.id].codesRemaining} recovery code
                      {mfa.data[person.id].codesRemaining === 1 ? '' : 's'} left
                    </span>
                  ) : (
                    <span className="font-medium text-warning-foreground">
                      Two-factor off — they cannot open student records until
                      they set it up
                    </span>
                  )}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 sm:mt-0 sm:ml-auto">
                {confirmingReset === person.id ? (
                  <div className="w-full rounded-card border border-danger bg-danger-subtle p-3">
                    <p className="max-w-prose text-sm font-semibold text-danger-foreground">
                      Clear two-factor for {person.full_name || 'this person'}?
                    </p>
                    <p className="mt-1 max-w-prose text-sm text-danger-foreground">
                      Their authenticator and all ten recovery codes stop
                      working immediately, and they cannot open any student
                      record until they enrol again. Only do this once you are
                      certain who you are talking to — this is exactly the
                      request an attacker would make.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => resetMfa.mutate(person.id)}
                        disabled={resetMfa.isPending}
                        className="rounded-btn bg-danger-strong px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {resetMfa.isPending ? 'Clearing…' : 'Yes, clear it'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingReset(null)}
                        className="rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // Only offered where there is something to clear. Showing it
                  // against an account with no authenticator invited a press
                  // that did nothing visible, which is how the button ended up
                  // looking broken.
                  mfa.data?.[person.id]?.hasAuthenticator && (
                    <button
                      type="button"
                      onClick={() => setConfirmingReset(person.id)}
                      className="rounded-btn border border-danger px-3 py-2 text-sm font-medium text-danger-foreground"
                    >
                      Reset 2FA
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() =>
                    verify.mutate({ id: person.id, verified: false })
                  }
                  disabled={verify.isPending}
                  className="rounded-btn border border-border px-3 py-2 text-sm font-medium text-muted-foreground disabled:opacity-60"
                >
                  Withdraw verification
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={verified.data}
        onChange={setVerifiedPage}
        label="verified"
        anchor={verifiedTop}
        busy={verified.isPlaceholderData}
      />

      {resetMfa.isError && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger-foreground">
          {resetMfa.error.message}
        </p>
      )}

      <p className="mt-6 max-w-prose text-xs text-muted-foreground">
        Resetting two-factor authentication is recorded in the audit log with
        your name against it. Use it only when someone has lost both their phone
        and their recovery codes — a recovery code is the route that does not
        need you.
      </p>
    </div>
  )
}
