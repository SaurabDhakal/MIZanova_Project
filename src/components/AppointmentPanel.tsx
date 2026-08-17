import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  cancelAppointment,
  completeAppointment,
  queryKeys,
  rescheduleAppointment,
  type AppointmentRow,
} from '../lib/api'
import { showToast } from '../lib/toast'
import { toLocalDateValue, toLocalInputValue } from '../lib/week'
import FormField from './FormField'

/**
 * What can be done to one booked appointment.
 *
 * COMPLETING IT WRITES A SESSION, which is the point of the whole feature — an
 * appointment marked done with nothing behind it would leave the delivered
 * minutes on this screen counting something that never got recorded. db/059
 * refuses that combination outright, so this form asks for the summary at the
 * moment the specialist is closing the appointment rather than hoping they
 * open the student's page later.
 *
 * It asks for the summary and notes only. Trials and the goal link live with
 * the rest of the clinical record on the student's page — a second form
 * collecting half of it is how one session ends up as two half-records.
 */

const DURATIONS = [15, 30, 45, 60, 90]

type Mode = 'none' | 'reschedule' | 'cancel' | 'complete'

export default function AppointmentPanel({
  appointment,
  studentName,
  mine,
  onDone,
}: {
  appointment: AppointmentRow
  studentName: string
  mine: boolean
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>('none')
  const [startsAt, setStartsAt] = useState(() =>
    toLocalInputValue(new Date(appointment.starts_at)),
  )
  const [duration, setDuration] = useState(String(appointment.duration_minutes))
  const [reason, setReason] = useState('')
  const [summary, setSummary] = useState('')
  const [clinicalNotes, setClinicalNotes] = useState('')
  const [shareTeacher, setShareTeacher] = useState(false)
  const [shareParents, setShareParents] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const finish = (message: string) => {
    setMode('none')
    setFormError(null)
    void queryClient.invalidateQueries({ queryKey: queryKeys.appointments })
    void queryClient.invalidateQueries({ queryKey: queryKeys.mySessions })
    showToast(message)
    onDone()
  }

  const reschedule = useMutation({
    mutationFn: () =>
      rescheduleAppointment(
        appointment.id,
        new Date(startsAt).toISOString(),
        Number(duration),
      ),
    onSuccess: () => finish('Appointment moved.'),
    onError: (error: Error) => setFormError(error.message),
  })

  const cancel = useMutation({
    mutationFn: () => cancelAppointment(appointment.id, reason),
    onSuccess: () => finish('Appointment cancelled.'),
    onError: (error: Error) => setFormError(error.message),
  })

  const complete = useMutation({
    mutationFn: () =>
      completeAppointment({
        appointmentId: appointment.id,
        studentId: appointment.student_id,
        sessionDate: toLocalDateValue(new Date(appointment.starts_at)),
        durationMinutes: appointment.duration_minutes,
        clinicalNotes,
        sharedSummary: summary,
        shareWithTeacher: shareTeacher,
        shareWithParents: shareParents,
      }),
    onSuccess: () => finish('Session recorded and appointment closed.'),
    onError: (error: Error) => setFormError(error.message),
  })

  function submitComplete(event: React.FormEvent) {
    event.preventDefault()
    // Checked here so the answer is immediate, and again by db/028's trigger so
    // it is true.
    if ((shareTeacher || shareParents) && summary.trim() === '') {
      return setFormError(
        'Write a summary before sharing. Your clinical notes are never shared, so the summary is all they will see.',
      )
    }
    setFormError(null)
    complete.mutate()
  }

  const when = new Date(appointment.starts_at).toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  })

  const busy = reschedule.isPending || cancel.isPending || complete.isPending

  return (
    <div className="rounded-card border border-border bg-card shadow-raised p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <p className="font-bold text-foreground">{studentName}</p>
          <p className="text-sm text-muted-foreground">
            {when} · {appointment.duration_minutes} minutes
          </p>
          {appointment.purpose && (
            <p className="mt-1 text-sm text-foreground">{appointment.purpose}</p>
          )}
        </div>
        <span
          className={`ml-auto rounded-btn px-2.5 py-1 text-sm font-semibold ${
            appointment.status === 'completed'
              ? 'bg-success-subtle text-success-foreground'
              : appointment.status === 'cancelled'
                ? 'bg-background text-muted-foreground'
                : 'bg-primary-subtle text-foreground'
          }`}
        >
          {appointment.status}
        </span>
      </div>

      {appointment.status === 'cancelled' && appointment.cancelled_reason && (
        <p className="mt-2 text-sm text-muted-foreground">
          Cancelled: {appointment.cancelled_reason}
        </p>
      )}

      {!mine && appointment.status === 'scheduled' && (
        <p className="mt-3 text-sm text-muted-foreground">
          Booked by another specialist on this child&rsquo;s team. You can see it
          so a clash makes sense; only they can change it.
        </p>
      )}

      {mine && appointment.status === 'scheduled' && (
        <>
          {mode === 'none' && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setMode('complete')}
                className="rounded-btn bg-success-strong px-4 py-2.5 text-sm font-semibold text-white"
              >
                Record session
              </button>
              <button
                type="button"
                onClick={() => setMode('reschedule')}
                className="rounded-btn border border-border px-4 py-2.5 text-sm font-semibold text-foreground"
              >
                Move
              </button>
              <button
                type="button"
                onClick={() => setMode('cancel')}
                className="rounded-btn border border-danger px-4 py-2.5 text-sm font-semibold text-danger-foreground"
              >
                Cancel
              </button>
            </div>
          )}

          {mode === 'reschedule' && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="New start"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
                <div>
                  <label
                    htmlFor="reschedule-duration"
                    className="block text-sm font-semibold text-foreground"
                  >
                    Duration
                  </label>
                  <select
                    id="reschedule-duration"
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
              </div>
              <Actions
                busy={busy}
                confirmLabel={reschedule.isPending ? 'Moving…' : 'Move it'}
                onConfirm={() => reschedule.mutate()}
                onBack={() => setMode('none')}
              />
            </div>
          )}

          {mode === 'cancel' && (
            <div className="mt-4 border-t border-border pt-4">
              <FormField
                label="Why is it being cancelled?"
                hint="Optional, and kept on the record — the appointment is not deleted."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Child unwell"
              />
              <Actions
                busy={busy}
                confirmLabel={cancel.isPending ? 'Cancelling…' : 'Cancel it'}
                onConfirm={() => cancel.mutate()}
                onBack={() => setMode('none')}
                danger
              />
            </div>
          )}

          {mode === 'complete' && (
            <form onSubmit={submitComplete} className="mt-4 border-t border-border pt-4">
              <label
                htmlFor={`notes-${appointment.id}`}
                className="block text-sm font-semibold text-foreground"
              >
                Clinical notes{' '}
                <span className="font-normal text-muted-foreground">
                  — specialists only, never shared
                </span>
              </label>
              <textarea
                id={`notes-${appointment.id}`}
                rows={3}
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                className="mt-1.5 w-full rounded-btn border border-border bg-card p-2.5 text-sm text-foreground placeholder:text-muted-foreground"
              />

              <label
                htmlFor={`summary-${appointment.id}`}
                className="mt-3 block text-sm font-semibold text-foreground"
              >
                Summary for others{' '}
                <span className="font-normal text-muted-foreground">
                  — required if you share this
                </span>
              </label>
              <textarea
                id={`summary-${appointment.id}`}
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="mt-1.5 w-full rounded-btn border border-border bg-card p-2.5 text-sm text-foreground placeholder:text-muted-foreground"
              />

              <div className="mt-3 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={shareTeacher}
                    onChange={(e) => setShareTeacher(e.target.checked)}
                  />
                  Share with the teacher
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={shareParents}
                    onChange={(e) => setShareParents(e.target.checked)}
                  />
                  Share with the family
                </label>
              </div>

              <Actions
                busy={busy}
                confirmLabel={complete.isPending ? 'Saving…' : 'Save session'}
                onBack={() => setMode('none')}
                submit
              />
            </form>
          )}
        </>
      )}

      {formError && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger-foreground">
          {formError}
        </p>
      )}
    </div>
  )
}

function Actions({
  busy,
  confirmLabel,
  onConfirm,
  onBack,
  danger,
  submit,
}: {
  busy: boolean
  confirmLabel: string
  onConfirm?: () => void
  onBack: () => void
  danger?: boolean
  submit?: boolean
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <button
        type={submit ? 'submit' : 'button'}
        onClick={onConfirm}
        disabled={busy}
        className={`rounded-btn px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${
          danger ? 'bg-danger-strong' : 'bg-primary'
        }`}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="rounded-btn border border-border px-4 py-2.5 text-sm font-semibold text-foreground"
      >
        Back
      </button>
    </div>
  )
}
