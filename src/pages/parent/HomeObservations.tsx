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
import {
  toLocalDateValue,
  todayLocal,
  yesterdayLocal,
} from '../../lib/localTime'
import { useSelectedChild } from '../../hooks/useMyChildren'
import {
  EmptyState,
  ErrorState,
  LoadingCards,
} from '../../components/QueryState'
import NoChildYet from '../../components/NoChildYet'
import DictatedTextarea from '../../components/DictatedTextarea'
import FormField from '../../components/FormField'
import HomeObservationList from '../../components/HomeObservationList'
import { OBSERVATION_CATEGORIES } from '../../lib/observationCategories'

/**
 * A short name for an observation, taken from what the parent already wrote.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TITLE IS NO LONGER A QUESTION
 * ---------------------------------------------------------------------------
 * The form used to ask "What happened?" as a one-line title AND "Tell us more"
 * as the description. Both required. The two real entries families had written
 * by 12 September show what that produces:
 *
 *     title "he was scared"  body "he was scared after breaking a vase"
 *     title "Angry"          body "Angry at siblings"
 *
 * The title is a truncation of the body in both. It collected no information;
 * it made a parent say the same thing twice, and it did so as the FIRST thing
 * asked, before they had said anything at all. A parent writing at nine in the
 * evening is not composing a headline.
 *
 * `home_observations.title` is NOT NULL, so a title still has to exist. It is
 * derived here instead of demanded, and shown pre-filled under "Add more" so
 * it stays visible and correctable rather than becoming a hidden machine
 * field. Nobody is blocked by it.
 *
 * First sentence where there is one, otherwise a word-boundary trim, because
 * cutting mid-word reads as a bug in the educator's list.
 */
