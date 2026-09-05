import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  fetchChildCareTeam,
  fetchChildGuardians,
  fetchChildOverview,
  fetchSchoolBrief,
  queryKeys,
} from '../../lib/api'
import { ROLE_CONFIG } from '../../lib/roles'
import { useSelectedChild } from '../../hooks/useMyChildren'
import { fullName } from '../../lib/displayName'
import ChildSwitcher from '../../components/ChildSwitcher'
import NoChildYet from '../../components/NoChildYet'
import { ErrorState, LoadingCards } from '../../components/QueryState'

/**
 * About your child — the record, and who can open it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCREEN EXISTS
 * ---------------------------------------------------------------------------
 * Privacy & Consent already lets a family DECIDE who gets access, and there was
 * nowhere showing them who that let in. A parent could grant "Referral to a
 * specialist" and have no way to learn which specialist now reads their child's
 * file. Consent without visibility is a control with no readout.
 *
 * Almost none of this needed a new permission. `student_educators_select` and
 * `student_guardians_select` are both `can_view_student(student_id)`, which a
 * guardian satisfies through `is_guardian_of()` — so the links were readable
 * all along and nothing asked for them. db/085 adds only the two names that
 * were genuinely missing: another guardian of the same child, and the school.
 *
 * ---------------------------------------------------------------------------
 * A FAILED QUERY HERE MUST NEVER READ AS "NOBODY"
 * ---------------------------------------------------------------------------
 * This is the screen where that mistake would be worst. "Who can see my
 * child's record" answered with an empty list, because a request timed out, is
 * a false statement about safeguarding rather than a missing row. Every section
 * below states its own failure in words and none of them falls through to an
 * empty state.
 */

/** `student_educators.assignment`, in the words a family would use. */
const ASSIGNMENT_LABEL: Record<string, string> = {
  class_teacher: 'Class teacher',
  specialist: 'Specialist',
  learning_support: 'Learning support',
  aide: 'Teacher’s aide',
}

function assignmentLabel(value: string | null): string | null {
  if (!value) return null
  return ASSIGNMENT_LABEL[value] ?? sentence(value)
}

