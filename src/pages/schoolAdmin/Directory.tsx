import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  assignStaffToStudent,
  fetchAssignments,
  fetchGuardianLinks,
  fetchParentAccounts,
  fetchSchoolStaff,
  fetchStaffVetting,
  fetchStudents,
  linkGuardian,
  queryKeys,
  removeAssignment,
  unlinkGuardian,
} from '../../lib/api'
import { ROLE_CONFIG } from '../../lib/roles'
import { useAuth } from '../../lib/auth'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import InviteStaffSection from '../../components/InviteStaffSection'
import InviteFamilySection from '../../components/InviteFamilySection'
import ConfirmDestructive from '../../components/ConfirmDestructive'

/**
 * Directory & Access Control - docs/Figma Pages Design/Directory & Access Control.png.
 *
 * TWO COLUMNS FROM THE DESIGN ARE NOT HERE.
 *
 * "Compliance Score 98%" is invented. Nothing in this system computes a
 * per-staff compliance figure, and a percentage next to a person's name that
 * nobody can explain is worse than no column — someone will make a decision
 * with it. Verification status is shown instead, which is real and checkable.
 *
 * The "System Access" toggle claims to instantly revoke platform access. That
 * would mean disabling the account itself, which lives in Supabase auth and
 * needs a service key no browser may hold. A switch that looks like it cuts off
 * access while doing nothing is dangerous on exactly this screen. What IS here
 * instead is real and narrower: removing a staff member's assignment, which
 * genuinely revokes their access to that child's records.
 */

const ASSIGNMENT_LABEL: Record<string, string> = {
  class_teacher: 'Class teacher',
  support: 'Support',
  specialist: 'Specialist',
}

