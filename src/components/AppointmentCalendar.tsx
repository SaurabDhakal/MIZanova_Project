import { useMemo, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'

/**
 * The schedule, as month, week or day.
 *
 * WHAT A TIME GRID IMPLIES, AND WHY THE SCREEN SAYS OTHERWISE. A grid of hours
 * reads as a diary: empty space looks like free time and a gap looks bookable.
 * MiZanova records no working hours, so an empty 9am means "nothing is booked",
 * which is a weaker claim than "available". The note at the foot of the
 * Schedule screen says so in as many words, because the grid itself cannot.
 *
 * THE VISIBLE HOURS ARE DERIVED FROM THE DATA, NOT FIXED. A hardcoded
 * 07:00–18:00 window silently hides an appointment booked outside it — the
 * calendar would look empty on a day that has something in it. The bounds below
 * start from a sensible school day and widen to include whatever exists.
 */

const DAY_START_HOUR = 7
const DAY_END_HOUR = 18

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * The least this calendar needs to draw something.
 *
 * `AppointmentRow` satisfies it, and so does the family's narrower view —
 * db/073 gives a guardian no `specialist_id`, because which clinician is on the
 * roster is not a family's business. It is optional here for that reason, and
 * its only use is greying out a colleague's booking, which a parent has none
 * of.
 */
export type CalendarAppointment = {
  id: string
  student_id: string
  starts_at: string
  duration_minutes: number
  status: string
  specialist_id?: string
}

/** The three views the toolbar offers, so a screen can choose where to open. */
export type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'

export default function AppointmentCalendar<T extends CalendarAppointment>({
  appointments,
  nameOf,
  currentUserId,
  selectedId,
  onSelect,
  onPickSlot,
  initialView = 'timeGridWeek',
  allDay = false,
}: {
  appointments: T[]
  nameOf: (studentId: string) => string
  /** Marks the ones this person did not book, so a clash is explicable. */
  currentUserId: string | null
  selectedId: string | null
  /**
   * BOTH HANDLERS ARE OPTIONAL, and that is what makes this readable by a
   * family. A parent may select nothing and book nothing — db/073 gives them
   * SELECT and no more — so leaving these out removes the click affordances
   * rather than wiring them to something that would be refused. A calendar that
   * invites a press it cannot honour is worse than one that does not invite it.
   */
  onSelect?: (appointment: T) => void
  /**
   * Clicking empty space offers to book at that time.
   *
   * `hasTime` is false for a month cell, which is a date and nothing else —
   * FullCalendar reports midnight for it. Passing that on as a start time is
   * how booking from Month view proposed 12:00 AM; what a sensible default
   * looks like is the booking screen's business, not this component's, so the
   * fact is reported rather than guessed at here.
   */
  onPickSlot?: (start: Date, hasTime: boolean) => void
  /**
   * Where the calendar opens. A week of hours is right for a clinician's day
   * and wrong for everybody else: a family has a booking a fortnight, and a
   * teacher's goal dates are spread across a term, so both open on the month
   * and would otherwise land on a week with nothing in it.
   */
  initialView?: CalendarView
  /**
   * The events carry a date and no clock time.
   *
   * A GOAL IS NOT AN APPOINTMENT, AND THE GRID MUST NOT PRETEND IT IS. A target
   * date says which day, never which hour, so drawing one at a time would
   * invent a fact — and at midnight, which is the hour a teacher is least
   * likely to be teaching. All-day events sit in the strip above the grid
   * instead, where a date is all they claim to be.
   */
  allDay?: boolean
}) {
  const calendarRef = useRef<FullCalendar | null>(null)

  const events = useMemo<EventInput[]>(
    () =>
      appointments.map((a) => {
        const start = new Date(a.starts_at)
        const mine = currentUserId === null || a.specialist_id === currentUserId
        return {
          id: a.id,
          title: nameOf(a.student_id),
          start,
          allDay,
          // No end when there is no duration to give it one. Passing
          // start + 0ms produces a zero-length event, which FullCalendar
          // renders as a sliver you cannot click.
          end: allDay
            ? undefined
            : new Date(start.getTime() + a.duration_minutes * 60_000),
          classNames: [
            `fc-appointment--${a.status}`,
            ...(mine ? [] : ['fc-appointment--colleague']),
            ...(selectedId === a.id ? ['fc-appointment--selected'] : []),
          ],
          extendedProps: { appointment: a },
        }
      }),
    [appointments, nameOf, currentUserId, selectedId, allDay],
  )

  /*
   * Widen the visible day to fit whatever is booked. Math.min with a spread of
   * an empty array is the default on its own, so a schedule with nothing in it
   * still gets an ordinary school day rather than a single hour.
   */
  const { minHour, maxHour } = useMemo(() => {
    /*
     * All-day events are midnight to the Date constructor, so measuring them
     * would open the grid at 00:00 and show a teacher seven empty night hours
     * before the school day starts.
     */
    if (allDay) return { minHour: DAY_START_HOUR, maxHour: DAY_END_HOUR }
    const starts = appointments.map((a) => new Date(a.starts_at).getHours())
    const ends = appointments.map((a) => {
      const end = new Date(
        new Date(a.starts_at).getTime() + a.duration_minutes * 60_000,
      )
      return end.getMinutes() > 0 ? end.getHours() + 1 : end.getHours()
    })
    return {
      minHour: Math.max(0, Math.min(DAY_START_HOUR, ...starts)),
      maxHour: Math.min(24, Math.max(DAY_END_HOUR, ...ends)),
    }
  }, [appointments, allDay])

  return (
    <div className="mizanova-calendar rounded-card border border-border bg-card shadow-raised p-3">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={initialView}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        buttonText={{
          today: 'Today',
          month: 'Month',
          week: 'Week',
          day: 'Day',
        }}
        // Monday. Australian school weeks do not start on Sunday.
        firstDay={1}
        allDaySlot={allDay}
        nowIndicator
        height="auto"
        expandRows
        slotMinTime={`${pad(minHour)}:00:00`}
        slotMaxTime={`${pad(maxHour)}:00:00`}
        slotDuration="00:30:00"
        /*
         * A FLOOR, NOT A HEIGHT. At 30-minute slots a 15-minute appointment is
         * half a row — around 15px — and FullCalendar clips its one condensed
         * line of text to nothing legible. Letting a short booking draw taller
         * than its duration is the same trade every calendar makes: being able
         * to read who it is with beats the block being exactly to scale.
         */
        eventMinHeight={34}
        eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
        slotLabelFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
        // Month view renders timed events as a dot plus bare text by default,
        // which would ignore the status colours entirely. Solid blocks keep all
        // three views reading the same way.
        eventDisplay="block"
        dayMaxEvents={3}
        events={events}
        /* Undefined rather than a no-op, so FullCalendar does not add the
           pointer cursor and hover state for a click that does nothing. */
        eventClick={
          onSelect
            ? (arg: EventClickArg) =>
                onSelect(arg.event.extendedProps.appointment as T)
            : undefined
        }
        dateClick={
          onPickSlot
            ? (arg: DateClickArg) => onPickSlot(arg.date, !arg.allDay)
            : undefined
        }
      />
    </div>
  )
}
