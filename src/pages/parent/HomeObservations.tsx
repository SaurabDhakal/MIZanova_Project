import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createHomeObservation,
  updateHomeObservation,
  fetchHomeObservations,
  queryKeys,
  type ObservationCategory,
} from '../../lib/api'
import { useSelectedChild } from '../../hooks/useMyChildren'
import ChildSwitcher from '../../components/ChildSwitcher'
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
  const queryClient = useQueryClient()
  const {
    children,
    child,
    selectChild,
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
  const [observedOn, setObservedOn] = useState(
    () => new Date().toISOString().slice(0, 10),
  )

  const observations = useQuery({
    queryKey: queryKeys.homeObservations(child?.id ?? ''),
    queryFn: () => fetchHomeObservations(child!.id),
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
          {child.display_name}.
        </p>
      </header>

      <ChildSwitcher children={children} child={child} onSelect={selectChild} />


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
              max={new Date().toISOString().slice(0, 10)}
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
                : `This is shared with the staff assigned to ${child.display_name}.`}
            </p>
          </form>
        )}
      </div>

      {/* --- History -------------------------------------------------------- */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        Observation history
      </h2>

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
