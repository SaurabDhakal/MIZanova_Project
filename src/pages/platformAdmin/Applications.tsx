import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PROFESSIONS,
  decideSpecialistApplication,
  fetchQueueCounts,
  fetchSpecialistApplications,
  queryKeys,
  type ApplicationRow,
  type ApplicationStatus,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import QueueTabs from '../../components/QueueTabs'
import PageHeader from '../../components/PageHeader'
import { showToast } from '../../lib/toast'
import { screeningValidity } from '../../lib/screeningValidity'

/**
 * Gate 1 review — `09-Onboarding-and-Tenancy.md` §5.
 *
 * WHAT THIS SCREEN IS ACTUALLY FOR: checking two numbers against two public
 * registers, and recording that somebody did. The links are on each card
 * because a reviewer who has to go and find them will eventually stop.
 *
 * THE BUTTON IS THE ATTESTATION, NOT THE CHECK — the same statement as teacher
 * verification. MiZanova does not talk to the Office of the Children's Guardian
 * or to AHPRA. Approving here records that a named member of Special Miles
 * staff completed those checks, on a date. Anything else this screen implied
 * would be a claim about a check nobody performed.
 *
 * APPROVAL CREATES NO ACCOUNT, and the screen says so where the button is,
 * because "approved" reads like "they're in" and the truth is one step short of
 * that. See db/047 for why the account waits for a school.
 */

const TABS: { value: ApplicationStatus | 'all'; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'in_review', label: 'Being checked' },
  { value: 'more_needed', label: 'Waiting on them' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'Everything' },
]

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  new: 'bg-primary-subtle text-primary',
  in_review: 'bg-warning-subtle text-warning-foreground',
  more_needed: 'bg-warning-subtle text-warning-foreground',
  approved: 'bg-success-subtle text-success-foreground',
  declined: 'bg-background text-muted-foreground',
}

