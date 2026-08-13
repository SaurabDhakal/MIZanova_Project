import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  PROFESSIONS,
  fetchAllSchoolKpis,
  fetchSchools,
  fetchUnengagedSpecialists,
  queryKeys,
  type OrganisationKind,
  type OrganisationStatus,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import AddSchoolSection from '../../components/AddSchoolSection'

/*
 * SUSPENDED AND CLOSED ARE NOT STYLED AS FAILURES. A suspended tenant is a
 * commercial state, not an incident, and colouring it like an error would put
 * red on this page every time somebody stopped paying. Trial is the one worth
 * catching the eye: it is the row with a deadline attached.
 */
const STATUS_STYLE: Record<OrganisationStatus, string> = {
  active: 'bg-success-subtle text-success-foreground',
  trial: 'bg-warning-subtle text-warning-foreground',
  suspended: 'bg-background text-muted-foreground',
  closed: 'bg-background text-muted-foreground',
}

const STATUS_LABEL: Record<OrganisationStatus, string> = {
  active: 'Active',
  trial: 'Trial',
  suspended: 'Suspended',
  closed: 'Closed',
}

const KIND_LABEL: Record<OrganisationKind, string> = {
  school: 'School',
  ecec: 'Early childhood',
  montessori: 'Montessori',
  ndis_provider: 'NDIS provider',
  corporate: 'Corporate',
  practice: 'Practice',
}

/**
 * Schools (tenants) - the Platform Admin's view across every customer.
 *
 * The Figma version of this area shows "$28.4M ARR" and a global threat map.
 * There is no billing system and no threat data, so neither is here. What is
 * here is the operational question Special Miles would actually ask about a
 * school: is anyone answering their safeguarding queue?
 *
 * Every figure comes from school_kpi_overview, the same view a school admin
 * reads. A Platform Admin gets a row per school because RLS lets them see all
 * students; a school admin gets exactly one. Same view, different answers.
 */
