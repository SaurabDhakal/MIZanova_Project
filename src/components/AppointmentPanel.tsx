import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  billAppointment,
  formatMoney,
  setAppointmentFee,
  cancelAppointment,
  completeAppointment,
  queryKeys,
  rescheduleAppointment,
  type AppointmentRow,
} from '../lib/api'
import { showToast } from '../lib/toast'
import { toLocalDateValue, toLocalInputValue } from '../lib/localTime'
import DictatedTextarea from './DictatedTextarea'
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

type Mode = 'none' | 'reschedule' | 'cancel' | 'complete' | 'fee'

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
  // Dollars in the field, cents in the column. Typing 9500 for $95 is the
  // mistake a raw cents input invites.
  const [fee, setFee] = useState(
    appointment.fee_cents === null ? '' : String(appointment.fee_cents / 100),
  )
  const [dueDate, setDueDate] = useState('')
  const [feeError, setFeeError] = useState<string | null>(null)
  const [shareParents, setShareParents] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const finish = (message: string) => {
    setMode('none')
    setFormError(null)
    void queryClient.invalidateQueries({ queryKey: queryKeys.appointments })
    /*
     * `['sessions']`, NOT `queryKeys.mySessions`. Invalidation matches on a key
     * prefix, and mySessions is `['sessions', 'mine']` while the student page's
     * list is `['sessions', <studentId>]` — so naming the first left the second
     * cached. Completing an appointment wrote a session the child's own record
     * then did not show for the next thirty seconds, which is precisely how
     * long somebody takes to click through and wonder whether it saved.
     */
    void queryClient.invalidateQueries({ queryKey: ['sessions'] })
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
              {/*
                db/073. Quiet, and last. Most school-based therapy is inside
                what the school already pays, so charging is the exception —
                a prominent "Bill this" would make it look like the default.
              */}
              <button
                type="button"
                onClick={() => setMode('fee')}
                className="rounded-btn px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                {appointment.invoice_id
                  ? 'Billed'
                  : appointment.fee_cents === null
                    ? 'Add a fee'
                    : `Fee ${formatMoney(appointment.fee_cents)}`}
              </button>
            </div>
          )}

          {mode === 'fee' && (
            <FeePanel
              appointment={appointment}
              fee={fee}
              setFee={setFee}
              dueDate={dueDate}
              setDueDate={setDueDate}
              error={feeError}
              setError={setFeeError}
              onDone={() => setMode('none')}
              finish={finish}
            />
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
              {/* Dictation, because this form is opened at the end of a session
                  with a child still in the room — see DictatedTextarea. */}
              <DictatedTextarea
                id={`notes-${appointment.id}`}
                label="Clinical notes"
                labelSuffix="— specialists only, never shared"
                rows={3}
                value={clinicalNotes}
                onChange={setClinicalNotes}
              />

              <div className="mt-3">
                <DictatedTextarea
                  id={`summary-${appointment.id}`}
                  label="Summary for others"
                  labelSuffix="— required if you share this"
                  rows={2}
                  value={summary}
                  onChange={setSummary}
                />
              </div>

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


/**
 * What a session costs, and turning that into something payable — db/073.
 *
 * ---------------------------------------------------------------------------
 * TWO STEPS, NOT ONE BUTTON
 * ---------------------------------------------------------------------------
 * Recording a fee and billing for it are separate acts and the screen keeps
 * them separate. A fee is a note about what this session is worth, changeable
 * while nothing has been sent. Billing writes an invoice into the school's
 * ledger, and once that exists the amount is fixed here — db/073 refuses a fee
 * change on a billed appointment rather than letting the two disagree.
 *
 * ---------------------------------------------------------------------------
 * WHY "INCLUDED" IS THE DEFAULT AND HAS ITS OWN BUTTON
 * ---------------------------------------------------------------------------
 * `fee_cents` null means no separate charge, which is the normal case for
 * therapy inside what the school already pays. Clearing the box has to be
 * possible and has to be distinguishable from typing 0 — zero is a session
 * deliberately given free, which is a decision somebody made and a family may
 * ask about. An empty input that silently saved as zero would erase that.
 */
function FeePanel({
  appointment,
  fee,
  setFee,
  dueDate,
  setDueDate,
  error,
  setError,
  onDone,
  finish,
}: {
  appointment: AppointmentRow
  fee: string
  setFee: (v: string) => void
  dueDate: string
  setDueDate: (v: string) => void
  error: string | null
  setError: (v: string | null) => void
  onDone: () => void
  finish: (message: string) => void
}) {
  const billed = appointment.invoice_id !== null

  const save = useMutation({
    mutationFn: (cents: number | null) => setAppointmentFee(appointment.id, cents),
    onSuccess: () => finish('Fee recorded.'),
    onError: (e) => setError(e.message),
  })

  const bill = useMutation({
    mutationFn: () => billAppointment(appointment.id, dueDate || null),
    onSuccess: () =>
      finish('Raised as a draft invoice. The school issues it to the family.'),
    onError: (e) => setError(e.message),
  })

  if (billed) {
    return (
      <div className="mt-4 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          This session has been billed. The invoice is a draft on the
          school&rsquo;s Invoices screen until they issue it, and the amount
          cannot be changed from here — an invoice somebody may already have
          been sent and a fee saying something else would be two answers to one
          question.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-3 rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground"
        >
          Back
        </button>
      </div>
    )
  }

  const amount = Number(fee)
  const valid = fee.trim() === '' || (Number.isFinite(amount) && amount >= 0)

  return (
    <div className="mt-4 border-t border-border pt-4">
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-btn border border-danger bg-danger-subtle p-2.5 text-sm text-danger-foreground"
        >
          {error}
        </p>
      )}

      <label
        htmlFor={`fee-${appointment.id}`}
        className="block text-sm font-medium text-foreground"
      >
        What this session costs the family
      </label>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-muted-foreground">$</span>
        <input
          id={`fee-${appointment.id}`}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          inputMode="decimal"
          placeholder="95"
          className="w-32 rounded-btn border border-border bg-card px-3 py-2 text-foreground"
        />
        <span className="text-sm text-muted-foreground">
          {fee.trim() === ''
            ? 'Included in what the school pays'
            : amount === 0
              ? 'Free, and recorded as a decision'
              : ''}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={save.isPending || !valid}
          onClick={() => {
            setError(null)
            if (!valid) return setError('That is not an amount.')
            save.mutate(fee.trim() === '' ? null : Math.round(amount * 100))
          }}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : 'Save the fee'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground"
        >
          Back
        </button>
      </div>

      {/*
        BILLING IS OFFERED ONLY ONCE A FEE IS SAVED, and against the SAVED
        value rather than what is in the box. db/073 bills `fee_cents` as
        stored, so offering it beside unsaved text would invoice an amount
        different from the one on screen.
      */}
      {appointment.fee_cents !== null && appointment.fee_cents > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Bill the family {formatMoney(appointment.fee_cents)} for this
            session. It arrives as a draft on the school&rsquo;s Invoices
            screen — they issue it, because their name is on it.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label
                htmlFor={`due-${appointment.id}`}
                className="block text-sm font-medium text-foreground"
              >
                Due
              </label>
              <input
                id={`due-${appointment.id}`}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 rounded-btn border border-border bg-card px-3 py-2 text-foreground"
              />
              {/* db/071's lesson, said where the gap would be created rather
                  than reported afterwards. */}
              {dueDate === '' && (
                <p className="mt-1 text-xs text-warning-foreground">
                  With no due date it can never show as overdue.
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={bill.isPending}
              onClick={() => {
                setError(null)
                bill.mutate()
              }}
              className="rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
            >
              {bill.isPending ? 'Raising…' : 'Bill this session'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
