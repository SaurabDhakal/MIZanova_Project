import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchIepPlans, fetchStudent, queryKeys } from '../../lib/api'
import GoalsSection from '../../components/GoalsSection'
import StudentTimeline from '../../components/StudentTimeline'
import GuardianAccessSection from '../../components/GuardianAccessSection'
import IepDocumentsSection from '../../components/IepDocumentsSection'
import SessionsSection from '../../components/SessionsSection'
import { EmptyState, ErrorState } from '../../components/QueryState'
import { useAuth } from '../../lib/auth'
import { pathForRole } from '../../lib/roles'
import BehaviourLogModal from '../../components/BehaviourLogModal'
import StudentEnrolment from '../../components/StudentEnrolment'
import { EnrolmentContext } from '../../lib/enrolment'
import Spinner from '../../components/Spinner'
import Icon from '../../components/Icon'
import Avatar from '../../components/Avatar'
import BehaviourPatterns from '../../components/BehaviourPatterns'
import StudentProfileCard from '../../components/StudentProfileCard'
import EducatorSchoolContext from '../../components/EducatorSchoolContext'

/**
 * Whether this child has a plan, and whether its review has gone past.
 *
 * A HEADER FACT RATHER THAN A CARD SOMEWHERE BELOW, because it changes what a
 * teacher does with everything else on the page: a goal on a child with an
 * agreed plan is being worked towards something, and a goal on a child without
 * one is a teacher's own note.
 *
 * "Overdue" is only claimed while a plan is live. A closed plan whose review
 * date has passed was reviewed — that is what closed it — and calling that
 * overdue would invent an obligation nobody has. Same rule as the plan list.
 */
function PlanStatus({ studentId }: { studentId: string }) {
  const plans = useQuery({
    queryKey: queryKeys.iepPlans(studentId),
    queryFn: () => fetchIepPlans(studentId),
  })

  if (plans.isPending) return <span className="text-muted-foreground">…</span>
  // A failure here must not be reported as "no plan" — that is a claim about
  // the child, and this only knows something about the request.
  if (plans.isError)
    return <span className="text-muted-foreground">unknown</span>

  const current = plans.data.find(
    (p) => p.status === 'agreed' || p.status === 'in_review',
  )
  if (!current) {
    return plans.data.length === 0 ? (
      <span className="text-muted-foreground">None yet</span>
    ) : (
      <span className="text-muted-foreground">Draft</span>
    )
  }

  const due = current.proposed_review_date
  const overdue =
    due != null &&
    new Date(due).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0)

  return (
    <span
      className={`inline-flex rounded-btn px-2 py-0.5 text-sm font-semibold ${
        overdue
          ? 'bg-danger-subtle text-danger-foreground'
          : 'bg-success-subtle text-success-foreground'
      }`}
    >
      {overdue ? 'Review overdue' : 'Agreed'}
    </span>
  )
}

/**
 * One student's behaviour history.
 *
 * Note there is no route guard here beyond the educator section's own. If you
 * paste another school's student id into the URL, `fetchStudent` returns null
 * — not because this page checked, but because Row-Level Security refused. The
 * "not found" state below is doing double duty as the access-denied state, and
 * that is deliberate: telling someone a record exists but they may not see it
 * is itself a disclosure.
 */
