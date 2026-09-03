import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSession,
  fetchGoals,
  fetchSessionNotes,
  saveSessionNotes,
  fetchSessions,
  queryKeys,
  setSessionSharing,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { EmptyState, ErrorState } from './QueryState'
import DictatedTextarea from './DictatedTextarea'
import FormField from './FormField'
import { showToast } from '../lib/toast'

/**
 * Specialist sessions on a student's page — db/028.
 *
 * WHO SEES WHAT is decided entirely by Row-Level Security, not by this
 * component. A specialist sees every session; a teacher sees only those shared
 * with them. The same query returns different rows, which is why there is no
 * role check around the list.
 *
 * The clinical notes are a SEPARATE TABLE and are fetched separately. If a
 * teacher's browser asked for them it would get nothing — the protection is
 * not that this component declines to render them.
 *
 * USED ON TWO PAGES, which is the point. The staff student record, and the
 * family's own Progress page. It was on the staff page only at first, so
 * "Share with the family" set a flag the database honoured and nothing on the
 * family's side ever rendered — a specialist ticking it had been told the
 * family could see it, and they could not.
 */

function SessionNotes({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const notes = useQuery({
    queryKey: ['session-notes', sessionId],
    queryFn: () => fetchSessionNotes(sessionId),
  })

  const save = useMutation({
    mutationFn: () => saveSessionNotes(sessionId, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['session-notes', sessionId],
      })
      setEditing(false)
      setError(null)
      showToast('Clinical note saved.')
    },
    onError: (e) => setError(e.message),
  })

  if (notes.isPending) return null

  /*
   * ABSENT NOTES USED TO RENDER NOTHING AT ALL, and that was the whole problem.
   *
   * createSession writes the session and the note as two statements, and when
   * the second fails it tells the specialist "the session was saved but your
   * clinical notes were not — open the session and add them again". This
   * component returned null whenever there were no notes, so there was nothing
   * to open and no way to add them. db/028 has always permitted both writing
   * and revising; nothing called either.
   */
  const empty = !notes.data

  return (
    <div className="mt-3 rounded-btn bg-background p-3">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Clinical notes — specialists only
      </p>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-btn border border-danger bg-danger-subtle p-2 text-sm text-danger-foreground"
        >
          {error}
        </p>
      )}

      {editing ? (
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim() === '')
              return setError('A clinical note cannot be empty.')
            setError(null)
            save.mutate()
          }}
        >
          <textarea
            aria-label="Clinical notes"
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {/* Said because the equivalent control on a behaviour log carries
                the opposite warning, and the difference is not obvious. */}
            Not shown to the family. What they see is the shared summary above.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded-btn bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-btn border border-border px-3 py-1.5 text-xs font-semibold text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {notes.isError ? (
            /* `empty` is `!notes.data`, which is also true when the query
               FAILED — so a failure said "No clinical note on this session"
               about a clinical record. A specialist reading that could
               conclude a colleague never documented the session and write a
               second note, or act as though nothing had been recorded. */
            <p className="mt-1 text-sm text-warning-foreground">
              The note could not be loaded, so whether one exists is unknown.
            </p>
          ) : empty ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No clinical note on this session.
            </p>
          ) : (
            <p className="mt-1 text-sm whitespace-pre-wrap text-foreground">
              {notes.data}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setDraft(notes.data ?? '')
              setEditing(true)
              setError(null)
            }}
            className="mt-2 text-xs font-semibold text-primary hover:underline"
          >
            {empty ? 'Add a clinical note' : 'Revise this note'}
          </button>
        </>
      )}
    </div>
  )
}