const DECISIONS: {
  value: Exclude<ApplicationStatus, 'new'>
  label: string
  needsNote: boolean
}[] = [
  { value: 'in_review', label: "I'm checking this", needsNote: false },
  { value: 'approved', label: 'Approve', needsNote: false },
  { value: 'more_needed', label: 'Ask for more', needsNote: true },
  { value: 'declined', label: 'Decline', needsNote: true },
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** How long they have been waiting — the thing a queue is actually about. */
function waitingFor(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function ApplicationCard({ application }: { application: ApplicationRow }) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState(application.review_note ?? '')

  const decide = useMutation({
    mutationFn: (status: Exclude<ApplicationStatus, 'new'>) =>
      decideSpecialistApplication(application.id, status, note),
    onSuccess: (result, status) => {
      void queryClient.invalidateQueries({ queryKey: ['applications'] })
      void queryClient.invalidateQueries({ queryKey: ['queue-counts'] })
      if (status === 'in_review') {
        showToast('Marked as being checked.')
      } else if (result.emailSent) {
        showToast(`Recorded, and ${application.full_name} has been told.`)
      } else {
        /*
         * The decision is recorded either way, and this is the one place that
         * matters: a specialist who was approved and never told is waiting for
         * a letter nobody is going to send. Said out loud rather than logged.
         */
        showToast(
          `Recorded, but the email did not send: ${result.emailError ?? 'unknown reason'}. Tell them yourself.`,
          'error',
        )
      }
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  const profession =
    application.profession === 'other'
      ? (application.profession_other ?? 'Other')
      : PROFESSIONS[application.profession]

  /*
   * THE LOGIC LIVES IN src/lib/screeningValidity.ts SO IT CAN BE TESTED.
   *
   * db/047 refuses any edit to what an applicant claimed — "an application
   * records what somebody claimed" — so an application with a lapsed check
   * cannot be manufactured on a running database to look at. Inline here it
   * could only be reasoned about, and reasoning about it is exactly what
   * produced the bug: this asked whether a NUMBER existed, printed "EXPIRED"
   * beside it in red, and enabled Approve anyway.
   */
  const validity = screeningValidity(application)
  // Kept for the badge below, which labels the WWCC line specifically.
  const expired = validity.wwccExpired

  /*
   * APPROVING WITHOUT A SCREENING NUMBER IS THE ONE MISTAKE THIS SCREEN MUST
   * NOT MAKE EASY.
   *
   * Found by using it: the first real application arrived with an expiry date
   * and no WWCC number, the card said "not given — ask them", and Approve was
   * enabled anyway. Approval is what a school later relies on, and Child Safe
   * Standards require the organisation to hold a record of the check — not a
   * memory of having done one.
   *
   * Either number satisfies it. An NDIS Worker Screening Check is a separate,
   * national check, and a practitioner who holds one and not a WWCC is a real
   * person rather than an edge case.
   *
   * THIS IS A GUARD AGAINST CARELESSNESS, NOT A SECURITY BOUNDARY. A platform
   * admin could still write the row directly, and that is fine: they are
   * trusted staff, and the thing being prevented here is a tired reviewer at
   * the end of a queue, not an attacker.
   */
  const screened = validity.approvable

  /** Said once, in words, above the buttons they apply to. */
  const blockedReasons = [
    // Said as two different sentences, because they are two different problems
    // and "ask them for it" is the wrong instruction for a lapsed check.
    // Two different problems, so two different sentences: "ask them for it" is
    // the wrong instruction to send somebody whose check has simply lapsed.
    !screened &&
      !validity.allExpired &&
      'Approving needs a WWCC or NDIS screening number on file — ask them for it.',
    validity.allExpired &&
      'Every check on file has expired. Approving would record a clearance that is no longer valid — ask for the current one.',
    !note.trim() &&
      'Declining or asking for more needs a note, because it is sent to them.',
  ].filter((reason): reason is string => typeof reason === 'string')

  return (
    <li className="rounded-card border border-border bg-card shadow-raised p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-bold text-foreground">
          {application.full_name}
        </h3>
        <span
          className={`rounded-btn px-2.5 py-0.5 text-xs font-semibold uppercase ${STATUS_STYLE[application.status]}`}
        >
          {application.status.replace('_', ' ')}
        </span>
        <span className="rounded-btn bg-background px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
          {profession}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">
          Applied {waitingFor(application.created_at)}
        </span>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Email</dt>
          <dd>
            <a
              href={`mailto:${application.email}`}
              className="font-medium text-primary hover:underline"
            >
              {application.email}
            </a>
          </dd>
        </div>
        {application.phone && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Phone</dt>
            <dd>
              <a
                href={`tel:${application.phone}`}
                className="font-medium text-primary hover:underline"
              >
                {application.phone}
              </a>
            </dd>
          </div>
        )}
        {application.years_experience !== null && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Experience</dt>
            <dd className="font-medium text-foreground">
              {application.years_experience} years
            </dd>
          </div>
        )}
        {application.regions && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Works in</dt>
            <dd className="font-medium text-foreground">{application.regions}</dd>
          </div>
        )}
      </dl>

      {application.about && (
        <blockquote className="mt-4 border-l-4 border-border pl-4 text-sm whitespace-pre-wrap text-foreground">
          {application.about}
        </blockquote>
      )}

      {/* --- The checks ---------------------------------------------------
          Grouped, labelled as the sensitive thing they are, and each with the
          register it is checked against. A reviewer who has to go and find the
          right website will eventually check less carefully. */}
      <div className="mt-4 rounded-btn border border-border bg-background p-4">
        <p className="text-sm font-semibold text-foreground">
          Verify these at the source
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Visible to Special Miles staff only. Never shown to a school.
        </p>

        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex flex-wrap gap-2">
            <dt className="text-muted-foreground">Date of birth</dt>
            <dd className="font-mono font-medium text-foreground">
              {formatDate(application.date_of_birth)}
            </dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="text-muted-foreground">WWCC</dt>
            <dd className="font-mono font-medium text-foreground">
              {application.wwcc_number ? (
                <>
                  {application.wwcc_state} {application.wwcc_number}
                  {application.wwcc_expiry && (
                    <span
                      className={
                        expired
                          ? 'ml-2 font-sans font-semibold text-danger-foreground'
                          : 'ml-2 font-sans text-muted-foreground'
                      }
                    >
                      {expired ? 'EXPIRED' : 'expires'}{' '}
                      {formatDate(application.wwcc_expiry)}
                    </span>
                  )}
                </>
              ) : (
                <span className="font-sans text-muted-foreground">
                  not given — ask them
                </span>
              )}
            </dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="text-muted-foreground">Registration</dt>
            <dd className="font-mono font-medium text-foreground">
              {application.registration_number ? (
                <>
                  {application.registration_body} {application.registration_number}
                </>
              ) : (
                <span className="font-sans text-muted-foreground">not given</span>
              )}
            </dd>
          </div>
          {application.ndis_screening_number && (
            <div className="flex flex-wrap gap-2">
              <dt className="text-muted-foreground">NDIS screening</dt>
              <dd className="font-mono font-medium text-foreground">
                {application.ndis_screening_number}
              </dd>
            </div>
          )}
        </dl>

        {!screened && (
          <p
            role="alert"
            className="mt-3 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
          >
            <strong className="font-semibold">
              No screening number recorded.
            </strong>{' '}
            They cannot be approved until there is a WWCC or NDIS Worker
            Screening number to check — ask them for it and use{' '}
            <em>Ask for more</em>.
          </p>
        )}

        {/*
          THE EMPLOYER ROUTE, NOT THE INDIVIDUAL ONE, and the distinction is
          legal rather than cosmetic.

          This used to point at a Service NSW page that 404s — it has moved, so
          the one link on this screen that helps somebody actually check a
          child-safety credential went nowhere. Service NSW does still have a
          status page, but it is the one a HOLDER uses to look up their own
          check.

          Special Miles is an organisation engaging people for child-related
          work, and under the Child Protection (Working With Children) Act 2012
          that means registering with the Office of the Children's Guardian and
          verifying through the Employer Portal. Verifying is a legal
          requirement with a fine attached, and it is what records that this
          person works for us — so a link to the individual lookup would send a
          reviewer to the wrong obligation entirely.
        */}
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <a
            href="https://ocg.nsw.gov.au/working-children-check/wwcc-information-organisations/help-register-and-verify"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline"
          >
            Verify a NSW WWCC — employer portal ↗
          </a>
          <a
            href="https://www.ahpra.gov.au/registration/registers-of-practitioners.aspx"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline"
          >
            AHPRA register ↗
          </a>
        </div>
      </div>

      {application.reviewed_at && (
        <p className="mt-4 text-sm text-muted-foreground">
          {application.status.replace('_', ' ')} by{' '}
          {application.reviewed_by?.full_name ?? 'someone'} on{' '}
          {formatDate(application.reviewed_at)}
          {application.approved_at &&
            application.status !== 'approved' &&
            ` · admitted to the network ${formatDate(application.approved_at)}`}
        </p>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <label
          htmlFor={`note-${application.id}`}
          className="block text-sm font-semibold text-foreground"
        >
          What you checked, and what you decided
        </label>
        <p className="text-xs text-muted-foreground">
          <strong className="font-semibold text-foreground">
            This is sent to the applicant
          </strong>{' '}
          when you ask for more or decline. Required for both.
        </p>
        <textarea
          id={`note-${application.id}`}
          rows={3}
          maxLength={4000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="WWCC verified 6 Aug, expires 2029. AHPRA current."
          className="mt-1.5 w-full rounded-btn border border-border bg-background px-3 py-2 text-sm text-foreground"
        />

        {/* WHY A BUTTON IS UNAVAILABLE IS WRITTEN DOWN, NOT PUT IN A TOOLTIP.
            These carried the reason in `title` alone, which reaches nobody who
            needs it most: a disabled button is not focusable, so a keyboard or
            screen-reader user meets a greyed control with no explanation and
            no way to ask for one. A `title` is also invisible on touch.

            The reasons are rendered as text and tied to the buttons with
            aria-describedby, so they are read out and readable by everybody. */}
        {blockedReasons.length > 0 && (
          <ul
            id={`blockers-${application.id}`}
            className="mt-3 space-y-1 text-sm text-muted-foreground"
          >
            {blockedReasons.map((reason) => (
              <li key={reason}>· {reason}</li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {DECISIONS.filter((d) => d.value !== application.status).map(
            (decision) => {
              const blocked =
                (decision.needsNote && !note.trim()) ||
                (decision.value === 'approved' && !screened)

              return (
                <button
                  key={decision.value}
                  type="button"
                  disabled={decide.isPending || blocked}
                  aria-describedby={
                    blocked ? `blockers-${application.id}` : undefined
                  }
                  onClick={() => decide.mutate(decision.value)}
                  /*
                    THREE WEIGHTS, BECAUSE THESE ARE THREE KINDS OF ACT.
                    Approve was already solid and the other three shared one
                    outline — so refusing somebody permission to work with
                    children looked exactly like ticking "I'm checking this".

                    Declining is red-edged rather than solid: a real outcome,
                    reachable, but never the easiest thing on the card to hit.
                    "I'm checking this" and "Ask for more" stay neutral, because
                    both are notes on an open conversation rather than the end
                    of one.
                  */
                  className={`rounded-btn px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
                    decision.value === 'approved'
                      ? 'bg-primary text-primary-foreground'
                      : decision.value === 'declined'
                        ? 'border border-danger text-danger-foreground'
                        : 'border border-border text-foreground'
                  }`}
                >
                  {decision.label}
                </button>
              )
            },
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Approving admits them to the network. It does not create an account or
          attach them to a school — that happens when a school invites them, and
          the invitation will show that Special Miles vetted them.
        </p>
      </div>
    </li>
  )
}

export default function Applications() {
  const [tab, setTab] = useState<ApplicationStatus | 'all'>('new')

  const applications = useQuery({
    queryKey: queryKeys.specialistApplications(tab),
    queryFn: () => fetchSpecialistApplications(tab),
  })

  const counts = useQuery({
    queryKey: queryKeys.queueCounts('specialist_applications'),
    queryFn: () =>
      fetchQueueCounts('specialist_applications', [
        'new',
        'in_review',
        'more_needed',
        'approved',
        'declined',
      ]),
  })

  return (
    <div>
      <PageHeader
        title="Specialist applications"
        lead="Practitioners asking to join MiZanova. Nobody here has an account — approving admits them, and a school engaging them is what creates one."
      />

      <QueueTabs
        name="application-status"
        tabs={TABS}
        value={tab}
        onChange={setTab}
        counts={counts.data}
      />

      {applications.isPending && <LoadingCards count={3} />}
      {applications.isError && (
        <ErrorState
          message={applications.error.message}
          onRetry={() => void applications.refetch()}
        />
      )}

      {applications.isSuccess && applications.data.length === 0 && (
        <EmptyState
          /* "Nothing here" full stop reads as "nothing exists", which is how
             an empty New tab got mistaken for a broken feature. When there are
             applications in other tabs, this says so. */
          title={
            counts.data && counts.data.all > 0
              ? 'None in this tab'
              : 'No applications yet'
          }
          detail={
            counts.data && counts.data.all > 0
              ? `There ${counts.data.all === 1 ? 'is' : 'are'} ${counts.data.all} in total — the numbers above show where.`
              : 'Applications from the For Specialists page land here, oldest first. Special Miles is emailed as each one arrives.'
          }
        />
      )}

      {applications.isSuccess && applications.data.length > 0 && (
        <ul className="space-y-4">
          {applications.data.map((application) => (
            <ApplicationCard key={application.id} application={application} />
          ))}
        </ul>
      )}
    </div>
  )
}