/** `guardian` → `Guardian`, `step_parent` → `Step parent`. */
function sentence(value: string): string {
  const words = value.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Whole years, the way anybody says an age out loud. */
function ageFrom(iso: string): number | null {
  const born = new Date(iso)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const monthsIn = now.getMonth() - born.getMonth()
  if (monthsIn < 0 || (monthsIn === 0 && now.getDate() < born.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

function Fact({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border py-3 last:border-0 sm:grid sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground sm:mt-0">{children}</dd>
    </div>
  )
}

/** Not known, said as not known. Never as an em dash on its own. */
function Unknown({ why }: { why: string }) {
  return (
    <span className="text-muted-foreground" title={why}>
      Not known — {why}
    </span>
  )
}

export default function AboutChild() {
  const {
    children,
    child,
    selectChild,
    isPending: childrenPending,
    isError: childrenError,
    error: childrenErrorObject,
  } = useSelectedChild()

  const studentId = child?.id ?? ''

  const overview = useQuery({
    queryKey: queryKeys.childOverview(studentId),
    queryFn: () => fetchChildOverview(studentId),
    enabled: studentId !== '',
  })

  const careTeam = useQuery({
    queryKey: queryKeys.childCareTeam(studentId),
    queryFn: () => fetchChildCareTeam(studentId),
    enabled: studentId !== '',
  })

  const guardians = useQuery({
    queryKey: queryKeys.childGuardians(studentId),
    queryFn: () => fetchChildGuardians(studentId),
    enabled: studentId !== '',
  })

  const schoolId = overview.data?.school_id ?? ''
  const school = useQuery({
    queryKey: queryKeys.schoolBrief(schoolId),
    queryFn: () => fetchSchoolBrief(schoolId),
    enabled: schoolId !== '',
  })

  if (childrenPending) return <LoadingCards count={2} />

  if (childrenError) {
    return (
      <ErrorState
        message={
          childrenErrorObject?.message ??
          'Your children could not be loaded. This is a problem reaching the server, not a change to who is linked to your account.'
        }
      />
    )
  }

  if (!child) return <NoChildYet thing="Your child’s details" />

  const detail = overview.data
  const dob = detail?.date_of_birth ?? null
  const age = dob ? ageFrom(dob) : null

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">About your child</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          What the school has recorded about {fullName(child)}, and everyone who
          can open their record.
        </p>
      </header>

      <ChildSwitcher children={children} child={child} onSelect={selectChild} />

      {/* --- Their details ------------------------------------------------- */}
      <h2 className="mt-8 mb-2 text-lg font-semibold text-foreground">
        Their details
      </h2>

      {overview.isPending && <LoadingCards count={1} />}

      {overview.isError && (
        <ErrorState
          message="Your child’s details could not be loaded. Nothing has changed about their record — this is a problem reaching the server."
          onRetry={() => void overview.refetch()}
        />
      )}

      {overview.isSuccess && (
        <div className="rounded-card border border-border bg-card p-5 shadow-raised">
          <dl>
            <Fact label="Name">{fullName(child)}</Fact>

            <Fact label="Year level">
              {detail?.year_level ? (
                `Year ${detail.year_level}`
              ) : (
                <span className="text-muted-foreground">
                  Not recorded by the school
                </span>
              )}
            </Fact>

            <Fact label="Date of birth">
              {dob ? (
                <>
                  {formatDate(dob)}
                  {age !== null && (
                    <span className="text-muted-foreground"> · {age} years old</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">
                  Not recorded by the school
                </span>
              )}
            </Fact>

            <Fact label="School">
              {school.isPending && schoolId !== '' ? (
                <span className="text-muted-foreground">Loading…</span>
              ) : school.isError ? (
                <Unknown why="the school could not be loaded" />
              ) : school.data ? (
                <>
                  {school.data.name}
                  {school.data.suburb && (
                    <span className="text-muted-foreground">
                      {' · '}
                      {school.data.suburb}
                      {school.data.state ? `, ${school.data.state}` : ''}
                    </span>
                  )}
                </>
              ) : schoolId === '' ? (
                <span className="text-muted-foreground">
                  Not recorded by the school
                </span>
              ) : (
                /* THE RECORD NAMES A SCHOOL AND THE ROW DID NOT COME BACK.
                   Saying "not recorded" here would be the exact fault this
                   screen was written to avoid — a refusal or a failed request
                   rendering as a fact about the child. The id is present; only
                   the row is missing, which is what this says. */
                <Unknown why="the school is on the record but could not be read" />
              )}
            </Fact>

            {/* db/076. The consent for this exists on Privacy & Consent and
                had nowhere to report back to; a family granted it and could
                not tell whether anything followed. */}
            <Fact label="Their own sign-in">
              {detail?.profile_id ? (
                <span className="text-success-foreground">
                  ✓ Set up — they can sign in and see their own goals
                </span>
              ) : (
                <>
                  <span className="text-muted-foreground">Not set up.</span>{' '}
                  A child can have a sign-in of their own that shows their goals
                  and nothing else — no behaviour notes, no plan documents, no
                  messages between adults. Your school issues it, and{' '}
                  <Link
                    to="/parent/privacy"
                    className="font-medium text-primary hover:underline"
                  >
                    your consent
                  </Link>{' '}
                  is recorded first.
                </>
              )}
            </Fact>
          </dl>
        </div>
      )}

      {/* SOMETHING WRONG WITH THESE DETAILS IS A REAL CASE, NOT A HYPOTHETICAL.
          A misspelt name, a date of birth typed wrong at enrolment, a year
          level nobody moved on after the child changed grade — the family is
          the one person who always knows, and `students_update` admits the
          platform admin, a school admin at that school, and staff assigned to
          the child. No guardian branch, deliberately: a record the school is
          accountable for should not be editable by the family it describes.

          But read-only with no way to report an error is a dead end, and this
          screen is where the error gets noticed. So it says who can change it
          and points at the screen that reaches them. */}
      {overview.isSuccess && (
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          Something here not right? These are the school&rsquo;s records and only
          the school can change them, which is what stops anyone else altering
          your child&rsquo;s details.{' '}
          <Link
            to="/parent/messages"
            className="font-medium text-primary hover:underline"
          >
            Message your child&rsquo;s teacher
          </Link>{' '}
          and they will correct it.
        </p>
      )}

      {/* --- Who can see this record ---------------------------------------- */}
      <h2 className="mt-10 mb-2 text-lg font-semibold text-foreground">
        Who can see this record
      </h2>
      <p className="mb-3 max-w-prose text-sm text-muted-foreground">
        Staff are given access by the school, one child at a time — being a
        teacher there is not enough. Your school administrator can also see it,
        and can change who is on this list.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- staff ---- */}
        <section className="rounded-card border border-border bg-card p-5 shadow-raised">
          <h3 className="font-semibold text-foreground">At the school</h3>

          {careTeam.isPending && (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          )}

          {/* NOT an empty list. A failed request here would otherwise say
              nobody at the school can see the record, which is the most
              alarming thing this screen could get wrong. */}
          {careTeam.isError && (
            <p className="mt-2 text-sm text-danger-foreground">
              This list could not be loaded, so it is unknown rather than
              empty. Nobody has been removed.
            </p>
          )}

          {careTeam.isSuccess && careTeam.data.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Nobody is assigned to your child yet. Their teacher is added by
              the school, and until then no staff member can open this record.
            </p>
          )}

          {careTeam.isSuccess && careTeam.data.length > 0 && (
            <ul className="mt-3 space-y-3">
              {careTeam.data.map((person) => {
                const name = person.profiles
                  ? fullName(person.profiles)
                  : null
                const job = assignmentLabel(person.assignment)
                return (
                  <li key={person.profile_id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-foreground">
                      {name ?? <Unknown why="their name could not be loaded" />}
                    </span>
                    {person.profiles && (
                      <span className="text-sm text-muted-foreground">
                        {job ?? ROLE_CONFIG[person.profiles.role].label}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ---- family ---- */}
        <section className="rounded-card border border-border bg-card p-5 shadow-raised">
          <h3 className="font-semibold text-foreground">At home</h3>

          {guardians.isPending && (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          )}

          {guardians.isError && (
            <p className="mt-2 text-sm text-danger-foreground">
              This list could not be loaded, so it is unknown rather than
              empty. Nobody has been removed.
            </p>
          )}

          {guardians.isSuccess && (
            <>
              <ul className="mt-3 space-y-3">
                {guardians.data.map((person) => (
                  <li
                    key={person.profile_id}
                    className="flex flex-wrap items-baseline gap-x-2"
                  >
                    <span className="font-medium text-foreground">
                      {person.profiles ? (
                        fullName(person.profiles)
                      ) : (
                        <Unknown why="their name could not be loaded" />
                      )}
                    </span>
                    {person.relationship && (
                      <span className="text-sm text-muted-foreground">
                        {sentence(person.relationship)}
                      </span>
                    )}
                    {person.is_primary && (
                      <span className="rounded-btn bg-primary-subtle px-2 py-0.5 text-xs font-semibold text-primary">
                        Main contact
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-sm text-muted-foreground">
                Everyone here was given a code by the school and used it once.
                To add or remove somebody, ask the school — it cannot be done
                from this account, so nobody can quietly grant themselves
                access to your child.
              </p>
            </>
          )}
        </section>
      </div>

      <p className="mt-6 max-w-prose text-sm text-muted-foreground">
        What each of these people may actually do with the record is set by{' '}
        <Link
          to="/parent/privacy"
          className="font-medium text-primary hover:underline"
        >
          your privacy and consent choices
        </Link>
        . Two of those are enforced by this software and the rest are recorded
        for the school to honour — that screen says which is which.
      </p>
    </div>
  )
}