function deriveTitle(body: string): string {
  const text = body.trim().replace(/\s+/g, ' ')
  if (!text) return ''
  const sentence = text.match(/^(.{1,72}?)(?:[.!?]|$)/)
  const first = sentence?.[1]?.trim() ?? text
  if (first.length <= 72 && first.length > 0) return first
  const cut = text.slice(0, 72)
  const boundary = cut.lastIndexOf(' ')
  return (boundary > 30 ? cut.slice(0, boundary) : cut).trim()
}

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
   * FOCUS FOLLOWS THE PANEL.
   *
   * This card swaps a prompt for a form in the same place. Nothing moved
   * focus, so pressing "Log observation" left a keyboard or screen-reader user
   * standing on a button that had just stopped existing, with a form they were
   * never told had opened. Both entry points go through here.
   */
  function openForm() {
    setOpen(true)
    requestAnimationFrame(() => {
      document.getElementById('observation-body')?.focus()
    })
  }
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
  const [category, setCategory] = useState<ObservationCategory>('other')
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
        // db: title is NOT NULL. It is derived rather than demanded — see
        // deriveTitle. A parent who never opened "Add more" still gets one.
        title: title.trim() || deriveTitle(body),
        body,
        category,
        observedOn,
      }),
    onSuccess: async () => {
      setTitle('')
      setBody('')
      setCategory('other')
      setOpen(false)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.homeObservations(child!.id),
      })
    },
  })

  const update = useMutation({
    mutationFn: () =>
      updateHomeObservation(editingId!, {
        title: title.trim() || deriveTitle(body),
        body,
        category,
        observedOn,
      }),
    onSuccess: async () => {
      setEditingId(null)
      setTitle('')
      setBody('')
      setCategory('other')
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
      [
        'Happened on',
        'Category',
        'What happened',
        'Details',
        'Written by',
        'Written on',
      ],
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
    return <NoChildYet thing="Observations you share from home" />
  }

  const term = search.trim().toLowerCase()
  const visible = (observations.data ?? []).filter((o) =>
    term === '' ? true : `${o.title} ${o.body}`.toLowerCase().includes(term),
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
              <p className="text-section text-foreground">
                Something happened at home?
              </p>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                A breakthrough, a challenge, or a change in routine. Small
                things are useful — patterns matter more than single events.
              </p>
            </div>
            <button
              type="button"
              onClick={openForm}
              className="pressable mt-4 w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground sm:mt-0 sm:ml-auto sm:w-auto"
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

            {/* ---------------------------------------------------------------
                ONE QUESTION, AND IT IS THE ONE THEY CAME TO ANSWER.
                --------------------------------------------------------------
                Saurab: "i dont like the way a parent enters the log". The old
                order asked for a one-line title FIRST, then a description,
                then a clinical category, then a date — four questions before
                anything was said, and the first of them a headline.

                Now the description is the form. It is the only required
                field, it is focused when the panel opens, and it takes
                DICTATION — which eight other places in this app already had
                and the parent, the one person most likely to be typing
                one-handed on a phone at nine at night, did not. --------- */}
            <DictatedTextarea
              id="observation-body"
              label="What happened?"
              rows={5}
              required
              value={body}
              onChange={setBody}
              placeholder="Every evening around 7 the bath becomes a fight. Once they are in the water they are usually fine."
              hint="Write it how you would say it. The more you write, the more specific the ideas you get back."
            />

            {/* WHEN — two taps for the two answers that cover almost every
                case. A parent writing tonight about this morning should not
                have to open a date picker to say "today". */}
            <fieldset>
              <legend className="text-sm font-semibold text-foreground">
                When did it happen?
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { label: 'Today', value: todayLocal() },
                  { label: 'Yesterday', value: yesterdayLocal() },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={observedOn === option.value}
                    onClick={() => setObservedOn(option.value)}
                    className={`pressable min-h-11 rounded-btn px-4 text-sm font-semibold ${
                      observedOn === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border text-foreground hover:bg-background'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                <label className="min-h-11 inline-flex items-center gap-2 rounded-btn border border-border px-3 text-sm text-foreground">
                  <span className="sr-only">Another day</span>
                  <input
                    type="date"
                    value={observedOn}
                    max={todayLocal()}
                    onChange={(e) => setObservedOn(e.target.value)}
                    className="bg-transparent text-sm text-foreground"
                  />
                </label>
              </div>
            </fieldset>

            {/* EVERYTHING OPTIONAL, BEHIND ONE DISCLOSURE.
                The short name is derived from what they wrote (see
                deriveTitle) and shown here pre-filled so it stays visible and
                fixable rather than being a hidden machine field.

                The category stays because the educator's list reads it, but it
                is no longer asked as though a parent owes the school a
                developmental classification. "Scared after breaking a vase"
                was filed by a real user under Cognitive; the honest default is
                the one the database already had, which is Other. */}
            <details className="rounded-btn border border-border">
              <summary className="min-h-11 flex cursor-pointer items-center px-3 text-sm font-medium text-primary hover:underline">
                Add a short name or a category (optional)
              </summary>
              <div className="space-y-4 border-t border-border p-3">
                <FormField
                  label="Short name"
                  value={title || deriveTitle(body)}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={deriveTitle(body) || 'A few words'}
                  hint="This is what staff see in the list. Taken from what you wrote unless you change it."
                />

                <fieldset>
                  <legend className="text-sm font-semibold text-foreground">
                    Was it mostly about one of these?
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {OBSERVATION_CATEGORIES.map((option) => (
                      <label
                        key={option.value}
                        className={`pressable min-h-11 inline-flex cursor-pointer items-center rounded-btn px-3 text-sm font-medium ${
                          category === option.value
                            ? `${option.className} ring-2 ring-primary`
                            : 'border border-border text-muted-foreground'
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
              </div>
            </details>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={create.isPending || update.isPending}
                className="pressable min-h-11 flex-1 rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
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
                className="pressable min-h-11 rounded-btn border border-border px-4 py-3 font-semibold text-foreground"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              {editingId
                ? 'The staff assigned to your child see the corrected version. Observations are corrected rather than deleted.'
                : `Two things happen when you share this. The staff assigned to ${fullName(
                    child,
                  )} can read it, and you get a few things you could try at home — written from what you wrote, with names removed before it is sent.`}
            </p>
          </form>
        )}
      </div>

      {/* --- History -------------------------------------------------------- */}
      <div className="mt-10 mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-section text-foreground">
          Observation history
        </h2>
        {/* Absent rather than disabled when there is nothing to export. A
            greyed-out button is a control that looks authoritative and does
            nothing, which is the thing this product keeps refusing to draw. */}
        {(observations.data ?? []).length > 0 && (
          <button
            type="button"
            onClick={exportObservations}
            className="pressable ml-auto inline-flex min-h-11 items-center rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-background"
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
                openForm()
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