export default function Schools() {
  const schools = useQuery({
    queryKey: queryKeys.schools,
    queryFn: fetchSchools,
  })
  /*
   * Specialists the network admitted and nobody engaged. Its own query rather
   * than a filter over the school list, because these people are not IN any
   * school — that is the entire fact being reported.
   */
  const freelancers = useQuery({
    queryKey: queryKeys.unengagedSpecialists,
    queryFn: fetchUnengagedSpecialists,
  })

  const kpis = useQuery({
    queryKey: queryKeys.allSchoolKpis,
    queryFn: fetchAllSchoolKpis,
  })

  if (schools.isPending) return <LoadingCards count={2} />
  if (schools.isError) return <ErrorState message={schools.error.message} />

  const statsFor = (schoolId: string) =>
    (kpis.data ?? []).find((k) => k.school_id === schoolId)

  const totals = (kpis.data ?? []).reduce(
    (acc, k) => ({
      students: acc.students + (k.students_active ?? 0),
      logs: acc.logs + (k.logs_total ?? 0),
      open: acc.open + (k.flagged_open ?? 0),
    }),
    { students: 0, logs: 0, open: 0 },
  )

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Schools</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Every school using MiZanova, and whether anyone is answering their
          safeguarding queue.
        </p>
      </header>

      <div className="mb-6 grid gap-5 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Schools
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {schools.data.length}
          </p>
        </div>
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Students
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {totals.students}
          </p>
        </div>
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Open safeguarding
          </p>
          <p
            className={`mt-2 text-4xl font-bold ${
              totals.open > 0 ? 'text-danger-foreground' : 'text-foreground'
            }`}
          >
            {totals.open}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Across all schools
          </p>
        </div>
      </div>

      <AddSchoolSection />

      {schools.data.length === 0 ? (
        <EmptyState
          title="No schools yet"
          detail="Add one above. It will need an administrator invited before anybody can use it."
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card shadow-raised">
          <table className="w-full text-left">
            <caption className="sr-only">
              Schools with their status, student counts and safeguarding backlog
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-5 py-3 text-sm font-semibold">
                  School
                </th>
                <th scope="col" className="px-5 py-3 text-sm font-semibold">
                  Status
                </th>
                <th scope="col" className="px-5 py-3 text-sm font-semibold">
                  Students
                </th>
                <th scope="col" className="px-5 py-3 text-sm font-semibold">
                  Logs
                </th>
                <th scope="col" className="px-5 py-3 text-sm font-semibold">
                  Open safeguarding
                </th>
                <th scope="col" className="px-5 py-3 text-sm font-semibold">
                  Median response
                </th>
              </tr>
            </thead>
            <tbody>
              {schools.data.map((school) => {
                const k = statsFor(school.id)
                const open = k?.flagged_open ?? 0
                return (
                  <tr
                    key={school.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-5 py-3">
                      {/* The name is the way in. A row of numbers about a
                          school with no way to see WHO is in it was the gap
                          Saurab named. */}
                      <Link
                        to={`/platform-admin/tenants/${school.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {school.name}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {[school.suburb, school.state]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </p>
                    </td>
                    {/* WHAT `is_active` COULD NEVER SAY — db/053. The old
                        boolean was fetched on every load of this page and
                        rendered nowhere, so a tenant on trial and a tenant
                        paying looked identical. */}
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-btn px-2.5 py-1 text-sm font-semibold ${STATUS_STYLE[school.status]}`}
                      >
                        {STATUS_LABEL[school.status]}
                      </span>
                      {school.kind !== 'school' && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {KIND_LABEL[school.kind]}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-foreground">
                      {k?.students_active ?? 0}
                    </td>
                    <td className="px-5 py-3 text-foreground">
                      {k?.logs_total ?? 0}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          open > 0
                            ? 'font-semibold text-danger-foreground'
                            : 'text-muted-foreground'
                        }
                      >
                        {open}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {k?.median_ack_hours == null
                        ? '—'
                        : k.median_ack_hours < 1
                          ? '<1h'
                          : `${Math.round(k.median_ack_hours)}h`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* --- Network specialists nobody has engaged -----------------------
          Saurab asked for specialists split into "works in a school" and
          "freelancer". They are not two kinds of person: a specialist is
          engaged by a school or they is not, and this is the second state.

          THEY ARE NOT ACCOUNTS, and the heading says so. Approval creates no
          account (db/047), so these rows come from `specialist_applications`
          while everything above comes from `profiles`. Two different kinds of
          record on one page is fine as long as the page never pretends
          otherwise. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">
          Network specialists not engaged by any school
          {freelancers.isSuccess && (
            <span className="font-normal text-muted-foreground">
              {' '}
              ({freelancers.data.length})
            </span>
          )}
        </h2>
        <p className="mt-0.5 mb-3 max-w-prose text-sm text-muted-foreground">
          Vetted by Special Miles and working nowhere on the platform. They hold
          no account — one is created when a school invites them — so these are
          applications rather than people the system can otherwise see.
        </p>

        {freelancers.isError && (
          <ErrorState message={freelancers.error.message} />
        )}

        {freelancers.isSuccess && freelancers.data.length === 0 && (
          <p className="rounded-card border border-border bg-card shadow-raised p-5 text-sm text-muted-foreground">
            Every approved specialist is engaged by at least one school.
          </p>
        )}

        {freelancers.isSuccess && freelancers.data.length > 0 && (
          <ul className="space-y-3">
            {freelancers.data.map((person) => (
              <li
                key={person.application_id}
                className="rounded-card border border-border bg-card shadow-raised p-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <p className="font-semibold text-foreground">
                    {person.full_name}
                  </p>
                  <span className="rounded-btn bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {PROFESSIONS[person.profession]}
                  </span>
                  <span className="rounded-btn bg-primary-subtle px-2 py-0.5 text-xs font-semibold text-primary">
                    No account
                  </span>
                  <a
                    href={`mailto:${person.email}`}
                    className="ml-auto text-sm text-primary hover:underline"
                  >
                    {person.email}
                  </a>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Admitted{' '}
                  {new Date(person.approved_at).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 max-w-prose text-xs text-muted-foreground">
        There is no billing or revenue here. The original designs for this area
        show an ARR figure and a global threat map; MiZanova has no billing
        system and collects no threat data, so both would be invented. Stripe
        arrives in a later milestone and this page will gain real numbers then.
      </p>
    </div>
  )
}
