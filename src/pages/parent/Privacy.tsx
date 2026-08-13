import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchConsents,
  grantConsent,
  queryKeys,
  revokeConsent,
  PRIVACY_NOTICE_VERSION,
  type ConsentRow,
  type ConsentType,
} from '../../lib/api'
import { CONSENT_COPY, CONSENT_ORDER } from '../../lib/consent'
import { useSelectedChild } from '../../hooks/useMyChildren'
import ChildSwitcher from '../../components/ChildSwitcher'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import NoChildYet from '../../components/NoChildYet'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Privacy & Consent — FR25.
 *
 * Before this screen existed the `consents` table was real, the AI pipeline
 * genuinely refused to run without a row in it, and no human being could
 * create or withdraw one. The guarantee was enforced and unreachable at the
 * same time.
 *
 * Two rules shape everything below:
 *
 *  1. Consent must be INFORMED. Each item says what it permits and what
 *     actually changes if it is withdrawn, before the button is offered.
 *  2. Only one of the five changes what the software does. Presenting all five
 *     as working switches would mislead the one person this screen exists to
 *     protect, so the other four are labelled as records.
 */
export default function Privacy() {
  const queryClient = useQueryClient()
  const { children, child, selectChild, isPending: childrenPending } =
    useSelectedChild()

  const consents = useQuery({
    queryKey: queryKeys.consents(child?.id ?? ''),
    queryFn: () => fetchConsents(child!.id),
    enabled: Boolean(child),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.consents(child!.id) })

  const grant = useMutation({
    mutationFn: (consentType: ConsentType) =>
      grantConsent({ studentId: child!.id, consentType }),
    onSuccess: invalidate,
  })

  const revoke = useMutation({
    mutationFn: (consentId: string) => revokeConsent(consentId),
    onSuccess: invalidate,
  })

  // Which item is showing its "are you sure" step. Withdrawing consent is not
  // a thing to do on a mis-tap, and for the AI item it takes effect instantly.
  const [confirming, setConfirming] = useState<string | null>(null)

  if (childrenPending) return <LoadingCards count={2} />

  if (!child) {
    return (
      <NoChildYet thing="Your privacy and consent choices" />
    )
  }

  const rows = consents.data ?? []
  const activeFor = (type: ConsentType): ConsentRow | undefined =>
    rows.find((r) => r.consent_type === type && r.revoked_at === null)
  const historyFor = (type: ConsentType): ConsentRow[] =>
    rows.filter((r) => r.consent_type === type && r.revoked_at !== null)

  const busy = grant.isPending || revoke.isPending
  const failure = grant.error ?? revoke.error

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">
          Privacy &amp; Consent
        </h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          What you have agreed to for {child.display_name}, and how to change
          it. You can withdraw any of these at any time.
        </p>
      </header>

      <ChildSwitcher children={children} child={child} onSelect={selectChild} />


      {consents.isPending && <LoadingCards count={3} />}
      {consents.isError && (
        <ErrorState
          message={consents.error.message}
          onRetry={() => void consents.refetch()}
        />
      )}

      {failure && (
        <p
          role="alert"
          className="mb-4 rounded-card border border-danger bg-danger-subtle p-4 text-sm text-danger-foreground"
        >
          {failure.message}
        </p>
      )}

      {consents.isSuccess && (
        <ul className="space-y-4">
          {CONSENT_ORDER.map((type) => {
            const copy = CONSENT_COPY[type]
            const active = activeFor(type)
            const past = historyFor(type)
            const isConfirming = confirming === type

            return (
              <li
                key={type}
                className="rounded-card border border-border bg-card shadow-raised p-5"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-foreground">{copy.label}</h2>
                    {!copy.enforced && (
                      // Said plainly, next to the thing it qualifies. Burying
                      // it in a footnote would be the same omission.
                      <p className="mt-1 text-xs font-semibold text-muted-foreground uppercase">
                        Recorded for the school — not enforced by this software
                      </p>
                    )}
                  </div>

                  {active ? (
                    <span className="rounded-btn bg-success-subtle px-3 py-1.5 text-sm font-semibold text-success-foreground">
                      ✓ Given {formatDate(active.granted_at)}
                    </span>
                  ) : (
                    <span className="rounded-btn bg-background px-3 py-1.5 text-sm font-semibold text-muted-foreground">
                      Not given
                    </span>
                  )}
                </div>

                <p className="mt-3 max-w-prose text-sm text-foreground">
                  {copy.allows}
                </p>

                <div className="mt-4 border-t border-border pt-4">
                  {active ? (
                    isConfirming ? (
                      <div className="rounded-card bg-warning-subtle p-4">
                        <p className="max-w-prose text-sm font-semibold text-warning-foreground">
                          If you withdraw this: {copy.ifWithdrawn}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              revoke.mutate(active.id, {
                                onSuccess: () => setConfirming(null),
                              })
                            }}
                            className="rounded-btn bg-danger-strong px-4 py-2.5 font-semibold text-white disabled:opacity-60"
                          >
                            {busy ? 'Withdrawing…' : 'Yes, withdraw consent'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            className="rounded-btn border border-border px-4 py-2.5 font-semibold text-foreground"
                          >
                            Keep it
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(type)}
                        className="rounded-btn border border-danger px-4 py-2.5 text-sm font-semibold text-danger-foreground"
                      >
                        Withdraw consent
                      </button>
                    )
                  ) : (
                    <>
                      <p className="mb-3 max-w-prose text-sm text-muted-foreground">
                        {past.length > 0
                          ? `You withdrew this on ${formatDate(past[0].revoked_at!)}. You can give it again.`
                          : 'You have not given this consent.'}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => grant.mutate(type)}
                        className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        {busy ? 'Saving…' : 'I give consent'}
                      </button>
                    </>
                  )}
                </div>

                {/* Withdrawn consents are kept, and shown. A parent should be
                    able to see their own history without asking the school. */}
                {past.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      History ({past.length})
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {past.map((row) => (
                        <li key={row.id} className="text-sm text-muted-foreground">
                          Given {formatDate(row.granted_at)} · withdrawn{' '}
                          {formatDate(row.revoked_at!)} · notice{' '}
                          {row.policy_version}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-6 max-w-prose text-xs text-muted-foreground">
        Every consent above is stored with the date, your account, and the
        version of the privacy notice you were shown (currently{' '}
        {PRIVACY_NOTICE_VERSION}). Withdrawing does not erase the record that it
        was once given — that history is what lets the school demonstrate it
        acted on your decision.
      </p>
    </div>
  )
}
