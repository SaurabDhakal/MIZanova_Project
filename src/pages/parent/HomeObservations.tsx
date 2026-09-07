import { useState } from 'react'
import { fullName, withFullStop } from '../../lib/displayName'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createHomeObservation,
  updateHomeObservation,
  fetchHomeObservations,
  fetchHomeStrategies,
  queryKeys,
  type ObservationCategory,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { downloadCsv, toCsv } from '../../lib/csv'
import { observationCategoryStyle } from '../../lib/observationCategories'
import { toLocalDateValue, todayLocal } from '../../lib/localTime'
import { useSelectedChild } from '../../hooks/useMyChildren'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import NoChildYet from '../../components/NoChildYet'
import FormField from '../../components/FormField'
import HomeObservationList from '../../components/HomeObservationList'
import { OBSERVATION_CATEGORIES } from '../../lib/observationCategories'

/**
 * Home Observations — docs/Figma Pages Design/Parent Home Observations.png.
 *
 * The one screen where a parent writes rather than reads. Categories come from
 * the chart on that design.
 *
 * Unlike a teacher's behaviour log, which is hidden from parents until shared,
 * an observation written here is visible to the child's assigned staff
 * immediately — the parent wrote it precisely so the school would see it. The
 * asymmetry runs in the safe direction: whoever creates a record is the one it
 * is shared with by default.
 */

