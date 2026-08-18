import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PROFESSIONS,
  deleteSchool,
  fetchAllSchoolKpis,
  fetchSchoolDeletability,
  fetchSchools,
  fetchUnengagedSpecialists,
  queryKeys,
  updateSchoolStatus,
  whatBlocksDeletion,
  type OrganisationKind,
  type OrganisationStatus,
  type SchoolRow,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import AddSchoolSection from '../../components/AddSchoolSection'
import ConfirmDestructive from '../../components/ConfirmDestructive'
import { showToast } from '../../lib/toast'

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
  const queryClient = useQueryClient()
  /*
   * Only CLOSING asks for confirmation. Reopening restores a school to the
   * state it was already in and takes nothing away, so putting it behind the
   * same dialog would be ceremony — and a confirmation that guards harmless
   * things is one people learn to click through.
   */
  const [closing, setClosing] = useState<SchoolRow | null>(null)
  const [deleting, setDeleting] = useState<SchoolRow | null>(null)

  const schools = useQuery({
    queryKey: queryKeys.schools,
    queryFn: fetchSchools,
  })

  /*
   * What is holding each organisation in place — db/060. Only a row of zeros
   * gets a Delete button, and that is a courtesy: four foreign keys and a
   * trigger refuse on their own if this is stale.
   */
  const deletability = useQuery({
    queryKey: queryKeys.schoolDeletability,
    queryFn: fetchSchoolDeletability,
  })

  const remove = useMutation({
    mutationFn: (school: SchoolRow) => deleteSchool(school.id),
    onSuccess: (_result, school) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.schools })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.schoolDeletability,
      })
      setDeleting(null)
      showToast(`${school.name} deleted.`)
    },
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrganisationStatus }) =>
      updateSchoolStatus(id, status),
    onSuccess: (school) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.schools })
      setClosing(null)
      showToast(
        school.status === 'closed'
          ? `${school.name} closed.`
          : `${school.name} reopened as ${STATUS_LABEL[school.status].toLowerCase()}.`,
      )
    },
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

  /*
   * Fails closed by construction: while the query is loading, and if it errors,
   * `find` returns undefined and whatBlocksDeletion answers "still being
   * counted" — a non-empty list, so no Delete button appears. An empty list
   * only ever comes from a row of real zeros.
   */
  const blockersFor = (schoolId: string) =>
    whatBlocksDeletion((deletability.data ?? []).find((d) => d.id === schoolId))

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
                <th scope="col" className="px-5 py-3 text-sm font-semibold">
                  <span className="sr-only">Actions</span>
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
                    {/* A school leaves by being CLOSED, never by being
                        deleted. Four tables reference it `on delete restrict`,
                        so Postgres would refuse anyway — and it should: the
                        rows pointing at it are children's records. */}
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {school.status === 'closed' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setStatus.reset()
                              setStatus.mutate({
                                id: school.id,
                                status: 'active',
                              })
                            }}
                            disabled={setStatus.isPending}
                            className="px-2 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
                          >
                            Reopen
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setStatus.reset()
                              setClosing(school)
                            }}
                            className="rounded-btn border border-danger px-3 py-1.5 text-sm font-semibold text-danger-foreground"
                          >
                            Close
                          </button>
                        )}

                        {/* Only when nothing at all belongs to it. A disabled
                            Delete on every populated row would be a permanent
                            invitation to hunt for the way to enable it, and
                            there is not one — that is the point.

                            QUIETER THAN Close, not louder. Rendered solid red
                            it was the most eye-catching thing on the page, so
                            the row's most destructive and least-often-right
                            action was the one being advertised. Solid red
                            belongs on the confirm button inside the dialog,
                            where it is what the person came to do. */}
                        {blockersFor(school.id).length === 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              remove.reset()
                              setDeleting(school)
                            }}
                            className="px-2 text-sm font-semibold text-danger-foreground hover:underline"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <ConfirmDestructive
          title={`Delete ${deleting.name}?`}
          detail="This removes the organisation itself. It is offered only because nothing belongs to it — no students, no people, no memberships, no resources, no invoices."
          consequences={[
            (() => {
              const pending =
                (deletability.data ?? []).find((d) => d.id === deleting.id)
                  ?.invitations ?? 0
              return pending === 0
                ? 'There are no pending invitations to it.'
                : `${pending} pending invitation${pending === 1 ? '' : 's'} to this organisation ${pending === 1 ? 'is' : 'are'} cancelled. Anybody holding one can no longer use it.`
            })(),
            'The row is gone for good. Closing it instead keeps it in this list and can be undone.',
          ]}
          confirmPhrase={deleting.name}
          confirmLabel="Delete permanently"
          pending={remove.isPending}
          error={remove.error?.message ?? null}
          onConfirm={() => remove.mutate(deleting)}
          onCancel={() => {
            remove.reset()
            setDeleting(null)
          }}
        />
      )}

      {/* Reopening has no dialog to carry its error, so it lands here. */}
      {setStatus.isError && closing === null && (
        <p
          role="alert"
          className="mt-3 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
        >
          {setStatus.error.message}
        </p>
      )}

      {closing && (
        <ConfirmDestructive
          title={`Close ${closing.name}?`}
          detail="Closing marks a school as gone. Nothing is deleted — every record stays where it is, and you can reopen it from this page."
          consequences={[
            `${statsFor(closing.id)?.students_active ?? 0} students and ${statsFor(closing.id)?.logs_total ?? 0} behaviour logs belong to this school. All of them are kept.`,
            'Nothing enforces status yet, so its staff can still sign in and open records tomorrow. This changes what Special Miles sees, not what the school can do.',
          ]}
          confirmPhrase={closing.name}
          confirmLabel="Close this school"
          pending={setStatus.isPending}
          error={setStatus.error?.message ?? null}
          onConfirm={() =>
            setStatus.mutate({ id: closing.id, status: 'closed' })
          }
          onCancel={() => {
            setStatus.reset()
            setClosing(null)
          }}
        />
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

      {/* This used to say "MiZanova has no billing system" and that Stripe was
          a later milestone. Both stopped being true at db/020, and a note
          explaining an absence outlives the absence unless somebody goes back
          for it. */}
      <p className="mt-8 max-w-prose text-xs text-muted-foreground">
        No revenue figures here — they live on{' '}
        <Link to="/platform-admin/billing" className="text-primary hover:underline">
          Billing &amp; Revenue
        </Link>
        , summed per school. The original designs for this area also show a
        global threat map; MiZanova collects no threat data, so that would be
        invented.
      </p>
    </div>
  )
}
