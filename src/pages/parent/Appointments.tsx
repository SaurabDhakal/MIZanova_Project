import { useQuery } from '@tanstack/react-query'
import {
  fetchAppointmentsForChild,
  formatMoney,
  queryKeys,
  type FamilyAppointment,
} from '../../lib/api'
import { useSelectedChild } from '../../hooks/useMyChildren'
import ChildSwitcher from '../../components/ChildSwitcher'
import NoChildYet from '../../components/NoChildYet'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import AppointmentCalendar from '../../components/AppointmentCalendar'
import PageHeader, { PageNote } from '../../components/PageHeader'

/**
 * When your child is being seen — db/073.
 *
 * ---------------------------------------------------------------------------
 * A FAMILY COULD NOT SEE THIS AT ALL
 * ---------------------------------------------------------------------------
 * db/059 built appointments with two readers: the assigned specialist and a
 * platform admin. A child could be booked for speech therapy on Tuesday and
 * nothing in this product told anybody at home. Not hidden on purpose — the
 * policy for a guardian was simply never written, which is the quiet way a gap
 * like this survives, because no screen errors and nothing looks wrong.
 *
 * The brief asks for bookings as a stakeholder-facing feature: "Book
 * consultancy sessions and workshops". Seeing one is the first half of that.
 *
 * ---------------------------------------------------------------------------
 * READ ONLY, AND THAT IS THE DESIGN RATHER THAN A SHORTCUT
 * ---------------------------------------------------------------------------
 * db/073 gives a guardian SELECT and nothing else. Knowing when your child is
 * seen is ordinary; moving a clinician's calendar from a parent's phone is a
 * different thing, and the way to change an appointment is to say so to the
 * person who booked it. The screen says that rather than leaving somebody
 * hunting for a button that cannot exist.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS REVERSES AN EARLIER, DELIBERATE DECISION
 * ---------------------------------------------------------------------------
 * tests/rls/appointments.test.ts asserted the opposite and gave a reason worth
 * taking seriously: telling a family when their child is seen "needs a decision
 * about who promises the time". A time on a parent's screen is an implicit
 * commitment, and nothing emails them when it changes — automated
 * confirmations are blocked on hosting, not on code.
 *
 * The answer is not to label the risk and carry on. It is to remove it: a
 * booking that has been touched since it was made SAYS SO, and every card says
 * the school confirms times. A parent who looked last week can see that this
 * one moved, which is exactly the failure the earlier decision was protecting
 * against — and it is why showing the list is now safe rather than merely
 * useful.
 */

function money(cents: number | null) {
  /*
   * NULL AND ZERO MEAN DIFFERENT THINGS AND MUST NOT RENDER THE SAME.
   * Null is "no separate charge" — the session is inside what the school
   * already pays, which is the normal case. Zero is somebody deliberately
   * charging nothing. A family reading "Free" when the truth is "included"
   * would have the wrong idea about what their school is buying.
   */
  if (cents === null) return 'Included'
  if (cents === 0) return 'No charge'
  return formatMoney(cents)
}

const STATUS_STYLE: Record<FamilyAppointment['status'], string> = {
  scheduled: 'bg-primary-subtle text-primary',
  completed: 'bg-success-subtle text-success-foreground',
  // Not styled as an error. A cancelled session is usually a child being
  // unwell, not something that went wrong with the service.
  cancelled: 'bg-background text-muted-foreground',
}

