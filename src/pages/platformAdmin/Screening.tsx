import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PROFESSIONS,
  SCREENING_LABEL,
  WWCC_STATES,
  endScreening,
  fetchApprovedWithoutScreening,
  fetchScreening,
  queryKeys,
  recordScreening,
  remindAboutScreening,
  type ScreeningCheck,
  type ScreeningRow,
  type ScreeningState,
} from '../../lib/api'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import { showToast } from '../../lib/toast'
import PageHeader from '../../components/PageHeader'

/**
 * Screening — the thing that goes looking, so nobody has to remember to.
 *
 * db/047 records that a check was verified on a day. Checks expire and checks
 * are revoked, so approval is a statement about the past. This screen is what
 * makes the present visible.
 *
 * ORDERED BY DAYS REMAINING, ASCENDING, AND NOT FILTERABLE. Every other queue
 * in this product opens on a tab; this one deliberately does not, because the
 * only useful order for a safeguarding list is "worst first" and a filter is a
 * way to look at a subset and feel finished.
 *
 * THE MISSING ONES COME FIRST. A screen listing expiring checks answers
 * "whose is running out?" and silently omits "whose do we not hold at all?" —
 * which is the more urgent question, because there is nothing to expire. That
 * section is at the top for that reason, not because it is more common.
 *
 * IT REVOKES NOTHING. An expired check does not end a membership or remove an
 * assignment here — see db/048 for the argument, briefly: cutting a clinician
 * off from their caseload because a date passed would most often mean somebody
 * renewed and has not told us, and the cost of being wrong is a child's therapy
 * stopping mid-term. Whether it should is a policy question for Special Miles,
 * recorded in doc 13.
 */

