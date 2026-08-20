import { useMemo, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { AppointmentRow } from '../lib/api'

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

export default function AppointmentCalendar({
  appointments,
  nameOf,
  currentUserId,
  selectedId,
  onSelect,
  onPickSlot,
}: {
  appointments: AppointmentRow[]
  nameOf: (studentId: string) => string
  /** Marks the ones this person did not book, so a clash is explicable. */
  currentUserId: string | null
  selectedId: string | null
  onSelect: (appointment: AppointmentRow) => void
  /** Clicking empty space offers to book at that time. */
  onPickSlot: (start: Date) => void
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
          end: new Date(start.getTime() + a.duration_minutes * 60_000),
          classNames: [
            `fc-appointment--${a.status}`,
            ...(mine ? [] : ['fc-appointment--colleague']),
            ...(selectedId === a.id ? ['fc-appointment--selected'] : []),
          ],
          extendedProps: { appointment: a },
        }
      }),
    [appointments, nameOf, currentUserId, selectedId],
  )

  /*
   * Widen the visible day to fit whatever is booked. Math.min with a spread of
   * an empty array is the default on its own, so a schedule with nothing in it
   * still gets an ordinary school day rather than a single hour.
   */
  const { minHour, maxHour } = useMemo(() => {
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
  }, [appointments])

  return (
    <div className="mizanova-calendar rounded-card border border-border bg-card shadow-raised p-3">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
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
        allDaySlot={false}
        nowIndicator
        height="auto"
        expandRows
        slotMinTime={`${pad(minHour)}:00:00`}
        slotMaxTime={`${pad(maxHour)}:00:00`}
        slotDuration="00:30:00"
        eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
        slotLabelFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
        dayMaxEvents={3}
        events={events}
        eventClick={(arg: EventClickArg) =>
          onSelect(arg.event.extendedProps.appointment as AppointmentRow)
        }
        dateClick={(arg: DateClickArg) => onPickSlot(arg.date)}
      />
    </div>
  )
}
