import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAllConsents,
  fetchStudents,
  grantConsent,
  queryKeys,
  revokeConsent,
  type ConsentRow,
  type ConsentType,
} from '../../lib/api'
import { CONSENT_COPY, CONSENT_ORDER } from '../../lib/consent'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import NotBuiltYet from '../../components/NotBuiltYet'
import { showToast } from '../../lib/toast'

/**
 * Compliance — docs/Figma Pages Design/Compliance Hub Dashboard.png.
 *
 * WHAT THIS SCREEN IS FOR. Consent was enforced and unreachable: the AI
 * pipeline genuinely refuses without it, and only a parent could record one.
 * A school holding a signed paper form had no way to enter it, so four of five
 * students sat with no consent at all and their teachers got a refusal they
 * could do nothing about. RLS has permitted a school admin to record consent
 * since db/004; the screen was simply never built.
 *
 * WHAT IS DELIBERATELY NOT HERE. The design shows overdue documents, upcoming
 * deadlines, missing signatures, service minutes and therapy delivery
 * percentages, with buttons to draft reports and send reminders. None of that
 * data exists: there are no review cycles, no due dates, no therapy minutes,
 * no report generator and no notification system. Two of them are also things
 * this product deliberately does not do — it records an ACKNOWLEDGEMENT that a
 * document was read, never a signature (db/008). Rather than draw five tiles
 * of invented numbers, the note at the bottom says what is missing.
 */
export default function Compliance() {
  const queryClient = useQueryClient()
  const [recording, setRecording] = useState<string | null>(null)

  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })
  const consents = useQuery({
    queryKey: queryKeys.allConsents,
    queryFn: fetchAllConsents,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.allConsents })
    setRecording(null)
  }

  const record = useMutation({
    mutationFn: (input: { studentId: string; consentType: ConsentType }) =>
      grantConsent({
        ...input,
        // Stored on the row itself. Without it, the record says a member of
        // staff gave consent for a child, which is not what happened and not
        // something a school would want to have to explain later.
        notes: 'Recorded by school staff from a consent given outside MiZanova.',
      }),
    onSuccess: () => {
      invalidate()
      showToast('Consent recorded.')
    },
  })

  const withdraw = useMutation({
    mutationFn: (consentId: string) => revokeConsent(consentId),
    onSuccess: () => {
      invalidate()
      showToast('Consent withdrawn.')
    },
  })

  if (students.isPending || consents.isPending) return <LoadingCards count={3} />
  if (students.isError) return <ErrorState message={students.error.message} />
  if (consents.isError) return <ErrorState message={consents.error.message} />

  const activeFor = (
    studentId: string,
    type: ConsentType,
  ): ConsentRow | undefined =>
    consents.data.find(
      (c) =>
        c.student_id === studentId &&
        c.consent_type === type &&
        c.revoked_at === null,
    )

  const withAi = students.data.filter((s) =>
    activeFor(s.id, 'ai_strategy_generation'),
  ).length
  const withNothing = students.data.filter(
    (s) => !consents.data.some((c) => c.student_id === s.id && !c.revoked_at),
  ).length

  const busy = record.isPending || withdraw.isPending
  const failure = record.error ?? withdraw.error

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Compliance</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          What each family has agreed to, and what is missing.
        </p>
      </header>

      <div className="mb-6 grid gap-5 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Students
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {students.data.length}
          </p>
        </div>
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            AI consent given
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {withAi}
            <span className="text-lg font-medium text-muted-foreground">
              {' '}
              of {students.data.length}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Teachers get no AI suggestions for the rest.
          </p>
        </div>
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            No consent on record
          </p>
          <p
            className={`mt-2 text-4xl font-bold ${
              withNothing > 0 ? 'text-danger-foreground' : 'text-foreground'
            }`}
          >
            {withNothing}
          </p>
        </div>
      </div>

      {/* The same reasoning as the Verification page: the button records that
          something happened in the real world, and does not itself check it. */}
      <div
        role="note"
        className="mb-6 rounded-card border border-warning bg-warning-subtle p-4"
      >
        <p className="text-sm font-semibold text-warning-foreground">
          Recording consent here is an attestation
        </p>
        <p className="mt-1 max-w-prose text-sm text-warning-foreground">
          MiZanova does not see the form a family signed. Tick something here
          only when you hold that consent, given freely and in writing. Your
          account is recorded against it, along with the date and the version of
          the privacy notice. A guardian can withdraw any of it themselves at
          any time.
        </p>
      </div>

      {failure && (
        <p
          role="alert"
          className="mb-4 rounded-card border border-danger bg-danger-subtle p-4 text-sm text-danger-foreground"
        >
          {failure.message}
        </p>
      )}

      {students.data.length === 0 ? (
        <EmptyState
          title="No students to show"
          detail="Students appear here once they are added to your school and your own account is verified."
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card shadow-raised">
          <table className="w-full min-w-[46rem] text-left">
            <caption className="sr-only">
              Consent status for each student, by consent type
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                  Student
                </th>
                {CONSENT_ORDER.map((type) => (
                  <th
                    key={type}
                    scope="col"
                    className="p-4 text-sm font-semibold text-foreground"
                  >
                    {CONSENT_COPY[type].label}
                    {!CONSENT_COPY[type].enforced && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        record only
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.data.map((student) => (
                <tr key={student.id} className="border-b border-border last:border-0">
                  <th
                    scope="row"
                    className="p-4 align-top font-semibold text-foreground"
                  >
                    {student.first_name} {student.last_name}
                    <span className="block text-sm font-normal text-muted-foreground">
                      {student.year_level ? `Year ${student.year_level}` : 'Year —'}
                    </span>
                  </th>

                  {CONSENT_ORDER.map((type) => {
                    const active = activeFor(student.id, type)
                    const key = `${student.id}:${type}`

                    return (
                      <td key={type} className="p-4 align-top">
                        {active ? (
                          <>
                            <span className="block text-sm font-semibold text-success-foreground">
                              ✓ Given
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {new Date(active.granted_at).toLocaleDateString(
                                'en-AU',
                                { day: 'numeric', month: 'short', year: 'numeric' },
                              )}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => withdraw.mutate(active.id)}
                              className="mt-1 text-xs font-semibold text-danger-foreground hover:underline disabled:opacity-60"
                            >
                              Withdraw
                            </button>
                          </>
                        ) : recording === key ? (
                          <div className="rounded-btn bg-warning-subtle p-2">
                            <p className="text-xs text-warning-foreground">
                              Do you hold this consent in writing?
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  record.mutate({
                                    studentId: student.id,
                                    consentType: type,
                                  })
                                }
                                className="rounded-btn bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                              >
                                Yes, record it
                              </button>
                              <button
                                type="button"
                                onClick={() => setRecording(null)}
                                className="rounded-btn border border-border px-2 py-1 text-xs font-semibold text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRecording(key)}
                            className="rounded-btn border border-border px-2 py-1 text-xs font-semibold text-muted-foreground"
                          >
                            Not on record
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NotBuiltYet>
        <p>
          The design for this screen also shows overdue documents, upcoming
          deadlines, missing signatures, service minutes, therapy delivery
          percentages, and buttons to draft reports and send reminders. There
          are no review cycles, due dates or therapy minutes in the database,
          and no report generator, so none of those numbers could be anything
          but invented. Two of them the product deliberately does not do at
          all: MiZanova records that a document was read, never that it was
          signed.
        </p>
      </NotBuiltYet>
    </div>
  )
}
