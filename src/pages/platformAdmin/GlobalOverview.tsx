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
  queryKeys,
} from '../../lib/api'
import { fetchStaffMfaStatus } from '../../lib/mfa'
import { MFA_REQUIRED_ROLES, ROLE_CONFIG } from '../../lib/roles'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import { auditAction } from '../../lib/auditActions'
import ReviewEvents from '../../components/ReviewEvents'
import PageHeader from '../../components/PageHeader'

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

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Awaiting verification
          </p>
          <p
            className={`mt-2 text-4xl font-bold ${
              awaiting.length > 0
                ? 'text-warning-foreground'
                : 'text-foreground'
            }`}
          >
            {awaiting.length}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {awaiting.length > 0
              ? 'They can sign in but see no student records.'
              : 'Nobody waiting.'}
          </p>
          {awaiting.length > 0 && (
            <Link
              to="/platform-admin/verification"
              className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
            >
              Review them →
            </Link>
          )}
        </div>

        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Staff without 2FA
          </p>
          {/* THE COLOUR LIED AS WELL AS THE NUMBER.
              This read `mfa.isPending ? '—' : withoutMfa.length`, with no
              isError branch — so a failed query fell through to an empty array
              and rendered 0. Worse than the Schools tile below it, because the
              class above was driven by `withoutMfa.length > 0`: zero painted
              the tile in the CALM colour. An administrator glancing at "Staff
              without 2FA: 0" in grey concludes every account is enrolled, at
              the exact moment the platform could not check. False reassurance
              about a security control is worse than no tile at all. */}
          <p
            className={`mt-2 text-4xl font-bold ${
              mfa.isError
                ? 'text-danger-foreground'
                : mfa.isSuccess && withoutMfa.length > 0
                  ? 'text-warning-foreground'
                  : 'text-foreground'
            }`}
          >
            {mfa.isPending ? '—' : mfa.isError ? '?' : withoutMfa.length}
          </p>
          {mfa.isError ? (
            <p className="mt-1 text-sm text-danger-foreground">
              Could not check 2FA enrolment — this is unknown, not zero.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Required for their role, so they are locked out until they enrol.
            </p>
          )}
        </div>

        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Schools
          </p>
          {/* A FAILED QUERY IS NOT ZERO SCHOOLS.
              `schools.data ?? 0` rendered a confident 0 when the query had
              errored — which is exactly what happened when db/039's
              compatibility view dropped five columns. The number said the
              platform had no customers; the truth was that the question could
              not be asked. Same fault as every other "reports success when it
              could not look" in this project. */}
          <p
            className={`mt-2 text-4xl font-bold ${
              schools.isError ? 'text-danger-foreground' : 'text-foreground'
            }`}
          >
            {schools.isPending ? '—' : schools.isError ? '?' : schools.data.length}
          </p>
          {schools.isError ? (
            <p className="mt-1 text-sm text-danger-foreground">
              Could not load schools — this is unknown, not zero.
            </p>
          ) : (
            <Link
              to="/platform-admin/tenants"
              className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
            >
              See how each is doing →
            </Link>
          )}
        </div>
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

      {/* --- Recent administrative actions ---------------------------------- */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        Recent administrative actions
      </h2>
      {audit.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (audit.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing recorded yet. Verifications, AI control changes and 2FA resets
          all appear here.
        </p>
      ) : (
        <ul className="space-y-2">
          {audit.data!.slice(0, 6).map((event) => (
            <li
              key={event.id}
              className="rounded-card border border-border bg-card shadow-raised p-3 text-sm"
            >
              {/* A pill with the human name, not the raw action. This rendered
                  `event.action` straight from the database, so the landing
                  screen said "staff_moved_school" while the Audit Log two
                  clicks away said "Moved school" for the same event. The map
                  is shared now so they cannot disagree again. */}
              <span
                className={`inline-block rounded-btn px-2 py-0.5 text-xs font-semibold ${auditAction(event.action).className}`}
              >
                {auditAction(event.action).label}
              </span>
              {event.subject_label && (
                <span className="text-muted-foreground"> · {event.subject_label}</span>
              )}
              <span className="block text-muted-foreground">
                {new Date(event.occurred_at).toLocaleString('en-AU', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/platform-admin/audit"
        className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
      >
        Full audit log →
      </Link>

      {/* The limit of this screen, stated on it. Silence here means nothing
          recorded a failure — which is also exactly what an unreachable server
          looks like. A dashboard reporting "no problems" during an outage is
          worse than no dashboard. */}
      <p className="mt-10 max-w-prose text-xs text-muted-foreground">
        Problems are recorded by the API server when it notices them. If the
        server itself is not running, nothing appears here — an empty list means
        nothing was reported, not that everything is working. Confirming the
        server is alive needs something outside it to check
        <code className="mx-1">/api/health</code>, which nothing does yet.
      </p>
    </div>
  )
}
