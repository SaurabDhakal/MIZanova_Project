import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchEvidenceStrategies,
  queryKeys,
  retireEvidenceStrategy,
  saveEvidenceStrategy,
  type BehaviourType,
  type EvidenceStrategy,
} from '../../lib/api'
import PageHeader, { PageNote } from '../../components/PageHeader'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import NotBuiltYet from '../../components/NotBuiltYet'
import { showToast } from '../../lib/toast'

/**
 * The Evidence Database — db/118, FR12 and E02.
 *
 * ---------------------------------------------------------------------------
 * THIS IS NOT A LIBRARY, IT IS THE NET UNDER THE AI
 * ---------------------------------------------------------------------------
 * FR12 on its own reads like a nice-to-have. E02 says what it is actually for:
 * "strategies must fall back to the curated Evidence Database if AI is blocked
 * or offline". Before db/118, switching the AI off — FR21's kill switch, the
 * one pulled during a crisis — left every teacher with a 503 and nothing else.
 *
 * So what is written here is what a classroom gets on the worst day. That is
 * the reason for the two rules below.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IS EDITED, AND PROVENANCE IS COMPULSORY
 * ---------------------------------------------------------------------------
 * Revising inserts a new version and takes the old one out of currency, so a
 * strategy that changed after a teacher used it is still readable as the words
 * they were given. The database refuses an edit outright rather than letting
 * one look saved.
 *
 * And every strategy carries where it came from, because "proven" is the
 * requirement's word and a claim nobody can check is not proof. It is the
 * sentence a specialist would say if a parent asked why the school is doing
 * this.
 */

const TYPES: { value: BehaviourType; label: string }[] = [
  { value: 'disruptive', label: 'Disruptive' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'emotional', label: 'Emotional' },
  { value: 'physical', label: 'Physical' },
]

const field =
  'mt-1 w-full rounded-btn border border-input-border bg-card px-3 py-2 text-foreground'

