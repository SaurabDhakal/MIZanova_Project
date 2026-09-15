import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys, setStudentLeft, type StudentRow } from '../lib/api'
import { useAuth } from '../lib/auth'
import ConfirmDestructive from './ConfirmDestructive'
import Icon from './Icon'
import { showToast } from '../lib/toast'

/**
 * Whether this child is still at the school — db/135.
 *
 * ---------------------------------------------------------------------------
 * THE QUESTION THIS ANSWERS IS "HOW DO I DELETE A STUDENT?"
 * ---------------------------------------------------------------------------
 * They cannot, and they should not be able to. `students` has no DELETE policy
 * and db/004 says why: a child's record carries their behaviour history, goals,
 * IEP plans, consents and invoices, and destroying it would destroy the
 * evidence of what a school did for them.
 *
 * What a school actually needs is for a child who has left to stop appearing on
 * rosters, in dropdowns, in search and in the KPI counts — while every record
 * about them stays exactly where it is. `is_active` has meant precisely that
 * since db/002, and every roster query already filters on it. Nothing could
 * ever write it. This is the door.
 *
 * ---------------------------------------------------------------------------
 * THE BANNER IS FOR EVERYBODY; THE BUTTONS ARE FOR THE OFFICE
 * ---------------------------------------------------------------------------
 * An educator can still reach a departed student's record through an old link,
 * a message thread, or the timeline of a log they wrote. They must be told why
 * the child is not on their roster any more, or the record reads as a bug.
 *
 * Only a school administrator decides that a child has left. An educator is
 * assigned to a student, which is authority over their teaching, not over their
 * enrolment — db/135's function refuses anybody else regardless of what this
 * component chooses to render.
 */
export default function StudentEnrolment({ student }: { student: StudentRow }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<'leave' | 'return' | null>(null)
  const [reason, setReason] = useState('')

  const isOffice =
    profile?.role === 'school_admin' || profile?.role === 'platform_admin'

  const change = useMutation({
    mutationFn: (left: boolean) => setStudentLeft(student.id, left, reason),
    onSuccess: async (_data, left) => {
      // The roster, the search and every count filter on is_active, so all of
      // them are now wrong until they are asked again.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.students }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.studentsIncludingPast,
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.classroomStats }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.student(student.id),
        }),
      ])
      showToast(
        left
          ? `${student.first_name} has been marked as having left. Their record is kept.`
          : `${student.first_name} is back on the roll.`,
      )
      setConfirming(null)
      setReason('')
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const name = `${student.first_name} ${student.last_name}`
  const leftOn = student.left_at
    ? new Date(student.left_at).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <>
      {!student.is_active && (
        /* Stated at the top of the record, not as a quiet grey label. Somebody
           reading this child's history needs to know it stopped, and when. */
        <div className="mt-4 rounded-card border border-warning bg-warning-subtle p-4">
          <div className="flex flex-wrap items-start gap-3">
            <Icon
              name="audit"
              aria-hidden
              className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-warning-foreground">
                {student.first_name} has left the school
                {leftOn ? ` — ${leftOn}` : ''}
              </p>
              {student.left_reason && (
                <p className="mt-0.5 text-sm text-warning-foreground">
                  {student.left_reason}
                </p>
              )}
              <p className="mt-1 text-sm text-warning-foreground">
                Their record, history, plans and invoices are all kept. They no
                longer appear on rosters, in search or in the counts.
              </p>
            </div>

            {isOffice && (
              <button
                type="button"
                onClick={() => setConfirming('return')}
                disabled={change.isPending}
                className="pressable inline-flex min-h-11 shrink-0 items-center rounded-btn border border-warning-foreground px-4 py-2.5 text-sm font-semibold text-warning-foreground disabled:opacity-60"
              >
                They have returned
              </button>
            )}
          </div>
        </div>
      )}

      {student.is_active && isOffice && (
        /* Quiet, and at the foot of the record rather than beside "Log
           behaviour". It is used once per child per several years, and a
           destructive-looking control in the header would be pressed by
           accident far more often than it would be wanted. */
        <button
          type="button"
          onClick={() => setConfirming('leave')}
          className="pressable mt-2 inline-flex min-h-11 items-center gap-2 rounded-btn px-3 text-sm font-medium text-muted-foreground hover:text-danger-foreground hover:underline"
        >
          <Icon name="audit" aria-hidden className="h-4 w-4" />
          {student.first_name} has left the school
        </button>
      )}

      {confirming === 'leave' && (
        <ConfirmDestructive
          title={`Record that ${name} has left?`}
          detail={`They will come off the roll. Nothing about them is deleted — this is how a school removes a child from its lists without losing the record of what it did for them.`}
          consequences={[
            'Removed from rosters, dropdowns, search and the KPI counts.',
            'Behaviour history, goals, education plans, consents and invoices are all kept and still readable on this page.',
            'Unpaid invoices are still owed and still listed.',
          ]}
          note={{
            label: 'Why are they leaving?',
            placeholder: 'Moved to Queensland. Finished Year 6.',
            value: reason,
            onChange: setReason,
          }}
          confirmLabel="They have left"
          pending={change.isPending}
          error={change.error?.message ?? null}
          onConfirm={() => change.mutate(true)}
          onCancel={() => {
            change.reset()
            setReason('')
            setConfirming(null)
          }}
        />
      )}

      {confirming === 'return' && (
        <ConfirmDestructive
          title={`Put ${name} back on the roll?`}
          detail={`They will appear on rosters and in search again, and staff assigned to them can log observations.`}
          consequences={[
            'The leaving date and reason are cleared.',
            'The change is recorded in the audit log, so the history of it is not lost.',
          ]}
          tone="primary"
          confirmLabel="They have returned"
          pending={change.isPending}
          error={change.error?.message ?? null}
          onConfirm={() => change.mutate(false)}
          onCancel={() => {
            change.reset()
            setConfirming(null)
          }}
        />
      )}
    </>
  )
}