const STATE_STYLE: Record<ScreeningState, string> = {
  // Unknown is styled as danger, not as a neutral note. A check with no expiry
  // cannot be trusted at all, where an expired one at least says what happened
  // and when — see db/051.
  unknown: 'bg-danger-subtle text-danger-foreground',
  expired: 'bg-danger-subtle text-danger-foreground',
  expiring: 'bg-warning-subtle text-warning-foreground',
  valid: 'bg-success-subtle text-success-foreground',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Plain words. "-12 days remaining" is arithmetic, not a warning. */
function howLong(days: number | null): string {
  // Never guessed at, never rendered as a number. db/051 exists because this
  // software once invented a date here and showed it as a record.
  if (days === null) return 'no expiry recorded'
  if (days < 0) {
    const gone = Math.abs(days)
    return `expired ${gone} day${gone === 1 ? '' : 's'} ago`
  }
  if (days === 0) return 'expires today'
  if (days === 1) return 'expires tomorrow'
  return `${days} days left`
}

function RenewalForm({
  email,
  checkType,
  onDone,
}: {
  email: string
  checkType: ScreeningCheck
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [number, setNumber] = useState('')
  const [state, setState] = useState('NSW')
  const [expiresOn, setExpiresOn] = useState('')

  const save = useMutation({
    mutationFn: () =>
      recordScreening({ email, checkType, state, number, expiresOn }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['screening'] })
      showToast('Recorded. The previous one has been superseded.')
      onDone()
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  return (
    <form
      className="mt-3 rounded-btn border border-border bg-background p-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <p className="text-sm font-semibold text-foreground">
        Record a new {SCREENING_LABEL[checkType]}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Verify it at the source first. Saving supersedes the current one — the
        old record is kept, not overwritten.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {checkType === 'wwcc' && (
          <div>
            <label
              htmlFor={`state-${email}`}
              className="block text-xs font-semibold text-foreground"
            >
              State
            </label>
            <select
              id={`state-${email}`}
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              {WWCC_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label
            htmlFor={`number-${email}`}
            className="block text-xs font-semibold text-foreground"
          >
            Number
          </label>
          <input
            id={`number-${email}`}
            required
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
          />
        </div>

        <div>
          <label
            htmlFor={`expiry-${email}`}
            className="block text-xs font-semibold text-foreground"
          >
            Expires
          </label>
          <input
            id={`expiry-${email}`}
            type="date"
            required
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : 'Record it'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

/**
 * ONE CARD PER PERSON, NOT PER DOCUMENT.
 *
 * This listed a row per check, so somebody holding a WWCC and an NDIS check
 * appeared twice with the same name and the same address and two identical
 * sets of buttons. Saurab called it bad design and it is: the reader's
 * question is "is this person cleared?", and the answer was split across two
 * cards that had to be found and mentally rejoined.
 *
 * The person is the heading. Each check they hold is a line inside it, with
 * the actions that belong to THAT check next to it — so "Record a renewal"
 * can no longer be pressed without it being obvious which document it renews.
 */
function CheckRow({ check }: { check: ScreeningRow }) {
  const queryClient = useQueryClient()
  const [renewing, setRenewing] = useState(false)

  /*
   * THE ONE PERSON WHO CAN ACTUALLY FIX THIS is the one holding the check, and
   * before db/050 nothing in the product ever contacted them — every
   * notification pointed at Special Miles. A reviewer had to leave, find the
   * address and write it themselves, which is the step that does not happen on
   * a Friday afternoon.
   */
  const remind = useMutation({
    mutationFn: () => remindAboutScreening(check.id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['screening'] })
      showToast(
        result.recorded
          ? `Asked ${check.full_name ?? check.email} to renew.`
          : 'The email sent, but recording it did not. Do not send it again.',
        result.recorded ? 'success' : 'error',
      )
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  const revoke = useMutation({
    mutationFn: () => endScreening(check.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['screening'] })
      showToast('Marked as no longer held.')
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  return (
    <li className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="font-semibold text-foreground">
          {SCREENING_LABEL[check.check_type]}
          {check.state && ` · ${check.state}`}
        </h4>
        <span
          className={`rounded-btn px-2.5 py-0.5 text-xs font-semibold uppercase ${STATE_STYLE[check.state_of_check]}`}
        >
          {howLong(check.days_remaining)}
        </span>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        <span className="font-mono">{check.number}</span> ·{' '}
        {check.expires_on ? (
          <>expires {formatDate(check.expires_on)}</>
        ) : (
          <span className="font-semibold text-danger-foreground">
            nobody has told us when this expires
          </span>
        )}
      </p>

      {renewing ? (
        <RenewalForm
          email={check.email}
          checkType={check.check_type}
          onDone={() => setRenewing(false)}
        />
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRenewing(true)}
            className="rounded-btn bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
          >
            Record a renewal
          </button>
          {/* Only where there is something to chase. Asking somebody to renew
              a check with two years left is how a real warning becomes
              something people filter out. */}
          {check.state_of_check !== 'valid' && (
            <button
              type="button"
              disabled={remind.isPending}
              onClick={() => remind.mutate()}
              className="rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
            >
              {remind.isPending ? 'Sending…' : 'Ask them to renew'}
            </button>
          )}
          <button
            type="button"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate()}
            className="rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
          >
            No longer held
          </button>
          {/* What the button is for, in the page rather than in a tooltip. A
              title attribute is invisible on touch and never read aloud when
              the control is disabled. */}
          <span className="basis-full text-xs text-muted-foreground">
            &ldquo;No longer held&rdquo; is for a check that was revoked or
            withdrawn before its expiry date.
          </span>

          {/* "Have we already asked them?" is the first thing a reviewer needs
              and the one thing a fire-and-forget button cannot answer. */}
          {check.state_of_check !== 'valid' && (
            <span className="text-xs text-muted-foreground">
              {check.last_reminded_at
                ? `asked ${formatDate(check.last_reminded_at)}`
                : 'not asked yet'}
            </span>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Everything one person holds, together.
 *
 * The worst state among their checks decides the border and the ordering, so a
 * person with one perfect WWCC and one check with no expiry does not read as
 * fine at a glance.
 */
function PersonCard({ checks }: { checks: ScreeningRow[] }) {
  const worst = checks.some((c) => c.state_of_check === 'unknown')
    ? 'unknown'
    : checks.some((c) => c.state_of_check === 'expired')
      ? 'expired'
      : checks.some((c) => c.state_of_check === 'expiring')
        ? 'expiring'
        : 'valid'

  const person = checks[0]

  return (
    <li
      className={`rounded-card border bg-card p-5 ${
        worst === 'expired' || worst === 'unknown'
          ? 'border-danger'
          : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-bold text-foreground">
          {person.full_name ?? person.email}
        </h3>
        {/* Whether they can already reach children changes what to do about
            this, and it is not obvious from a name. */}
        <span className="rounded-btn bg-background px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
          {person.profile_id ? 'Has an account' : 'No account yet'}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">
          {checks.length} check{checks.length === 1 ? '' : 's'} on file
        </span>
      </div>

      {/* Not repeated when it is already the heading — somebody with no
          account has no name on file, and the address is all there is. */}
      {person.full_name && (
        <p className="text-sm">
          <a
            href={`mailto:${person.email}`}
            className="text-primary hover:underline"
          >
            {person.email}
          </a>
        </p>
      )}

      <ul className="mt-4 space-y-4">
        {checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </ul>
    </li>
  )
}

/** One entry per person, worst first, each holding all of their checks. */
function byPerson(checks: ScreeningRow[]): ScreeningRow[][] {
  const grouped = new Map<string, ScreeningRow[]>()
  for (const check of checks) {
    grouped.set(check.email, [...(grouped.get(check.email) ?? []), check])
  }
  return [...grouped.values()]
}

export default function Screening() {
  const checks = useQuery({
    queryKey: queryKeys.screening,
    queryFn: fetchScreening,
  })

  const missing = useQuery({
    queryKey: queryKeys.unscreened,
    queryFn: fetchApprovedWithoutScreening,
  })

  const [addingFor, setAddingFor] = useState<string | null>(null)

  // 'unknown' is not valid, so this already includes it — stated because the
  // whole point of db/051 is that an unknown expiry must never be filed under
  // "nothing to do here".
  const urgent = (checks.data ?? []).filter(
    (c) => c.state_of_check !== 'valid',
  )
  const valid = (checks.data ?? []).filter((c) => c.state_of_check === 'valid')

  return (
    <div>
      <PageHeader
        title="Screening"
        lead="Working With Children and NDIS checks held by specialists in the network."
      />

      {(checks.isPending || missing.isPending) && <LoadingCards count={3} />}
      {checks.isError && (
        <ErrorState
          message={checks.error.message}
          onRetry={() => void checks.refetch()}
        />
      )}

      {/*
        THE MOST URGENT SECTION ON THIS SCREEN CANNOT BE ALLOWED TO VANISH.
        It renders only on `isSuccess`, which is right — but nothing said so
        when the query FAILED. The section simply did not appear, the expiring
        list below rendered as normal, and the page looked complete. A reader
        would take it as "nobody is missing a check", which is the exact
        omission this section exists to prevent.
      */}
      {missing.isError && (
        <div
          role="alert"
          className="mb-8 rounded-card border border-warning bg-warning-subtle p-4 text-sm text-warning-foreground"
        >
          <b>Who has no check on file could not be read.</b> This is unknown
          rather than none — the list below shows only checks that are expiring,
          and would never have included them.
        </div>
      )}

      {/* --- Approved with nothing on file ---------------------------------
          First, because there is nothing to expire and therefore nothing that
          would ever appear in the list below. */}
      {missing.isSuccess && missing.data.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-semibold text-danger-foreground">
            Approved with no check on file ({missing.data.length})
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            These people were admitted to the network without a screening number
            being recorded. They will never appear in the list below, because
            there is nothing to expire.
          </p>
          <ul className="space-y-4">
            {missing.data.map((person) => (
              <li
                key={person.application_id}
                className="rounded-card border border-danger bg-card p-5"
              >
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <h3 className="font-bold text-foreground">
                    {person.full_name}
                  </h3>
                  <span className="rounded-btn bg-background px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    {PROFESSIONS[person.profession]}
                  </span>
                  <span className="ml-auto text-sm text-muted-foreground">
                    approved {formatDate(person.approved_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm">
                  <a
                    href={`mailto:${person.email}`}
                    className="text-primary hover:underline"
                  >
                    {person.email}
                  </a>
                </p>

                {addingFor === person.email ? (
                  <RenewalForm
                    email={person.email}
                    checkType="wwcc"
                    onDone={() => setAddingFor(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingFor(person.email)}
                    className="mt-3 rounded-btn bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Record their check
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Expired and expiring ------------------------------------------ */}
      {checks.isSuccess && urgent.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Needs attention ({byPerson(urgent).length})
          </h2>
          <ul className="space-y-4">
            {byPerson(urgent).map((checks) => (
              <PersonCard key={checks[0].email} checks={checks} />
            ))}
          </ul>
        </section>
      )}

      {checks.isSuccess &&
        missing.isSuccess &&
        urgent.length === 0 &&
        missing.data.length === 0 && (
          <p className="mb-8 rounded-card border border-border bg-card shadow-raised p-6 text-center">
            <strong className="font-semibold text-foreground">
              Every check on file is current.
            </strong>
            <span className="mt-1 block text-sm text-muted-foreground">
              {checks.data.length === 0
                ? 'Though none are on file yet — approved specialists appear here once a number is recorded.'
                : `${checks.data.length} check${checks.data.length === 1 ? '' : 's'} held, none expiring within 60 days.`}
            </span>
          </p>
        )}

      {/* --- Everything else ----------------------------------------------- */}
      {valid.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Current ({byPerson(valid).length})
          </h2>
          <ul className="space-y-4">
            {byPerson(valid).map((checks) => (
              <PersonCard key={checks[0].email} checks={checks} />
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 max-w-prose text-xs text-muted-foreground">
        An expired check does not remove anybody&rsquo;s access. MiZanova does
        not talk to the Office of the Children&rsquo;s Guardian, and a date
        passing here most often means a renewal has not been recorded yet rather
        than that somebody is unscreened. Whether a lapsed check should suspend
        access, and after how long, is a decision for Special Miles.
      </p>
    </div>
  )
}
