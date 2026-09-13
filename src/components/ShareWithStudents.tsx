import { useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  shareResourceWithStudents,
  queryKeys,
  type StudentRow,
} from '../lib/api'
import { showToast } from '../lib/toast'
import Icon from './Icon'

/**
 * Choosing who a resource goes to.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACES
 * ---------------------------------------------------------------------------
 * Saurab: "resources sharing is also lame, how to select students, how to
 * select multiple students, a proper dropdown, a proper systematic ui".
 *
 * It was a native `<select>` whose `onChange` shared immediately. Three faults
 * in one control:
 *
 *   1. ONE CHILD PER INTERACTION. A worksheet for six children was six trips
 *      through the dropdown and six toasts.
 *   2. NO CONFIRM STEP. Selecting IS sharing, so a mis-click handed a clinical
 *      resource to the wrong family — and the only remedy is Revoke, after the
 *      family has already been able to open it.
 *   3. NO SEARCH. A specialist with a full caseload scrolls a native list
 *      looking for a surname.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT A <select multiple>
 * ---------------------------------------------------------------------------
 * It is the obvious answer and it is worse. Multi-select on a native element
 * needs ctrl-click to add and silently discards the whole selection on a plain
 * click — the most destructive possible response to the most likely gesture.
 * It also cannot show who already has the resource, cannot be searched, and on
 * a touch device is close to unusable. Checkboxes cost more markup and behave
 * the way people expect.
 *
 * ---------------------------------------------------------------------------
 * ALREADY-SHARED CHILDREN ARE SHOWN, NOT HIDDEN
 * ---------------------------------------------------------------------------
 * The old picker filtered them out, which is tidy and answers the wrong
 * question. A specialist looking at this list is asking "who has this?" as
 * much as "who should get it?", and a name that silently vanished reads as a
 * caseload that has lost somebody. They are listed, disabled, and labelled.
 */
export default function ShareWithStudents({
  resourceId,
  resourceTitle,
  students,
  alreadySharedIds,
  sharedBy,
}: {
  resourceId: string
  resourceTitle: string
  students: StudentRow[]
  alreadySharedIds: string[]
  sharedBy: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  const shared = useMemo(() => new Set(alreadySharedIds), [alreadySharedIds])

  /* Surname included, because a caseload with two children called Maya is the
     normal case rather than the edge one. */
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return students
    return students.filter((s) =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(term),
    )
  }, [students, query])

  const selectable = matches.filter((s) => !shared.has(s.id))

  const share = useMutation({
    mutationFn: () =>
      shareResourceWithStudents(resourceId, [...picked], sharedBy),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.resources })

      /* The message names the real outcome. "Shared." after two of five
         succeeded is the kind of reassurance that costs somebody a phone call
         to a family who never got it. */
      if (result.failed.length === 0) {
        showToast(
          result.shared.length === 1
            ? 'Shared. The family can see it now.'
            : `Shared with ${result.shared.length} children. Their families can see it now.`,
        )
      } else if (result.shared.length === 0) {
        showToast(result.failed[0].message, 'error')
      } else {
        showToast(
          `Shared with ${result.shared.length}. ${result.failed.length} could not be shared — reload and try those again.`,
          'error',
        )
      }

      setPicked(new Set())
      if (result.failed.length === 0) setOpen(false)
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          // The search box is the first thing wanted on a long caseload.
          requestAnimationFrame(() => searchRef.current?.focus())
        }}
        className="pressable min-h-11 mt-3 inline-flex items-center gap-2 rounded-btn border border-border px-4 text-sm font-semibold text-primary hover:bg-background"
      >
        <Icon name="link" aria-hidden className="h-4 w-4" />
        Share with children…
      </button>
    )
  }

  return (
    <div className="mt-3 rounded-btn border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`search-${resourceId}`} className="sr-only">
          Search your caseload
        </label>
        <input
          id={`search-${resourceId}`}
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your caseload…"
          className="min-h-11 min-w-0 flex-1 rounded-btn border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setPicked(new Set())
            setQuery('')
          }}
          className="pressable min-h-11 rounded-btn px-3 text-sm font-semibold text-muted-foreground hover:bg-background"
        >
          Cancel
        </button>
      </div>

      {/* A SELECT-ALL THAT OBEYS THE SEARCH, so "everyone in Year 3" is one
          press after typing, and it never silently includes somebody who is
          not on screen. */}
      {selectable.length > 1 && (
        <button
          type="button"
          onClick={() =>
            setPicked((prev) => {
              const next = new Set(prev)
              const allPicked = selectable.every((s) => next.has(s.id))
              selectable.forEach((s) =>
                allPicked ? next.delete(s.id) : next.add(s.id),
              )
              return next
            })
          }
          className="min-h-11 mt-1 text-sm font-semibold text-primary hover:underline"
        >
          {selectable.every((s) => picked.has(s.id))
            ? `Clear these ${selectable.length}`
            : `Select these ${selectable.length}`}
        </button>
      )}

      <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto">
        {matches.length === 0 && (
          <li className="py-3 text-sm text-muted-foreground">
            Nobody on your caseload matches &ldquo;{query}&rdquo;.
          </li>
        )}
        {matches.map((student) => {
          const has = shared.has(student.id)
          return (
            <li key={student.id}>
              <label
                className={`flex min-h-11 items-center gap-3 py-1 text-sm ${
                  has
                    ? 'text-muted-foreground'
                    : 'cursor-pointer text-foreground'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={has || share.isPending}
                  checked={picked.has(student.id)}
                  onChange={() => toggle(student.id)}
                  className="h-5 w-5 shrink-0 rounded border-border"
                />
                <span className="min-w-0 flex-1 truncate">
                  {student.first_name} {student.last_name}
                </span>
                {has && (
                  <span className="shrink-0 text-xs font-medium">
                    Already shared
                  </span>
                )}
              </label>
            </li>
          )
        })}
      </ul>

      {/* THE COMMIT IS ITS OWN PRESS, and it counts what it is about to do.
          This is the step the old control did not have. */}
      <button
        type="button"
        disabled={picked.size === 0 || share.isPending}
        onClick={() => share.mutate()}
        className="pressable min-h-11 mt-3 w-full rounded-btn bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {share.isPending
          ? 'Sharing…'
          : picked.size === 0
            ? 'Choose who to share with'
            : `Share “${resourceTitle}” with ${picked.size} ${
                picked.size === 1 ? 'child' : 'children'
              }`}
      </button>

      <p className="mt-2 text-xs text-muted-foreground">
        Their families can open it straight away. You can revoke access
        afterwards, but they may have read it by then.
      </p>
    </div>
  )
}