export default function SessionsSection({ studentId }: { studentId: string }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isSpecialist = profile?.role === 'specialist'
  const isParent = profile?.role === 'parent'

  const [open, setOpen] = useState(false)
  const [sessionDate, setSessionDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [duration, setDuration] = useState('30')
  const [goalId, setGoalId] = useState('')
  const [successful, setSuccessful] = useState('')
  const [total, setTotal] = useState('')
  const [clinicalNotes, setClinicalNotes] = useState('')
  const [summary, setSummary] = useState('')
  const [shareTeacher, setShareTeacher] = useState(false)
  const [shareParents, setShareParents] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const sessions = useQuery({
    queryKey: queryKeys.sessions(studentId),
    queryFn: () => fetchSessions(studentId),
  })

  const goals = useQuery({
    queryKey: queryKeys.goals(studentId),
    queryFn: () => fetchGoals(studentId),
    enabled: isSpecialist,
  })

  const save = useMutation({
    mutationFn: () =>
      createSession({
        studentId,
        sessionDate,
        durationMinutes: Number(duration),
        goalId: goalId || null,
        trialsSuccessful: successful === '' ? null : Number(successful),
        trialsTotal: total === '' ? null : Number(total),
        clinicalNotes,
        sharedSummary: summary,
        shareWithTeacher: shareTeacher,
        shareWithParents: shareParents,
      }),
    onSuccess: () => {
      setOpen(false)
      setClinicalNotes('')
      setSummary('')
      setSuccessful('')
      setTotal('')
      setShareTeacher(false)
      setShareParents(false)
      /*
       * The prefix, not this student's key alone. `queryKeys.mySessions` is
       * `['sessions', 'mine']` and feeds the specialist's Schedule — the
       * delivered-minutes figures there stayed on the old numbers after a
       * session was recorded here, because invalidation matches by prefix and
       * `['sessions', <studentId>]` never matches it.
       */
      void queryClient.invalidateQueries({ queryKey: ['sessions'] })
      showToast('Session recorded.')
    },
  })

  const share = useMutation({
    mutationFn: (input: {
      id: string
      teacher: boolean
      parents: boolean
    }) => setSessionSharing(input.id, input),
    // Same prefix, same reason: the Schedule screen badges each session with
    // who it was shared with.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()

    // Checked here so the answer is immediate, and again by the database so it
    // is true. The trigger in db/028 is what actually enforces it.
    if ((shareTeacher || shareParents) && summary.trim() === '') {
      return setFormError(
        'Write a summary before sharing. Your clinical notes are never shared, so the summary is all they will see.',
      )
    }
    if (successful !== '' && total === '') {
      return setFormError('Enter how many attempts there were in total.')
    }
    if (successful !== '' && Number(successful) > Number(total)) {
      return setFormError('Successful attempts cannot exceed the total.')
    }

    setFormError(null)
    save.mutate()
  }

  if (sessions.isError) {
    return <ErrorState message={sessions.error.message} />
  }

  const list = sessions.data ?? []

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          Specialist sessions
        </h2>
        {isSpecialist && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {open ? 'Cancel' : '+ Log session'}
          </button>
        )}
      </div>

      {!isSpecialist && (
        <p className="mb-3 max-w-prose text-sm text-muted-foreground">
          {isParent
            ? 'Sessions the specialist has chosen to share with you, in their own words. Their full clinical notes stay with the specialist team — ask them directly if you would like to know more.'
            : 'Sessions a specialist has chosen to share. Their clinical notes are not shown to anyone outside the specialist team.'}
        </p>
      )}

      {open && (
        <form
          onSubmit={submit}
          className="mb-5 rounded-card border border-border bg-card shadow-raised p-6"
          noValidate
        >
          {(formError || save.isError) && (
            <p
              role="alert"
              className="mb-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
            >
              {formError ?? save.error?.message}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Session date"
              type="date"
              required
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
            <FormField
              label="Duration (minutes)"
              type="number"
              min="1"
              required
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <label
              htmlFor="session-goal"
              className="block text-sm font-semibold text-foreground"
            >
              Targeted goal
            </label>
            <select
              id="session-goal"
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
            >
              <option value="">Not tied to a specific goal</option>
              {(goals.data ?? []).map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. Not every session maps onto one, and forcing a choice
              produces a wrong one.
            </p>
          </div>

          {/* Two counts, not a percentage — see db/028. "8 of 10" and
              "80 of 100" are very different sessions. */}
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold text-foreground">
              Trials (optional)
            </legend>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="number"
                min="0"
                aria-label="Successful attempts"
                placeholder="8"
                value={successful}
                onChange={(e) => setSuccessful(e.target.value)}
                className="w-24 rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
              />
              <span className="text-muted-foreground">of</span>
              <input
                type="number"
                min="1"
                aria-label="Total attempts"
                placeholder="10"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className="w-24 rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
              />
              {successful !== '' && total !== '' && Number(total) > 0 && (
                <span className="font-semibold text-primary">
                  {Math.round((Number(successful) / Number(total)) * 100)}%
                </span>
              )}
            </div>
          </fieldset>

          <div className="mt-4">
            <DictatedTextarea
              id="clinical-notes"
              label="Clinical notes"
              hint="Your professional record. Never shown to teachers, families or school administrators, whatever you share below."
              rows={4}
              value={clinicalNotes}
              onChange={setClinicalNotes}
            />
          </div>

          <div className="mt-4">
            <DictatedTextarea
              id="shared-summary"
              label="Summary for the care team"
              hint="Written by you, for them. Nothing is summarised or redacted automatically — what you type here is exactly what they read."
              rows={3}
              value={summary}
              onChange={setSummary}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shareTeacher}
                onChange={(e) => setShareTeacher(e.target.checked)}
              />
              <span className="text-foreground">Share with the teacher</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shareParents}
                onChange={(e) => setShareParents(e.target.checked)}
              />
              <span className="text-foreground">Share with the family</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={save.isPending}
            className="mt-5 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {save.isPending ? 'Saving…' : 'Save session'}
          </button>
        </form>
      )}

      {sessions.isSuccess && list.length === 0 && (
        <EmptyState
          title="No sessions recorded"
          detail={
            isSpecialist
              ? 'Use Log session to record one. Your clinical notes stay with the specialist team; anything you want the teacher or family to know goes in the summary.'
              : isParent
                ? 'Nothing has been shared with you yet. This does not mean no sessions have happened — only that none have been shared here.'
                : 'A specialist has not shared any sessions for this student.'
          }
        />
      )}

      {list.length > 0 && (
        <ul className="space-y-3">
          {list.map((session) => (
            <li
              key={session.id}
              className="rounded-card border border-border bg-card shadow-raised p-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-foreground">
                  {new Date(session.session_date).toLocaleDateString('en-AU', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
                <span className="text-sm text-muted-foreground">
                  {session.duration_minutes} minutes
                </span>
                {session.trials_total !== null &&
                  session.trials_successful !== null && (
                    <span className="rounded-btn bg-primary-subtle px-2.5 py-1 text-sm font-semibold text-primary">
                      {session.trials_successful} of {session.trials_total} ·{' '}
                      {Math.round(
                        (session.trials_successful / session.trials_total) * 100,
                      )}
                      %
                    </span>
                  )}
              </div>

              {session.shared_summary && (
                <p className="mt-3 whitespace-pre-wrap text-foreground">
                  {session.shared_summary}
                </p>
              )}

              {isSpecialist && <SessionNotes sessionId={session.id} />}

              {isSpecialist && (
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-sm">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={session.shared_with_teacher}
                      disabled={share.isPending}
                      onChange={(e) =>
                        share.mutate({
                          id: session.id,
                          teacher: e.target.checked,
                          parents: session.shared_with_parents,
                        })
                      }
                    />
                    <span className="text-muted-foreground">Teacher</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={session.shared_with_parents}
                      disabled={share.isPending}
                      onChange={(e) =>
                        share.mutate({
                          id: session.id,
                          teacher: session.shared_with_teacher,
                          parents: e.target.checked,
                        })
                      }
                    />
                    <span className="text-muted-foreground">Family</span>
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {share.isError && (
        <p role="alert" className="mt-3 text-sm text-danger-foreground">
          {share.error.message}
        </p>
      )}
    </section>
  )
}
