import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAdminAuditEvents,
  fetchAiControls,
  fetchAllStaff,
  fetchApprovedWithoutScreening,
  fetchSchools,
  fetchScreening,
  fetchSystemEvents,
  fetchWorkQueue,
  queryKeys,
} from '../../lib/api'
import { fetchStaffMfaStatus } from '../../lib/mfa'
import { MFA_REQUIRED_ROLES, ROLE_CONFIG } from '../../lib/roles'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import { auditAction } from '../../lib/auditActions'
import ReviewEvents from '../../components/ReviewEvents'
import PageHeader, { PageNote } from '../../components/PageHeader'
import ActivityBars, { type ActivityDay } from '../../components/ActivityBars'
import StatTile from '../../components/StatTile'

/**
 * Global Overview — the Platform Admin's landing screen.
 *
 * IT USED TO BE THE SCHOOLS PAGE. Both sidebar items rendered the same
 * component, so two different links went to one screen and the landing page
 * answered a question nobody had asked twice.
 *
 * They are now genuinely different questions:
 *
 *   Schools  — how is each tenant doing?
 *   Billing  — what money has moved?
 *   here     — what needs Special Miles to do something today?
 *
 * So this screen is a work queue, not a scoreboard. Everything on it is
 * something a person at Special Miles can act on, and every item links to the
 * place where they would act.
 */