export default function StudentDetail() {
  const { studentId = '' } = useParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  // Shared by educators and specialists, so the "back" link has to follow
  // whoever is looking rather than always pointing at /educator. The label
  // follows too — a link that says "All students" but lands on Caseload is a
  // small lie, and small lies about navigation are how people get lost.
  // Now shared by three roles. The specialist's list is their caseload; the
  // educator's and the school admin's are both called Students, and RLS is
  // what makes those different lists.
  const isSpecialist = profile?.role === 'specialist'

  /*
   * WHO MAY EDIT THE PROFILE — db/127, and NOT the same question as who may log.
   *
   * The first version passed `canLogBehaviour`, which is educator-or-specialist,
   * so a school administrator opening a record could read the profile and not
   * touch it — while db/127's policy (`can_staff_view_student`) admits them
   * perfectly well. Borrowing a nearby boolean because it was in scope is how a
   * screen ends up enforcing a rule the database never made.
   */
  const profileEditableByRole =
    profile?.role === 'educator' ||
    profile?.role === 'specialist' ||
    profile?.role === 'school_admin'
  const roleBase = profile ? pathForRole(profile.role) : ''

  /**
   * Who may write an observation.
   *
   * `behaviour_logs_insert` in db/005 requires `is_assigned_staff_for(student)`
   * — an actual assignment row — so an administrator cannot log behaviour no
   * matter what this page offers. Until now it offered it anyway, and the
   * button failed with "new row violates row-level security policy", which
   * reads as a fault rather than a rule.
   *
   * The rule is a good one and worth keeping visible: the person who saw the
   * incident is the person who writes it down. An administrator filing an
   * observation they did not witness is a records-integrity problem even when
   * everyone means well.
   *
   * Editing an existing log — including whether the family sees it — IS theirs
   * to do, and stays. That is `behaviour_logs_update`, which names school
   * admins explicitly.
   */
  const canLogByRole =
    profile?.role === 'educator' || profile?.role === 'specialist'
  const backTo = profile
    ? `${pathForRole(profile.role)}${isSpecialist ? '/caseload' : '/students'}`
    : '/'
  const backLabel = isSpecialist ? 'Caseload' : 'All students'
  const [logging, setLogging] = useState(false)

  const student = useQuery({
    queryKey: queryKeys.student(studentId),
    queryFn: () => fetchStudent(studentId),
  })

  // What happened to suggestions this account is not allowed to read. Without
  // it, "never generated" and "generated and rejected" look identical on
  // screen. A failure here must not take the page down — the history below is
  // still worth showing — so it is read with `.data ?? {}` and nothing else.

  if (student.isPending) return <Spinner label="Loading student" />

  if (student.isError) {
    return (
      <ErrorState
        message={student.error.message}
        onRetry={() => void student.refetch()}
      />
    )
  }

  if (!student.data) {
    return (
      <EmptyState
        title="Student not found"
        detail="This student does not exist, or you are not assigned to them."
      />
    )
  }

  const s = student.data

  /*
   * ROLE, THEN ENROLMENT. Both flags are a question about the person AND a
   * question about the child, and they are answered in that order because the
   * role is known before the record has loaded and the child is not.
   *
   * Nobody can observe a child who is not there, and a departed child's profile
   * is a record of what the school knew rather than a form. db/136 refuses the
   * first outright; it deliberately leaves student_profiles writable, because
   * correcting what was known is not new activity — but nothing here should
   * invite the edit.
   */
  const canEditProfile = profileEditableByRole && s.is_active
  const canLogBehaviour = canLogByRole && s.is_active

  return (
    /*
     * db/135 and db/136. Everything below reads this to decide whether to offer
     * a control that BEGINS something — a goal, a session, a document, a
     * sign-in code. Reading and correcting stay available throughout, which is
     * the whole reason the record is kept rather than deleted.
     *
     * The database refuses those writes regardless; this only stops somebody
     * being invited to attempt one.
     */
    <EnrolmentContext.Provider value={s.is_active}>
      <div>
        <Link
          to={backTo}
          className="min-h-11 -ml-2 inline-flex items-center px-2 text-sm font-medium text-primary hover:underline"
        >
          ← {backLabel}
        </Link>

        {/* KEY FACTS AS LABEL/VALUE PAIRS, not a sentence.
          docs/screenshots for inspiration/Customer.io Web People detail puts
          Status, Last Visited and Signed Up across the top of a record as
          discrete pairs. A sentence reads left to right and has to be finished;
          pairs are scanned, and "does this child have a plan, and is its review
          late" is a question somebody answers in the second before a meeting.

          TWO ROWS ON PURPOSE. All three on one flex row pushed the action onto
          a line of its own at 903px — a laptop — and grew the header to 109px
          of mostly empty space. Name and action share the top line at any
          width; the facts sit under them. */}
        <header className="mt-3">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar
                id={s.id}
                name={`${s.first_name} ${s.last_name}`}
                size="lg"
              />
              <div className="min-w-0">
                <h1 className="text-title text-foreground">
                  {s.first_name} {s.last_name}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Shown to parents as{' '}
                  <span className="font-medium text-foreground">
                    {s.display_name}
                  </span>
                </p>
                <EducatorSchoolContext />
              </div>
            </div>

            {canLogBehaviour ? (
              <button
                type="button"
                onClick={() => setLogging(true)}
                className="pressable min-h-11 shrink-0 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:brightness-110"
              >
                Log behaviour
              </button>
            ) : (
              // Said rather than silently absent: an administrator who cannot
              // find the button should know it is a rule, not a missing feature.
              <p className="max-w-xs shrink-0 text-sm text-muted-foreground">
                Observations are written by the staff assigned to this student.
                You can review, share and edit them below.
              </p>
            )}
          </div>

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <dt className="text-xs text-muted-foreground">Year</dt>
              <dd className="font-medium text-foreground">
                {s.year_level ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Student ID</dt>
              <dd className="font-medium text-foreground">
                {s.external_ref ? `#${s.external_ref}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Education plan</dt>
              <dd className="font-medium">
                <PlanStatus studentId={studentId} />
              </dd>
            </div>
          </dl>

          {/* db/135. Renders a banner when this child has left, and — for the
            office only — the control that records it. Everything else on this
            page keeps working for a departed student; that is the point. */}
          <StudentEnrolment student={s} />
        </header>

        {/* --- One child, one story ----------------------------------------
          Four sections used to live here: shared from home, specialist
          sessions, goals, and behaviour history. They split one child's story
          across four lists ordered BY TYPE, when the question anybody asks is
          ordered BY TIME. Measured before this change: a child with 35
          behaviour logs was 37.8 screens, of which behaviour history alone was
          33.2, and a child with NO data was still 2.4 screens of five separate
          empty states.

          EVENTS LEFT, STATE RIGHT. The timeline holds everything that
          HAPPENED; the right column holds what is TRUE NOW — goals, the plan,
          who is connected. State never grows without bound, so it never needs
          scrolling past. */}
        {/* md, NOT lg — and the state column comes FIRST on a narrow screen.

          `lg` is 1024px, so an iPad in portrait (820px) — the device the
          market research names as the primary one — fell to a single column.
          "About Elsie" then began at 2,286px and Patterns at 2,603px: two and
          a half screens below the timeline they exist to explain.

          Two changes. The breakpoint drops to md (768px) so iPad portrait
          keeps both columns. And below that, `order` puts the standing
          context above the timeline, because the profile and patterns are one
          screen of bounded content while the timeline scrolls without end —
          anything after it is effectively unreachable. */}
        <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] md:items-start">
          <div className="order-2 space-y-5 md:order-1">
            {/* The timeline leads, because a student record is opened to find out
              what has been happening. Goals sit under it — but the timeline now
              shows a recent window with a control to go further back, so
              "Working towards" is reachable rather than nine screens down. It
              was at 6,594px on a child with a long history before that cap. */}
            <StudentTimeline studentId={studentId} />
            <GoalsSection studentId={studentId} />

            {/* -----------------------------------------------------------------
              WHERE A SPECIALIST RECORDS A SESSION
              -----------------------------------------------------------------
              Saurab: "where does the specialist record logs during sessions?
              and what sort of system do we have for specialist to save logs?"

              Half of the answer already worked: a session that came from a
              BOOKED appointment is written up from the Schedule — open the
              appointment, "Record session", clinical notes plus a summary you
              choose whether to share. That path is fine.

              The other half was built and then mounted where its user cannot
              stand. `SessionsSection` renders a "+ Log session" button gated on
              `role === 'specialist'`, for the session that never had an
              appointment — the corridor conversation, the unplanned visit, the
              observation squeezed into a free period. It was rendered in
              exactly ONE place: `pages/parent/Progress.tsx`. A specialist has
              no route to that page, so the button existed, was correct, and
              could not be pressed by the only role permitted to press it.

              This is the write-path-with-no-read-path mistake wearing different
              clothes — not a column nothing reads, a CONTROL nobody can reach.
              The component is already role-aware, so mounting it on the record
              a specialist actually opens is the whole fix: they get "+ Log
              session", an educator gets the shared list and no button.
              ----------------------------------------------------------------- */}
            <SessionsSection studentId={studentId} />
          </div>

          <div className="order-1 space-y-5 md:order-2">
            {/* WHAT THE LOGS ADD UP TO, and first in this column on purpose.
              It belongs on the state side by the rule above — it is what is
              TRUE NOW about a child rather than something that happened — and
              it goes at the top because the whole reason it exists is to be
              read without being hunted for. It renders nothing while loading
              or on failure, so it never pushes the plan card down over an
              empty box. */}
            {/* ABOVE THE PATTERNS, because it is the standing description of a
              child and the patterns are what has happened to them. It is also
              the one card a guardian opening this record can read as a
              description rather than a list of incidents. */}
            <StudentProfileCard
              studentId={studentId}
              firstName={s.first_name}
              canEdit={canEditProfile}
            />

            <BehaviourPatterns
              studentId={studentId}
              studentName={s.first_name}
            />

            {/* ONE CARD, NOT TWO. Saurab: "what does even having open plan button
              do and what is iep documents there for?" — a fair question, and
              the answer was that they had no hierarchy between them.

              They are one subject. The PLAN is what the school and family
              agreed, authored here since db/054. The DOCUMENTS are files: a PDF
              of a plan written before MiZanova existed, or a report from
              outside. Files belong to the plan area, not beside it as a peer,
              so the documents section now lives inside this card under its own
              heading rather than floating as a sibling. */}
            <section className="rounded-card border border-border bg-card p-5 shadow-raised">
              <div className="flex items-center gap-3">
                <span className="inline-flex shrink-0 rounded-btn bg-brand-navy/10 p-2.5 text-brand-navy">
                  <Icon name="compliance" className="h-5 w-5" />
                </span>
                <h2 className="text-section text-foreground">Education plan</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Areas of concern, long and short term goals, and who supports{' '}
                {s.first_name}.
              </p>
              <Link
                to={`${roleBase}/students/${studentId}/iep`}
                className="pressable min-h-11 mt-3 inline-flex items-center rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110"
              >
                Open {s.first_name}&rsquo;s plan
              </Link>

              <div className="mt-5 border-t border-border pt-4">
                <IepDocumentsSection studentId={studentId} />
              </div>
            </section>

            {/* Renders nothing except for a school or platform administrator. Who
              a child's guardians are is an office decision, not a classroom
              one. */}
            <GuardianAccessSection studentId={studentId} />
          </div>
        </div>

        {logging && canLogBehaviour && (
          <BehaviourLogModal
            student={s}
            onClose={() => {
              setLogging(false)
              // The timeline is where a new log now appears. Invalidating the
              // old studentLogs key would refresh a query nothing renders.
              void queryClient.invalidateQueries({
                queryKey: ['timeline', studentId],
              })
            }}
          />
        )}
      </div>
    </EnrolmentContext.Provider>
  )
}