export default function Evidence() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<EvidenceStrategy | 'new' | null>(null)
  const [behaviourType, setBehaviourType] = useState<BehaviourType>('disruptive')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [rationale, setRationale] = useState('')
  const [provenance, setProvenance] = useState('')

  const strategies = useQuery({
    queryKey: queryKeys.evidenceStrategies,
    queryFn: fetchEvidenceStrategies,
  })

  const done = async (message: string) => {
    setEditing(null)
    setTitle('')
    setBody('')
    setRationale('')
    setProvenance('')
    showToast(message)
    await queryClient.invalidateQueries({ queryKey: queryKeys.evidenceStrategies })
  }

  const save = useMutation({
    mutationFn: () =>
      saveEvidenceStrategy({
        lineageId: editing && editing !== 'new' ? editing.lineage_id : undefined,
        behaviourType,
        title,
        body,
        // One per line, which is how somebody writes a short list.
        rationale: rationale.split('\n').map((r) => r.trim()).filter(Boolean),
        provenance,
      }),
    onSuccess: () => done('Saved. Teachers see this the next time the AI cannot answer.'),
    onError: (error) => showToast(error.message, 'error'),
  })

  const retire = useMutation({
    mutationFn: (s: EvidenceStrategy) =>
      retireEvidenceStrategy(s.id, 'Withdrawn from the library'),
    onSuccess: () => done('Withdrawn. It stays readable as a past version.'),
    onError: (error) => showToast(error.message, 'error'),
  })

  const begin = (s: EvidenceStrategy | 'new') => {
    setEditing(s)
    if (s === 'new') {
      setBehaviourType('disruptive')
      setTitle('')
      setBody('')
      setRationale('')
      setProvenance('')
    } else {
      setBehaviourType(s.behaviour_type)
      setTitle(s.title)
      setBody(s.body)
      setRationale(s.rationale.join('\n'))
      setProvenance(s.provenance)
    }
  }

  const live = (strategies.data ?? []).filter((s) => !s.retired_at)

  return (
    <div>
      <PageHeader
        title="Evidence database"
        lead="Strategies a teacher is given when the AI is switched off or cannot be reached."
      />

      {strategies.isPending && <LoadingCards count={2} />}
      {strategies.isError && (
        <ErrorState
          message={strategies.error.message}
          onRetry={() => void strategies.refetch()}
        />
      )}

      {strategies.isSuccess && (
        <>
          {/*
            AN EMPTY LIBRARY IS NOT A NEUTRAL STATE and must not read like one.
            Until there is something here, a school that switches the AI off
            gets nothing at all — so the empty state says that rather than
            "no strategies yet".
          */}
          {live.length === 0 && (
            <div className="rounded-card border border-warning bg-warning-subtle p-5">
              <p className="font-semibold text-foreground">
                There is nothing in the library yet
              </p>
              <p className="mt-1 max-w-prose text-sm text-foreground">
                While it is empty, a teacher whose AI suggestions are switched
                off or unreachable receives nothing at all. Anything added here
                is what a classroom falls back on.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => begin('new')}
            className="mt-4 inline-flex min-h-11 items-center rounded-btn bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            + Add a strategy
          </button>

          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate()
              }}
              className="mt-4 space-y-4 rounded-card border border-border bg-card shadow-raised p-5"
            >
              <p className="font-semibold text-foreground">
                {editing === 'new'
                  ? 'A new strategy'
                  : `Version ${editing.version + 1} of “${editing.title}”`}
              </p>
              {editing !== 'new' && (
                <p className="max-w-prose text-sm text-muted-foreground">
                  The current version stays readable. Nothing a teacher has
                  already been given changes.
                </p>
              )}

              <label className="block">
                <span className="text-sm font-semibold text-foreground">
                  For which behaviour
                </span>
                <select
                  value={behaviourType}
                  onChange={(e) => setBehaviourType(e.target.value as BehaviourType)}
                  className={`${field} min-h-11`}
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-foreground">
                  What to try
                </span>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Warn before transitions"
                  className={field}
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-foreground">
                  How to do it
                </span>
                <textarea
                  required
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Give a five-minute and a one-minute warning, using the same words each time."
                  className={field}
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-foreground">
                  Why it works
                </span>
                <textarea
                  rows={3}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder={'One reason per line.\nTurns an abrupt endpoint into a predictable countdown.'}
                  className={field}
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-foreground">
                  Where this comes from
                </span>
                <input
                  required
                  value={provenance}
                  onChange={(e) => setProvenance(e.target.value)}
                  placeholder="Practice guidance, NSW Department of Education, 2024"
                  className={field}
                />
                <span className="mt-1 block text-sm text-muted-foreground">
                  Required. This is the sentence you would say if a parent asked
                  why the school is doing this — a claim nobody can check is not
                  evidence.
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={save.isPending}
                  className="inline-flex min-h-11 items-center rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="inline-flex min-h-11 items-center rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {TYPES.map((type) => {
            const forType = live.filter((s) => s.behaviour_type === type.value)
            if (forType.length === 0) return null
            return (
              <section key={type.value} className="mt-8">
                <h2 className="mb-3 text-lg font-semibold text-foreground">
                  {type.label}
                </h2>
                <ul className="space-y-3">
                  {forType.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-card border border-border bg-card shadow-raised p-4"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <p className="font-semibold text-foreground">{s.title}</p>
                        <span className="text-sm text-muted-foreground">
                          version {s.version}
                        </span>
                      </div>
                      <p className="mt-1 max-w-prose text-foreground">{s.body}</p>
                      {s.rationale.length > 0 && (
                        <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                          {s.rationale.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-2 text-sm text-muted-foreground">
                        Source: {s.provenance}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => begin(s)}
                          className="inline-flex min-h-11 items-center rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground"
                        >
                          Revise
                        </button>
                        <button
                          type="button"
                          disabled={retire.isPending}
                          onClick={() => retire.mutate(s)}
                          className="inline-flex min-h-11 items-center rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
                        >
                          Withdraw
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      )}

      <PageNote>
        <strong className="font-semibold text-foreground">
          What is written here is what a classroom gets on the worst day.
        </strong>{' '}
        These strategies are shown when AI suggestions are switched off or
        cannot be reached — the moment a teacher is least able to wait. They
        carry no child&rsquo;s details, which is what makes them safe to hold on
        a school laptop with no connection.
      </PageNote>

      <NotBuiltYet>
        <p>
          Withdrawing a strategy takes it out of use and keeps it readable, but
          there is no screen yet for reading an older version back — the history
          is in the database and nothing renders it. Nobody has needed it, and a
          list nobody opens is not worth the room.
        </p>
      </NotBuiltYet>
    </div>
  )
}