export default function Directory() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'staff' | 'students'>('staff')
  const [search, setSearch] = useState('')

  const [studentId, setStudentId] = useState('')
  const [profileId, setProfileId] = useState('')
  const [assignment, setAssignment] =
    useState<'class_teacher' | 'support' | 'specialist'>('class_teacher')

  const staff = useQuery({
    queryKey: queryKeys.schoolStaff,
    queryFn: fetchSchoolStaff,
  })

  /*
   * WHO VETTED EACH SPECIALIST — db/049.
   *
   * A separate query on purpose. It reads a table this admin cannot see,
   * through a security-definer function that answers one question about their
   * own staff and nothing else. Folding it into fetchSchoolStaff would mean
   * joining `specialist_applications` in a select the browser controls.
   */
  const vetting = useQuery({
    queryKey: queryKeys.staffVetting,
    queryFn: fetchStaffVetting,
  })
  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })
  const assignments = useQuery({
    queryKey: queryKeys.assignments,
    queryFn: fetchAssignments,
  })
  const guardians = useQuery({
    queryKey: queryKeys.guardianLinks,
    queryFn: fetchGuardianLinks,
  })
  const parents = useQuery({
    queryKey: queryKeys.parentAccounts,
    queryFn: fetchParentAccounts,
  })

  const [guardianId, setGuardianId] = useState('')
  const [relationship, setRelationship] = useState('parent')

  /*
   * Both cut somebody off from a child, so both ask first — and one piece of
   * state rather than two, because only one dialog can be open at a time and
   * two booleans could disagree about that.
   *
   * NO TYPED PHRASE ON EITHER. They affect one person and one child and can be
   * put back from this page. Asking somebody to type a name here would make the
   * typing routine, and it needs to still mean something on the screen where it
   * guards a whole school.
   */
  const [confirming, setConfirming] = useState<{
    kind: 'access' | 'guardian'
    id: string
    person: string
    child: string
  } | null>(null)

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments }),
      queryClient.invalidateQueries({ queryKey: queryKeys.guardianLinks }),
    ])

  const link = useMutation({
    mutationFn: () =>
      linkGuardian({
        studentId,
        profileId: guardianId,
        relationship,
        isPrimary: false,
      }),
    onSuccess: invalidate,
  })

  const unlink = useMutation({
    mutationFn: (id: string) => unlinkGuardian(id),
    onSuccess: () => {
      setConfirming(null)
      return invalidate()
    },
  })

  const assign = useMutation({
    mutationFn: () =>
      assignStaffToStudent({ studentId, profileId, assignment }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) => removeAssignment(id),
    onSuccess: () => {
      setConfirming(null)
      return invalidate()
    },
  })

  if (staff.isPending || students.isPending) return <LoadingCards count={3} />
  if (staff.isError) return <ErrorState message={staff.error.message} />
  if (students.isError) return <ErrorState message={students.error.message} />

  const studentList = students.data ?? []

  const all = assignments.data ?? []
  const caseload = (id: string) =>
    all.filter((a) => a.profile_id === id).length

  /**
   * Can this viewer see assignments at all?
   *
   * An unverified admin gets an empty list from RLS, which is NOT the same as
   * "nobody is assigned". Rendering that empty result as "0" would be a
   * confident lie on the one screen where someone might act on it — an admin
   * could conclude nobody has access and start re-assigning staff who already
   * do. Where the answer is unknown, this screen says so.
   */
  const canSeeAssignments =
    profile?.role === 'platform_admin' || profile?.is_verified === true

  const term = search.trim().toLowerCase()
  const visibleStaff = staff.data.filter((p) =>
    term === ''
      ? true
      : `${p.full_name} ${p.email ?? ''} ${ROLE_CONFIG[p.role].label}`
          .toLowerCase()
          .includes(term),
  )

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">
          Directory &amp; access
        </h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Who works at your school, and which students each of them can reach.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['staff', 'students'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={`rounded-btn px-4 py-2 text-sm font-semibold ${
              tab === value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-foreground'
            }`}
          >
            {value === 'staff' ? 'Staff' : 'Students'}
          </button>
        ))}
      </div>

      {/* --- Staff ---------------------------------------------------------- */}
      {tab === 'staff' && (
        <>
          <label htmlFor="staff-search" className="sr-only">
            Search staff
          </label>
          <input
            id="staff-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or role…"
            className="mb-3 w-full max-w-sm rounded-btn border border-border bg-card px-3 py-2.5 text-foreground placeholder:text-muted-foreground"
          />

          {visibleStaff.length === 0 ? (
            <EmptyState
              title="No staff found"
              detail="Staff appear here once their account has been given your school."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border bg-card shadow-raised">
              <table className="w-full text-left">
                <caption className="sr-only">
                  Staff at your school with their role, verification status and
                  caseload
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="px-5 py-3 text-sm font-semibold">
                      Staff member
                    </th>
                    <th scope="col" className="px-5 py-3 text-sm font-semibold">
                      Role
                    </th>
                    <th scope="col" className="px-5 py-3 text-sm font-semibold">
                      Students
                    </th>
                    <th scope="col" className="px-5 py-3 text-sm font-semibold">
                      Verified
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStaff.map((person) => (
                    <tr
                      key={person.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-foreground">
                          {person.full_name || 'Unnamed'}
                        </p>
                        {person.email && (
                          <p className="text-sm text-muted-foreground">
                            {person.email}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {ROLE_CONFIG[person.role].label}
                      </td>
                      <td className="px-5 py-3 text-foreground">
                        {canSeeAssignments ? (
                          caseload(person.id)
                        ) : (
                          <>
                            {/* An em-dash with the reason in a `title` reads
                                as nothing at all: a span is not focusable, so
                                the tooltip never fires for a keyboard or
                                screen-reader user, who is left with a stray
                                dash. The dash is hidden and the reason is
                                said. */}
                            <span aria-hidden="true" className="text-muted-foreground">
                              —
                            </span>
                            <span className="sr-only">
                              Hidden until your own account is verified
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {person.is_verified ? (
                          <span className="rounded-btn bg-success-subtle px-2.5 py-1 text-sm font-semibold text-success-foreground">
                            ✓ Verified
                          </span>
                        ) : (
                          <span className="rounded-btn bg-warning-subtle px-2.5 py-1 text-sm font-semibold text-warning-foreground">
                            Awaiting verification
                          </span>
                        )}

                        {/* HOW THEY GOT HERE, for specialists only.
                            A teacher is verified by their school and there is
                            no second route to distinguish. A specialist has
                            two, and they are not equally checked — see db/049.

                            Rendered only when the query answered. Absent
                            vetting must mean "we asked and they are not on the
                            network", never "we could not ask". */}
                        {person.role === 'specialist' && vetting.isSuccess && (
                          <span
                            className={`mt-1 block w-fit rounded-btn px-2.5 py-1 text-xs font-semibold ${
                              vetting.data[person.id]
                                ? 'bg-primary-subtle text-primary'
                                : 'bg-background text-muted-foreground'
                            }`}
                            title={
                              vetting.data[person.id]
                                ? `Special Miles checked their registration and Working With Children Check on ${new Date(vetting.data[person.id]).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`
                                : 'Your school invited this specialist directly. Special Miles has not checked their registration.'
                            }
                          >
                            {vetting.data[person.id]
                              ? 'Network specialist'
                              : 'Invited by your school'}
                          </span>
                        )}
                        {person.role === 'specialist' && vetting.isError && (
                          <span className="mt-1 block w-fit rounded-btn bg-warning-subtle px-2.5 py-1 text-xs font-semibold text-warning-foreground">
                            Vetting unknown
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            Verification is carried out by Special Miles (Platform Admin), not
            by your school.{' '}
            <strong className="font-medium text-foreground">
              Network specialist
            </strong>{' '}
            means Special Miles checked that person&rsquo;s professional
            registration and Working With Children Check at the source before
            admitting them.{' '}
            <strong className="font-medium text-foreground">
              Invited by your school
            </strong>{' '}
            means your school engaged them directly — which is allowed, and
            means those checks are yours to make.
          </p>
        </>
      )}

      {/* --- Students and their access ---------------------------------------- */}
      {tab === 'students' && (
        <>
          <div className="mb-5 rounded-card border border-border bg-card shadow-raised p-5">
            <p className="font-semibold text-foreground">
              Give a staff member access to a student
            </p>
            <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
              Being staff at this school is not enough on its own — this is the
              row that grants access to a particular child&rsquo;s records.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="assign-student"
                  className="block text-sm font-medium text-muted-foreground"
                >
                  Student
                </label>
                <select
                  id="assign-student"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                >
                  <option value="">Choose…</option>
                  {studentList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="assign-staff"
                  className="block text-sm font-medium text-muted-foreground"
                >
                  Staff member
                </label>
                <select
                  id="assign-staff"
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                >
                  <option value="">Choose…</option>
                  {staff.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || 'Unnamed'} ({ROLE_CONFIG[p.role].label})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="assign-type"
                  className="block text-sm font-medium text-muted-foreground"
                >
                  As
                </label>
                <select
                  id="assign-type"
                  value={assignment}
                  onChange={(e) =>
                    setAssignment(
                      e.target.value as 'class_teacher' | 'support' | 'specialist',
                    )
                  }
                  className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                >
                  {Object.entries(ASSIGNMENT_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={!studentId || !profileId || assign.isPending}
              onClick={() => assign.mutate()}
              className="mt-3 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {assign.isPending ? 'Granting…' : 'Grant access'}
            </button>

            {assign.isError && (
              <p role="alert" className="mt-2 text-sm text-danger-foreground">
                {assign.error.message}
              </p>
            )}
          </div>

          {/* --- Guardians ---------------------------------------------- */}
          {/* Separate card from staff on purpose. Connecting an adult to a
              child is the most consequential write in this system, and it
              should not sit one dropdown away from routine staffing. */}
          <div className="mb-5 rounded-card border border-warning bg-card p-5">
            <p className="font-semibold text-foreground">
              Connect a guardian to a student
            </p>
            <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
              This gives that adult access to the child&rsquo;s shared updates,
              goals and messages. Check you have the right person and the right
              child before saving — it is never self-service for a reason.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="guardian-student"
                  className="block text-sm font-medium text-muted-foreground"
                >
                  Student
                </label>
                <select
                  id="guardian-student"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                >
                  <option value="">Choose…</option>
                  {studentList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="guardian-person"
                  className="block text-sm font-medium text-muted-foreground"
                >
                  Guardian account
                </label>
                <select
                  id="guardian-person"
                  value={guardianId}
                  onChange={(e) => setGuardianId(e.target.value)}
                  className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                >
                  <option value="">Choose…</option>
                  {(parents.data?.rows ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || 'Unnamed'}
                      {p.email ? ` — ${p.email}` : ''}
                    </option>
                  ))}
                </select>

                {/* A DROPDOWN CANNOT BE SEARCHED BY THE DATABASE, so when it
                    cannot hold everybody the honest failure is to say so
                    rather than to quietly end at the five hundredth name.
                    Nobody at a normal school will ever see this line. */}
                {parents.data?.hasMore && (
                  <p
                    role="alert"
                    className="mt-1 text-sm font-medium text-danger-foreground"
                  >
                    Showing the first {parents.data.rows.length} of{' '}
                    {parents.data.total} parents. If the person you want is not
                    listed, this control cannot reach them yet — tell Special
                    Miles.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="guardian-relationship"
                  className="block text-sm font-medium text-muted-foreground"
                >
                  Relationship
                </label>
                <select
                  id="guardian-relationship"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                >
                  {['parent', 'mother', 'father', 'carer', 'guardian', 'other'].map(
                    (r) => (
                      <option key={r} value={r}>
                        {r[0].toUpperCase() + r.slice(1)}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={!studentId || !guardianId || link.isPending}
              onClick={() => link.mutate()}
              className="mt-3 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {link.isPending ? 'Connecting…' : 'Connect guardian'}
            </button>

            {parents.data?.total === 0 && parents.isSuccess && (
              <p className="mt-2 text-sm text-muted-foreground">
                No parent accounts linked to your school yet. A parent appears
                here once a child of theirs at your school is connected to
                them — db/052.
              </p>
            )}

            {link.isError && (
              <p role="alert" className="mt-2 text-sm text-danger-foreground">
                {link.error.message}
              </p>
            )}
          </div>

          {assignments.isPending && <LoadingCards count={2} />}
          {assignments.isError && (
            <ErrorState message={assignments.error.message} />
          )}

          {assignments.isSuccess && (
            <ul className="space-y-4">
              {studentList.map((student) => {
                const mine = all.filter((a) => a.student_id === student.id)
                return (
                  <li
                    key={student.id}
                    className="rounded-card border border-border bg-card shadow-raised p-4"
                  >
                    <p className="font-semibold text-foreground">
                      {student.first_name} {student.last_name}
                      {canSeeAssignments && (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          seen by {mine.length} staff member
                          {mine.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </p>

                    {!canSeeAssignments ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Existing access is hidden until your own account is
                        verified. Do not assume nobody is assigned.
                      </p>
                    ) : mine.length === 0 ? (
                      <p className="mt-2 text-sm text-warning-foreground">
                        Nobody is assigned — no teacher can see this student.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {mine.map((a) => (
                          <li
                            key={a.id}
                            className="flex flex-wrap items-center gap-2 text-sm"
                          >
                            <span className="text-foreground">
                              {a.profiles?.full_name || 'Unnamed'}
                            </span>
                            <span className="rounded-btn bg-background px-2 py-0.5 text-xs text-muted-foreground">
                              {ASSIGNMENT_LABEL[a.assignment]}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                remove.reset()
                                setConfirming({
                                  kind: 'access',
                                  id: a.id,
                                  person: a.profiles?.full_name || 'This person',
                                  child: student.first_name,
                                })
                              }}
                              disabled={remove.isPending}
                              className="ml-auto text-xs font-semibold text-danger-foreground hover:underline disabled:opacity-60"
                            >
                              Remove access
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Guardians for this child */}
                    {canSeeAssignments && (
                      <div className="mt-3 border-t border-border pt-3">
                        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          Guardians
                        </p>
                        {(() => {
                          /*
                           * "NO GUARDIAN CONNECTED" IS A CLAIM, SO IT WAITS
                           * FOR AN ANSWER.
                           *
                           * This filtered `guardians.data ?? []`, so a failed
                           * lookup — and every render before the first one
                           * returned — produced an empty list and printed, in
                           * warning colour, that this child's family cannot
                           * see anything. About every child in the school at
                           * once, to the one person who would act on it by
                           * re-inviting families that are already connected.
                           *
                           * Same fault as the five parent screens that told a
                           * family "no child is linked to your account" when
                           * the query had merely failed, pointed the other way.
                           */
                          if (!guardians.isSuccess) {
                            return (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {guardians.isError
                                  ? 'Could not be loaded, so this is unknown rather than none.'
                                  : 'Loading…'}
                              </p>
                            )
                          }
                          const theirs = guardians.data.filter(
                            (g) => g.student_id === student.id,
                          )
                          if (theirs.length === 0) {
                            return (
                              <p className="mt-1 text-sm text-warning-foreground">
                                No guardian connected — this child&rsquo;s family
                                cannot see anything.
                              </p>
                            )
                          }
                          return (
                            <ul className="mt-1 space-y-1.5">
                              {theirs.map((g) => (
                                <li
                                  key={g.id}
                                  className="flex flex-wrap items-center gap-2 text-sm"
                                >
                                  <span className="text-foreground">
                                    {g.profiles?.full_name || 'Unnamed'}
                                  </span>
                                  <span className="rounded-btn bg-background px-2 py-0.5 text-xs text-muted-foreground">
                                    {g.relationship}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      unlink.reset()
                                      setConfirming({
                                        kind: 'guardian',
                                        id: g.id,
                                        person:
                                          g.profiles?.full_name ||
                                          'This guardian',
                                        child: student.first_name,
                                      })
                                    }}
                                    disabled={unlink.isPending}
                                    className="ml-auto text-xs font-semibold text-danger-foreground hover:underline disabled:opacity-60"
                                  >
                                    Disconnect
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )
                        })()}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {/* While the dialog is open it carries the failure, next to the
              button that caused it. Twice would read as two faults. */}
          {unlink.isError && confirming === null && (
            <p role="alert" className="mt-3 text-sm text-danger-foreground">
              {unlink.error.message}
            </p>
          )}

          {remove.isError && confirming === null && (
            <p role="alert" className="mt-3 text-sm text-danger-foreground">
              {remove.error.message}
            </p>
          )}
        </>
      )}

      {/* Below the staff list on purpose: "who is here" is the question this
          page answers, and "add someone" is what you do about the answer. */}
      {tab === 'staff' && <InviteStaffSection />}

      {/* Families belong under Students, because a family account is access to
          a particular child rather than to the school. */}
      {tab === 'students' && <InviteFamilySection />}

      {confirming &&
        (confirming.kind === 'access' ? (
          <ConfirmDestructive
            title={`Remove ${confirming.person}'s access to ${confirming.child}?`}
            detail={`They stay on staff at this school. This only ends their access to this one child.`}
            consequences={[
              `They immediately stop seeing ${confirming.child}'s behaviour logs, goals, plans and messages.`,
              'Anything they already wrote stays on the record.',
              'You can assign them again from this page.',
            ]}
            confirmLabel="Remove access"
            pending={remove.isPending}
            error={remove.error?.message ?? null}
            onConfirm={() => remove.mutate(confirming.id)}
            onCancel={() => {
              remove.reset()
              setConfirming(null)
            }}
          />
        ) : (
          <ConfirmDestructive
            title={`Disconnect ${confirming.person} from ${confirming.child}?`}
            detail="This is a family losing sight of their child. Check the name above before you go on."
            consequences={[
              `They immediately lose all updates, goals and messages about ${confirming.child}.`,
              'Messages they have already sent remain, and staff can still read them.',
              'Their account stays. Reconnecting means linking them again or issuing a new access code.',
            ]}
            confirmLabel="Disconnect guardian"
            pending={unlink.isPending}
            error={unlink.error?.message ?? null}
            onConfirm={() => unlink.mutate(confirming.id)}
            onCancel={() => {
              unlink.reset()
              setConfirming(null)
            }}
          />
        ))}
    </div>
  )
}
