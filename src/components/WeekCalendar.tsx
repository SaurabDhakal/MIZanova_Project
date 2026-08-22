import type { AppointmentRow } from '../lib/api'
import { addDays, isSameDay } from '../lib/week'

/**
 * A week of appointments, one column per day.
 *
 * A LIST PER DAY, NOT A TIME GRID, and the difference is honest rather than
 * lazy. A grid with hour rows and blocks positioned by height reads as a
 * diary — empty space means "free", and dragging a block means "move it". This
 * product records no availability at all, so an empty 9am is not a free 9am,
 * it is an unknown one. Drawing the promise without the data behind it is the
 * thing db/059 declined to pretend to.
 *
 * Columns stack on a phone, because seven columns on a 375px screen is four
 * legible days and three slivers.
 */

const STATUS = {
  scheduled: {
    box: 'border-primary bg-primary-subtle',
    text: 'text-foreground',
  },
  completed: {
    box: 'border-success bg-success-subtle',
    text: 'text-success-foreground',
  },
  cancelled: {
    box: 'border-border bg-background',
    text: 'text-muted-foreground line-through',
  },
} as const

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function WeekCalendar({
  weekStart,
  appointments,
  nameOf,
  currentUserId,
  selectedId,
  onSelect,
}: {
  weekStart: Date
  appointments: AppointmentRow[]
  nameOf: (studentId: string) => string
  /** Marks the ones this person did not book, so a clash is explicable. */
  currentUserId: string | null
  selectedId: string | null
  onSelect: (appointment: AppointmentRow) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const forDay = appointments
          .filter((a) => isSameDay(new Date(a.starts_at), day))
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        const isToday = isSameDay(day, today)

        return (
          <div
            key={day.toISOString()}
            className={`rounded-card border p-3 ${
              isToday ? 'border-primary bg-card' : 'border-border bg-card'
            }`}
          >
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {day.toLocaleDateString('en-AU', { weekday: 'short' })}
            </p>
            <p
              className={`text-lg font-bold ${isToday ? 'text-primary' : 'text-foreground'}`}
            >
              {day.getDate()}
              {isToday && <span className="ml-1 text-xs font-semibold">today</span>}
            </p>

            {forDay.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {forDay.map((appointment) => {
                  const look = STATUS[appointment.status]
                  const mine =
                    currentUserId === null ||
                    appointment.specialist_id === currentUserId

                  return (
                    <li key={appointment.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(appointment)}
                        aria-pressed={selectedId === appointment.id}
                        className={`w-full rounded-btn border p-2 text-left ${look.box} ${
                          selectedId === appointment.id
                            ? 'ring-2 ring-ring'
                            : ''
                        }`}
                      >
                        <span
                          className={`block text-xs font-semibold ${look.text}`}
                        >
                          {timeOf(appointment.starts_at)} ·{' '}
                          {appointment.duration_minutes}m
                        </span>
                        <span className={`block text-sm ${look.text}`}>
                          {nameOf(appointment.student_id)}
                        </span>
                        {!mine && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            another specialist
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