export default function HomeObservations() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const {
    child,
    isPending: childrenPending,
    isError: childrenError,
    error: childrenErrorObject,
  } = useSelectedChild()

  const [open, setOpen] = useState(false)
  /*
   * THE SAME FORM, IN TWO MODES.
   *
   * db/007 lets an author correct their own observation and forbids staff from
   * touching it. Rather than a second form with the same four fields — which
   * is where two forms start disagreeing about what a category is — the
   * existing panel is reused, loaded with the row being corrected. Null means
   * "writing a new one", which is what it always did.
   */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<ObservationCategory>('social_emotional')
  const [observedOn, setObservedOn] = useState(todayLocal)

  const observations = useQuery({
    queryKey: queryKeys.homeObservations(child?.id ?? ''),
    queryFn: () => fetchHomeObservations(child!.id),
    enabled: Boolean(child),
  })

  /*
   * The answers the family has already had — db/114. One query for the child
   * rather than one per observation, and no status filter: the guardian policy
   * returns only settled suggestions, so the rule that decides what is read is
   * not restated here where it could drift from the database.
   */
  const answers = useQuery({
    queryKey: queryKeys.homeStrategies(child?.id ?? ''),
    queryFn: () => fetchHomeStrategies(child!.id),
    enabled: Boolean(child),
  })

  const create = useMutation({
    mutationFn: () =>
      createHomeObservation({
        studentId: child!.id,
        title,
        body,
        category,
        observedOn,
      }),
    onSuccess: async () => {
      setTitle('')
      setBody('')
      setCategory('social_emotional')
      setOpen(false)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.homeObservations(child!.id),
      })
    },
  })

  const update = useMutation({
    mutationFn: () =>
      updateHomeObservation(editingId!, {
        title,
        body,
        category,
        observedOn,
      }),
    onSuccess: async () => {
      setEditingId(null)
      setTitle('')
      setBody('')
      setCategory('social_emotional')
      setOpen(false)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.homeObservations(child!.id),
      })
    },
  })

  /*
   * P03 — "an Export button must allow parents to save these notes as a PDF or
   * CSV file". CSV, because these are rows: a date, a category and two pieces
   * of text per observation, which is a spreadsheet's shape and not a
   * document's. The Progress report is the one that prints.
   *
   * Built from what is already on screen rather than a fresh query, so what
   * downloads is exactly what the family can see — RLS decided that once and
   * this does not get a second opinion. It exports the WHOLE history, not the
   * filtered view: an export that silently obeys a search box is the fault
   * db/068 was written to fix on the audit log.
   *
   * Author included, because both guardians write here and a file with no
   * names in it loses which of them said what the moment it leaves the
   * product.
   */
  function exportObservations() {
    const rows = (observations.data ?? []).map((o) => [
      o.observed_on,
      observationCategoryStyle(o.category).label,
      o.title,
      o.body,
      o.author?.full_name ?? '',
      /*
       * NOT `created_at.slice(0, 10)`. That is the UTC date, and this file
       * already carries the fix for the same mistake on the form above — an
       * observation written at 05:15 in Sydney exported as "written on" the
       * previous day, in the first export I checked. `observed_on` is a date
       * column and needs no conversion; `created_at` is a timestamptz and
       * does.
       */
      toLocalDateValue(new Date(o.created_at)),
    ])
    const csv = toCsv(
      ['Happened on', 'Category', 'What happened', 'Details', 'Written by', 'Written on'],
      rows,
    )
    downloadCsv(
      `mizanova-home-observations-${child!.first_name.toLowerCase()}-${todayLocal()}.csv`,
      csv,
    )
  }

  if (childrenPending) return <LoadingCards count={2} />

  /*
   * A FAILED LOOKUP IS NOT AN EMPTY ONE.
   *
   * `isError` was dropped from the destructure above, so a children query that
   * FAILED left `child` undefined and fell straight through to NoChildYet —
   * which tells a family "Your account is set up. No child is linked to it
   * yet" and hands them a Link a child button.
   *
   * That is a confident false statement about their own child, made to the
   * person least able to check it, and it sends them back through a linking
   * flow they have already completed. Five of the seven parent screens did
   * this.
   */
  if (childrenError) {
    return (
      <ErrorState
        message={
          childrenErrorObject?.message ??
          'Your children could not be loaded. This is a problem reaching the server, not a change to who is linked to your account.'
        }
      />
    )
  }

  if (!child) {
    return (
      <NoChildYet thing="Observations you share from home" />
    )
  }

  const term = search.trim().toLowerCase()
  const visible = (observations.data ?? []).filter((o) =>
    term === ''
      ? true
      : `${o.title} ${o.body}`.toLowerCase().includes(term),
  )

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Home observations</h1>
        <p className="mt-1 text-muted-foreground">
          Sharing moments from home helps the school build a fuller picture of{' '}
          {withFullStop(fullName(child))}
        </p>
      </header>



      {/* --- Prompt / form ------------------------------------------------- */}
      <div className="rounded-card border border-border bg-card shadow-raised p-5">
        {!open ? (
          <div className="sm:flex sm:items-center sm:gap-4">
            <div>
              <p className="text-lg font-bold text-foreground">
                Something happened at home?
              </p>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                A breakthrough, a challenge, or a change in routine. Small things
                are useful — patterns matter more than single events.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-4 w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground sm:mt-0 sm:ml-auto sm:w-auto"
            >
              + Log observation
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (editingId) update.mutate()
              else create.mutate()
            }}
            className="space-y-4"
          >
            {(create.isError || update.isError) && (
              <p
                role="alert"
                className="rounded-btn border border-danger bg-danger-subtle p-3 text-sm font-medium text-danger-foreground"
              >
                {(create.error ?? update.error)?.message}
              </p>
            )}

            <FormField
              label="What happened?"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Improved morning routine independence"
            />

            <div>
              <label
                htmlFor="observation-body"
                className="block text-sm font-semibold text-foreground"
              >
                Tell us more
              </label>
              <textarea
                id="observation-body"
                required
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What you saw, and anything that seemed to help…"
                className="mt-1.5 w-full rounded-btn border border-border bg-card p-3 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-foreground">
                Category
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {OBSERVATION_CATEGORIES.map((option) => (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-btn px-3 py-2 text-sm font-medium ${
                      category === option.value
                        ? `${option.className} ring-2 ring-primary`
                        : 'bg-background text-muted-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={option.value}
                      checked={category === option.value}
                      onChange={() => setCategory(option.value)}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <FormField
              label="When did it happen?"
              type="date"
              value={observedOn}
              max={todayLocal()}
              onChange={(e) => setObservedOn(e.target.value)}
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={create.isPending || update.isPending}
                className="flex-1 rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
              >
                {editingId
                  ? update.isPending
                    ? 'Saving…'
                    : 'Save the correction'
                  : create.isPending
                    ? 'Sharing…'
                    : 'Share with school'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setOpen(false)
                }}
                className="rounded-btn border border-border px-4 py-3 font-semibold text-foreground"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              {editingId
                ? 'The staff assigned to your child see the corrected version. Observations are corrected rather than deleted.'
                : `This is shared with the staff assigned to ${withFullStop(fullName(child))}`}
            </p>
          </form>
        )}
      </div>

      {/* --- History -------------------------------------------------------- */}
      <div className="mt-10 mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          Observation history
        </h2>
        {/* Absent rather than disabled when there is nothing to export. A
            greyed-out button is a control that looks authoritative and does
            nothing, which is the thing this product keeps refusing to draw. */}
        {(observations.data ?? []).length > 0 && (
          <button
            type="button"
            onClick={exportObservations}
            className="ml-auto inline-flex min-h-11 items-center rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-background"
          >
            Export as a spreadsheet
          </button>
        )}
      </div>

      {observations.isPending && <LoadingCards count={2} />}
      {observations.isError && (
        <ErrorState
          message={observations.error.message}
          onRetry={() => void observations.refetch()}
        />
      )}

      {observations.isSuccess && observations.data.length === 0 && (
        <EmptyState
          title="No observations yet"
          detail="Anything you share here goes to your child's teachers and specialists."
        />
      )}

      {observations.isSuccess && observations.data.length > 0 && (
        <>
          <label htmlFor="observation-search" className="sr-only">
            Search observations
          </label>
          <input
            id="observation-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search observations…"
            className="mb-3 w-full max-w-sm rounded-btn border border-border bg-card px-3 py-2.5 text-foreground placeholder:text-muted-foreground"
          />

          {visible.length === 0 ? (
            <EmptyState
              title="No matches"
              detail={`Nothing matched “${search}”.`}
            />
          ) : (
            <HomeObservationList
              observations={visible}
              viewerId={profile?.id}
              answers={answers.data ?? []}
              onEdit={(o) => {
                setEditingId(o.id)
                setTitle(o.title)
                setBody(o.body)
                setCategory(o.category)
                setObservedOn(o.observed_on)
                setOpen(true)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
