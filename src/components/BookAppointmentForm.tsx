import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { bookAppointment, queryKeys, type StudentRow } from '../lib/api'
import { showToast } from '../lib/toast'
import { toLocalInputValue } from '../lib/week'
import FormField from './FormField'

/**
 * Book a session with a child on the caseload.
 *
 * The clash check is NOT here. Two tabs, two specialists and one retried
 * request all defeat a check written in a browser, so the exclusion
 * constraints in db/059 are what refuse an overlap and this form only has to
 * report what they said. `bookAppointment` translates the constraint name into
 * a sentence — see `describeClash` in lib/api.
 */

const DURATIONS = [15, 30, 45, 60, 90]

export default function BookAppointmentForm({
  students,
  defaultStart,
  onBooked,
}: {
  students: StudentRow[]
  defaultStart: Date
  onBooked: () => void
}) {
  const queryClient = useQueryClient()
  const [studentId, setStudentId] = useState('')
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(defaultStart))
  const [duration, setDuration] = useState('30')
  const [purpose, setPurpose] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const book = useMutation({
    mutationFn: () =>
      bookAppointment({
        studentId,
        startsAt: new Date(startsAt).toISOString(),
        durationMinutes: Number(duration),
        purpose,
      }),
    onSuccess: () => {
      setPurpose('')
      setFormError(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments })
      showToast('Appointment booked.')
      onBooked()
    },
    onError: (error: Error) => setFormError(error.message),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!studentId) return setFormError('Choose which child this is for.')
    if (!startsAt) return setFormError('Choose a date and time.')

    setFormError(null)
    book.mutate()
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-border bg-card shadow-raised p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="appointment-student"
            className="block text-sm font-semibold text-foreground"
          >
            Child
          </label>
          <select
            id="appointment-student"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
          >
            <option value="">Choose a child…</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.first_name} {student.last_name}
              </option>
            ))}
          </select>
        </div>

        <FormField
          label="Starts"
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />

        <div>
          <label
            htmlFor="appointment-duration"
            className="block text-sm font-semibold text-foreground"
          >
            Duration
          </label>
          <select
            id="appointment-duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
          >
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </div>

        <FormField
          label="Purpose"
          hint="Optional. What this session is for."
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Articulation practice — R sounds"
        />
      </div>

      {formError && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger-foreground">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={book.isPending}
        className="mt-4 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
      >
        {book.isPending ? 'Booking…' : 'Book appointment'}
      </button>
    </form>
  )
}