export default function GlobalOverview() {
  const queryClient = useQueryClient()
  const schools = useQuery({ queryKey: queryKeys.schools, queryFn: fetchSchools })
  const staff = useQuery({ queryKey: queryKeys.allStaff, queryFn: fetchAllStaff })
  const controls = useQuery({
    queryKey: queryKeys.aiControls,
    queryFn: fetchAiControls,
  })
  const screening = useQuery({
    queryKey: queryKeys.screening,
    queryFn: fetchScreening,
  })
  const unscreened = useQuery({
    queryKey: queryKeys.unscreened,
    queryFn: fetchApprovedWithoutScreening,
  })
  const audit = useQuery({
    queryKey: queryKeys.adminAudit,
    queryFn: fetchAdminAuditEvents,
  })
  const mfa = useQuery({
    queryKey: ['staff-mfa-status'],
    queryFn: fetchStaffMfaStatus,
  })
  // The same counts the notification bell reads, so the two cannot drift.
  const queue = useQuery({
    queryKey: queryKeys.workQueue('platform_admin'),
    queryFn: () => fetchWorkQueue('platform_admin'),
  })
  const systemEvents = useQuery({
    queryKey: queryKeys.systemEvents,
    queryFn: () => fetchSystemEvents(20),
  })

  if (staff.isPending) return <LoadingCards count={3} />
  if (staff.isError) return <ErrorState message={staff.error.message} />

  const awaiting = staff.data.filter((p) => !p.is_verified)

  // Staff whose role requires an authenticator and who have not set one up.
  // They are locked out of student records until they do, so this is a support
  // queue rather than a compliance score.
  const withoutMfa = staff.data.filter(
    (person) =>
      MFA_REQUIRED_ROLES.includes(person.role) &&
      mfa.data &&
      !mfa.data[person.id]?.hasAuthenticator,
  )

  const aiOff = controls.data ? !controls.data.ai_enabled : false

  /*
   * A SILENT BANNER MUST MEAN "NOTHING IS WRONG", NEVER "I COULD NOT LOOK".
   *
   * The obvious form of this — counting `data ?? []` and hiding the banner at
   * zero — makes a failed query indistinguishable from a clean bill of health,
   * and does it on the one panel whose entire job is to raise an alarm. That is
   * this project's most-repeated fault, and this is the worst place in the
   * product to repeat it.
   *
   * So the counts are only counts when the query actually answered, and a
   * failure raises its own alarm rather than disappearing into a zero.
   */
  const screeningUnknown = screening.isError || unscreened.isError
  const screeningAlarm = screening.isSuccess
    ? screening.data.filter((c) => c.state_of_check !== 'valid').length
    : 0
  const unscreenedCount = unscreened.isSuccess ? unscreened.data.length : 0

  /*
   * ONE LIST OF WHAT A PERSON DID, read by the chart AND the table below it.
   *
   * They used to disagree. The chart skipped rows with no actor; the table took
   * `slice(0, 6)` of everything. So the same screen showed a chart captioned
   * "actions taken by a person" beside six rows of which four were
   * `RLS Storage Probe` created by the test suite — and a footnote explaining
   * the chart's filter sat directly under the table that ignored it.
   *
   * On the screen headed "what needs Special Miles today", a row created by CI
   * is the opposite of the answer. Everything, including those rows, is on the
   * Audit Log, which can now be paged and filtered to find them.
   */
  const byPeople = (audit.data ?? []).filter((e) => e.profiles?.full_name)

  /*
   * FOURTEEN DAYS, AND ONLY WHAT A PERSON DID.
   *
   * Audit rows written by the test suite and by the server carry no actor —
   * there is no `auth.uid()` behind them — and on this database they outnumber
   * the real ones several times over. Counting them would make the chart a
   * picture of how often CI ran.
   *
   * The buckets are built from a fixed 14-day frame rather than from the rows,
   * so a quiet day is a gap in the series instead of a day that vanishes and
   * silently compresses the timeline.
   */
  const humanActivity: ActivityDay[] = (() => {
    const frame: ActivityDay[] = []
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    for (let i = 13; i >= 0; i--) {
      const d = new Date(midnight)
      d.setDate(d.getDate() - i)
      frame.push({ date: d, count: 0 })
    }
    const first = frame[0].date.getTime()
    for (const e of byPeople) {
      const when = new Date(e.occurred_at)
      const day = Math.floor((when.getTime() - first) / 86_400_000)
      if (day >= 0 && day < frame.length) frame[day].count += 1
    }
    return frame
  })()

  return (
    <div>
      <PageHeader
        title="Global overview"
        lead="What needs Special Miles today, across every school."
      />

      {/* A LAPSED CHECK GOES ABOVE EVERY STATISTIC ON THIS PAGE.
          The screening list is its own screen, and a screen nobody opens is
          not a watcher. This is the page a platform admin lands on, so the
          number that matters most is said here — and only when it is not
          zero, so it stays a signal rather than furniture.

          `unscreened` is counted separately and first: somebody approved with
          no number never appears in the expiry list, because there is nothing
          to expire. */}
      {screeningUnknown && (
        <div
          role="alert"
          className="mb-6 rounded-card border border-warning bg-warning-subtle p-5"
        >
          <p className="font-bold text-warning-foreground">
            Screening status could not be read
          </p>
          <p className="mt-1 max-w-prose text-sm text-warning-foreground">
            This panel cannot tell you whether anybody&rsquo;s Working With
            Children Check has lapsed. That is not the same as everything being
            in order — try the screening page directly.
          </p>
          <Link
            to="/platform-admin/screening"
            className="mt-3 inline-block rounded-btn border border-warning-foreground px-4 py-2.5 font-semibold text-warning-foreground"
          >
            Open screening
          </Link>
        </div>
      )}

      {(screeningAlarm > 0 || unscreenedCount > 0) && (
        <div
          role="alert"
          className="mb-6 rounded-card border border-danger bg-danger-subtle p-5"
        >
          <p className="font-bold text-danger-foreground">
            {unscreenedCount > 0 && (
              <>
                {unscreenedCount} approved specialist
                {unscreenedCount === 1 ? ' has' : 's have'} no screening check
                on file
              </>
            )}
            {unscreenedCount > 0 && screeningAlarm > 0 && ', and '}
            {screeningAlarm > 0 && (
              <>
                {screeningAlarm} check{screeningAlarm === 1 ? ' has' : 's have'}{' '}
                expired or expire within 60 days
              </>
            )}
          </p>
          <p className="mt-1 max-w-prose text-sm text-danger-foreground">
            A Working With Children Check is a statement about a day, and these
            have run out or were never recorded. Nobody&rsquo;s access has been
            removed — that is a decision for a person, not a date.
          </p>
          <Link
            to="/platform-admin/screening"
            className="mt-3 inline-block rounded-btn bg-danger px-4 py-2.5 font-semibold text-white"
          >
            Open screening
          </Link>
        </div>
      )}

      {/* The kill switch being off is not a statistic — it means no teacher
          anywhere is getting suggestions, so it goes first and loudly. */}
      {aiOff && (
        <div
          role="alert"
          className="mb-6 rounded-card border border-danger bg-danger-subtle p-5"
        >
          <p className="font-bold text-danger-foreground">
            AI suggestions are switched off platform-wide
          </p>
          <p className="mt-1 max-w-prose text-sm text-danger-foreground">
            No teacher in any school is receiving strategies. Behaviour logging
            and everything else is unaffected.
          </p>
          <Link
            to="/platform-admin/ai-governance"
            className="mt-3 inline-block rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
          >
            Open AI governance
          </Link>
        </div>
      )}

      {/* --- Things that broke ----------------------------------------------
          UNREVIEWED ONLY, since db/041. This panel showed six webhook
          rejections for two days, all of them from `npm run webhook-check`
          deliberately forging signatures to prove they get refused — and there
          was no way to say so. A panel whose job is to be believed cannot also
          be permanently wrong.

          The severity stays 'warning', deliberately. A rejected webhook is
          either a probe or a wrong STRIPE_WEBHOOK_SECRET, and the second means
          every payment from now on is taken by Stripe and never recorded. The
          server cannot tell them apart; a person can, once. */}
      {(() => {
        const serious = (systemEvents.data ?? []).filter(
          (e) =>
            e.reviewed_at === null &&
            (e.severity === 'critical' || e.severity === 'warning'),
        )
        if (serious.length === 0) return null

        return (
          <div
            role="alert"
            className={`mb-6 rounded-card border p-5 ${
              serious.some((e) => e.severity === 'critical')
                ? 'border-danger bg-danger-subtle'
                : 'border-warning bg-warning-subtle'
            }`}
          >
            <p
              className={`font-bold ${
                serious.some((e) => e.severity === 'critical')
                  ? 'text-danger-foreground'
                  : 'text-warning-foreground'
              }`}
            >
              {serious.length} recent problem{serious.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-2 space-y-1">
              {serious.slice(0, 5).map((event) => (
                <li
                  key={event.id}
                  className={`text-sm ${
                    event.severity === 'critical'
                      ? 'text-danger-foreground'
                      : 'text-warning-foreground'
                  }`}
                >
                  <span className="font-semibold">
                    {event.source}.{event.event}
                  </span>
                  {event.detail && (
                    /**
                     * Truncated for scanning, not for secrecy — the full text
                     * is stored and is in the title attribute.
                     *
                     * Stripe's signature error is a whole paragraph ending in
                     * a documentation URL, so three of them filled the panel
                     * and buried everything underneath. A list you have to
                     * read in full to skim is not a list of what needs
                     * attention.
                     */
                    <span title={event.detail}>
                      {' — '}
                      {event.detail.length > 120
                        ? `${event.detail.slice(0, 120)}…`
                        : event.detail}
                    </span>
                  )}
                  <span className="block text-xs opacity-80">
                    {new Date(event.occurred_at).toLocaleString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </span>
                </li>
              ))}
            </ul>

            <ReviewEvents
              events={serious}
              onDone={() =>
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.systemEvents,
                })
              }
            />
          </div>
        )
      })()}

      {/*
        STATTILE, WHICH ALREADY EXISTED AND ALREADY DID THIS BETTER.

        These were three hand-rolled cards. Each reimplemented the same
        "a failed query is not zero" guard in its own words — and each was
        right, which is the problem: three correct copies of one rule is three
        places for the fourth to be wrong. None of them had an icon, which is
        the thing Saurab noticed from across the room.

        StatTile takes `value: number | undefined`, where undefined means NOT
        KNOWN and renders an em-dash with a spoken title, never a confident 0.
        The school admin and specialist dashboards have used it since M13.

        The two new tiles come from `fetchWorkQueue`, which is what the
        notification bell counts. So the bell and this page cannot disagree
        about how much work is waiting — they are reading the same numbers,
        rather than two implementations that drift.
      */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Awaiting verification"
          value={staff.isSuccess ? awaiting.length : undefined}
          icon="verification"
          tone={awaiting.length > 0 ? 'warning' : 'default'}
          hint={
            awaiting.length > 0 ? (
              <Link
                to="/platform-admin/verification"
                className="font-semibold text-primary hover:underline"
              >
                They can sign in but see no student records. Review them →
              </Link>
            ) : (
              'Nobody waiting.'
            )
          }
        />

        <StatTile
          label="Staff without 2FA"
          value={mfa.isSuccess ? withoutMfa.length : undefined}
          icon="lock"
          tone={mfa.isSuccess && withoutMfa.length > 0 ? 'warning' : 'default'}
          hint={
            mfa.isError ? (
              'Could not check 2FA enrolment — this is unknown, not zero.'
            ) : withoutMfa.length > 0 ? (
              /*
                THE ONLY TILE THAT NAMED A PROBLEM AND OFFERED NO WAY TO IT.
                Every other one here routes to the screen that resolves it.
                Staff Verification already carries a 2FA column and the reset
                action, so the destination existed the whole time — it simply
                was not linked, which on a dashboard means the number is a
                complaint rather than a task.
              */
              <Link
                to="/platform-admin/verification"
                className="font-semibold text-primary hover:underline"
              >
                Locked out until they enrol. See who →
              </Link>
            ) : (
              'Everyone whose role requires it has enrolled.'
            )
          }
        />

        <StatTile
          label="Schools"
          value={schools.isSuccess ? schools.data.length : undefined}
          icon="schools"
          hint={
            schools.isError ? (
              'Could not load schools — this is unknown, not zero.'
            ) : (
              <Link
                to="/platform-admin/tenants"
                className="font-semibold text-primary hover:underline"
              >
                See how each is doing →
              </Link>
            )
          }
        />

        <StatTile
          label="Enquiries unanswered"
          value={queue.data?.newEnquiries ?? undefined}
          icon="enquiries"
          tone={(queue.data?.newEnquiries ?? 0) > 0 ? 'warning' : 'default'}
          hint={
            (queue.data?.newEnquiries ?? 0) > 0 ? (
              <Link
                to="/platform-admin/enquiries"
                className="font-semibold text-primary hover:underline"
              >
                A school asked to talk to us. Reply →
              </Link>
            ) : (
              'Nobody is waiting on a reply.'
            )
          }
        />

        <StatTile
          label="Applications to decide"
          value={queue.data?.newApplications ?? undefined}
          icon="applications"
          tone={(queue.data?.newApplications ?? 0) > 0 ? 'warning' : 'default'}
          hint={
            (queue.data?.newApplications ?? 0) > 0 ? (
              <Link
                to="/platform-admin/applications"
                className="font-semibold text-primary hover:underline"
              >
                Nobody has opened these yet. Review →
              </Link>
            ) : (
              'Nothing waiting on a decision.'
            )
          }
        />

        <StatTile
          label="Screening expiring"
          value={queue.data?.screeningDueSoon ?? undefined}
          icon="screening"
          tone={(queue.data?.screeningDueSoon ?? 0) > 0 ? 'danger' : 'default'}
          hint={
            (queue.data?.screeningDueSoon ?? 0) > 0 ? (
              <Link
                to="/platform-admin/screening"
                className="font-semibold text-primary hover:underline"
              >
                Within thirty days, or already lapsed. Chase →
              </Link>
            ) : (
              'Every check on file is current.'
            )
          }
        />
      </div>

      {/* --- Who is waiting ------------------------------------------------- */}
      {awaiting.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
            Waiting on you
          </h2>
          <ul className="space-y-2">
            {awaiting.slice(0, 8).map((person) => (
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
                <Link
                  to="/platform-admin/verification"
                  className="mt-2 inline-block rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground sm:mt-0 sm:ml-auto"
                >
                  Verify
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* --- Activity ------------------------------------------------------- */}
      <h2 className="mt-10 mb-1 text-lg font-semibold text-foreground">
        Administrative activity
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Actions taken by a person over the last fourteen days.
      </p>
      <div className="rounded-card border border-border bg-card shadow-raised p-5">
        {audit.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : audit.isError ? (
          <p className="text-sm text-danger-foreground">
            Could not read the audit trail, so this is unknown rather than
            quiet.
          </p>
        ) : humanActivity.some((d) => d.count > 0) ? (
          <ActivityBars days={humanActivity} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Nobody has verified a staff member, reset two-factor, changed the AI
            controls or touched a school in the last fortnight. An empty chart
            here means a quiet fortnight, not a broken one.
          </p>
        )}
      </div>

      {/* --- Recent administrative actions ---------------------------------- */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        Recent administrative actions
      </h2>
      {audit.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : byPeople.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing recorded yet. Verifications, AI control changes and 2FA resets
          all appear here.
        </p>
      ) : (
        /*
          A TABLE, NOT A STACK OF CARDS. Each entry was a card with the pill,
          the subject and the time run together as a sentence — fine for one,
          unreadable for six, because nothing lines up and the eye has to parse
          each one separately. The Audit Log itself was rebuilt the same way and
          for the same reason.
        */
        <div className="overflow-x-auto rounded-card border border-border bg-card shadow-raised">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/60">
              <tr className="text-xs tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="px-4 py-2.5 font-semibold">When</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Action</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Who</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">To whom</th>
              </tr>
            </thead>
            <tbody>
              {byPeople.slice(0, 6).map((event) => (
                <tr key={event.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-muted-foreground">
                    {new Date(event.occurred_at).toLocaleString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    {/* A pill with the human name, not the raw action. This
                        rendered `event.action` straight from the database, so
                        the landing screen said "staff_moved_school" while the
                        Audit Log two clicks away said "Moved school" for the
                        same event. The map is shared so they cannot disagree. */}
                    <span
                      className={`inline-block rounded-btn px-2 py-0.5 text-xs font-semibold ${auditAction(event.action).className}`}
                    >
                      {auditAction(event.action).label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {event.profiles?.full_name || 'System'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {event.subject_label || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link
        to="/platform-admin/audit"
        className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
      >
        Full audit log →
      </Link>

      <PageNote>
        Problems are recorded by the API server when it notices them. If the
        server itself is not running, nothing appears here — an empty list means
        nothing was reported, not that everything is working. Confirming the
        server is alive needs something outside it to check{' '}
        <code>/api/health</code>, which nothing does yet. The chart and the
        table above it both count only what a person did: the test suite and the
        server write audit rows with no signed-in user, and on this database
        those outnumber the real ones several times over. Everything, those rows
        included, is on the Audit Log, which can be filtered and paged.
      </PageNote>
    </div>
  )
}