const STATUS_LABEL: Record<FamilyAppointment['status'], string> = {
  scheduled: 'Booked',
  completed: 'Done',
  cancelled: 'Cancelled',
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function Appointments() {
  const { children, child, selectChild, isPending, isError, error } =
    useSelectedChild()

  const appointments = useQuery({
    queryKey: queryKeys.appointmentsForChild(child?.id ?? ''),
    queryFn: () => fetchAppointmentsForChild(child!.id),
    enabled: Boolean(child),
  })

  if (isPending) return <LoadingCards count={3} />
  if (isError) return <ErrorState message={error?.message ?? 'Could not load.'} />
  if (children.length === 0) return <NoChildYet thing="Appointments" />

  /*
   * "NOW" COMES FROM THE FETCH, NOT FROM RENDER. `Date.now()` here is impure —
   * the lint rule catches it — and it is also subtly wrong: a value read once
   * at mount leaves a screen open overnight still sorting by yesterday, so a
   * session that has since happened stays under "Coming up".
   *
   * `dataUpdatedAt` is the instant React Query last had this data, so the split
   * moves whenever the list is refetched and never drifts from what is shown.
   */
  const now = appointments.dataUpdatedAt
  const rows = appointments.data ?? []
  const upcoming = rows.filter(
    (a) => a.status === 'scheduled' && new Date(a.starts_at).getTime() >= now,
  )
  const past = rows.filter((a) => !upcoming.includes(a))

  return (
    <div>
      <PageHeader
        title="Appointments"
        lead="When a specialist is seeing your child, and what each session costs."
      />

      <ChildSwitcher children={children} child={child} onSelect={selectChild} />

      {appointments.isPending && <LoadingCards count={2} />}
      {appointments.isError && (
        <ErrorState
          message={appointments.error.message}
          onRetry={() => void appointments.refetch()}
        />
      )}

      {appointments.isSuccess && rows.length === 0 && (
        <EmptyState
          title="No appointments yet"
          detail="When a specialist books a session with your child, it appears here. Nothing is scheduled at the moment."
        />
      )}

      {appointments.isSuccess && rows.length > 0 && (
        <>
          {/*
            THE SAME CALENDAR THE SPECIALIST USES, WITH NOTHING TO PRESS.
            A family asking "when is my child being seen" is asking a calendar
            question, and reading it off two stacked lists is work the shape of
            the data should be doing.

            Read-only is not a styling choice: db/073 gives a guardian SELECT
            and nothing else, so `onSelect` and `onPickSlot` are left out
            entirely rather than wired to something the database would refuse.
            Without them the component drops its click affordances, so nothing
            on it invites a press that cannot be honoured — which is the same
            reason this screen has never had a "reschedule" button.

            `currentUserId` is null because a parent is never told which
            clinician is on the roster, so no booking is anybody else's.
          */}
          <div className="mt-6">
            {/* THE MONTH, NOT THE WEEK. A clinician opens on a week because
                their week is full; a family has a session a fortnight, so a
                week grid opens on seven empty days and reads as "nothing is
                booked" when the booking is nine days away. */}
            <AppointmentCalendar
              appointments={rows}
              nameOf={() => child?.display_name ?? 'Your child'}
              currentUserId={null}
              selectedId={null}
              initialView="dayGridMonth"
            />
          </div>

          <h2 className="mt-8 mb-3 text-lg font-semibold text-foreground">
            Coming up{' '}
            <span className="font-normal text-muted-foreground">
              ({upcoming.length})
            </span>
          </h2>
          {upcoming.length === 0 ? (
            <p className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">
              Nothing booked at the moment.
            </p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((a) => (
                <AppointmentCard key={a.id} appointment={a} />
              ))}
            </ul>
          )}

          {past.length > 0 && (
            <>
              <h2 className="mt-8 mb-3 text-lg font-semibold text-foreground">
                Earlier{' '}
                <span className="font-normal text-muted-foreground">
                  ({past.length})
                </span>
              </h2>
              <ul className="space-y-3">
                {past.map((a) => (
                  <AppointmentCard key={a.id} appointment={a} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <PageNote>
        <strong className="font-semibold text-foreground">
          Times can change, and your school confirms them.
        </strong>{' '}
        This list shows what is currently booked rather than a promise — if a
        session has been moved since it was arranged, its card says so. Nothing
        here emails you when that happens yet, so check before you plan around a
        time. This list is also read only: to change or cancel a session, speak
        to the specialist who booked it or to your school, because an
        appointment is a clinician&rsquo;s working day as well as your
        child&rsquo;s. &ldquo;Included&rdquo; means the session is covered by
        what your school already pays and there is nothing for you to pay.
        Anything with a price appears on Collab &amp; Finance once your school
        has issued it, and you pay it there.
      </PageNote>
    </div>
  )
}

function AppointmentCard({ appointment }: { appointment: FamilyAppointment }) {
  const a = appointment
  return (
    <li className="rounded-card border border-border bg-card shadow-raised p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-semibold text-foreground">
          {a.purpose || 'Specialist session'}
        </p>
        <span
          className={`rounded-btn px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[a.status]}`}
        >
          {STATUS_LABEL[a.status]}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">
          {money(a.fee_cents)}
        </span>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        {when(a.starts_at)} · {a.duration_minutes} minutes
        {a.profiles?.full_name ? ` · with ${a.profiles.full_name}` : ''}
      </p>

      {/*
        A MOVED BOOKING ANNOUNCES ITSELF. Without this the new time simply
        replaces the old one and a parent who looked last week has no way to
        know — which is precisely the objection that kept this screen from
        existing at all. A minute of slack because `updated_at` is touched by
        the same statement that inserts the row.
      */}
      {new Date(a.updated_at).getTime() - new Date(a.created_at).getTime() >
        60_000 && (
        <p className="mt-1 text-sm text-warning-foreground">
          Changed since it was arranged — last updated{' '}
          {new Date(a.updated_at).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
          })}
          .
        </p>
      )}

      {/* Said plainly. A cancelled session with no reason reads as somebody
          not turning up, and usually it was a child being unwell. */}
      {a.status === 'cancelled' && a.cancelled_reason && (
        <p className="mt-1 text-sm text-muted-foreground">
          Cancelled — {a.cancelled_reason}
        </p>
      )}
    </li>
  )
}
