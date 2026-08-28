import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchStudents, queryKeys, type StudentRow } from '../lib/api'

/**
 * The children this signed-in parent is a guardian of.
 *
 * It calls the same `fetchStudents()` an educator uses — no parent-specific
 * query, no `where guardian = me`. Row-Level Security returns a parent only the
 * children they are linked to in `student_guardians`, so "students" and
 * "my children" are the same request with different answers.
 *
 * Worth noticing: if this hook had its own filter, that filter would be the
 * thing protecting other families' children. Filters get edited.
 */
export function useMyChildren(): {
  children: StudentRow[]
  isPending: boolean
  isError: boolean
  error: Error | null
} {
  const query = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })

  return {
    children: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
  }
}

const SELECTED_KEY = 'mizanova.selectedChild'

/**
 * Which of a family's children the parent is currently looking at.
 *
 * WHY THIS EXISTS. Six screens did `children[0]` — the dashboard, progress,
 * observations, goals, messages and privacy. A family with two children could
 * only ever see the older one, and there was nothing on screen to suggest the
 * other existed. `student_guardians` has always been many-to-many; the
 * database was right and every screen quietly assumed one.
 *
 * The choice is remembered across screens and reloads, because a parent
 * checking on one child does not want to reselect them on every page.
 *
 * IT IS NOT A PERMISSION. Row-Level Security decides which children come back
 * at all; this only decides which of those is on screen. A tampered value in
 * localStorage selects nothing, because it will not match any id in the list.
 *
 * ---------------------------------------------------------------------------
 * `isError` IS NOT OPTIONAL, AND FIVE SCREENS TREATED IT AS IF IT WERE
 * ---------------------------------------------------------------------------
 * A caller that destructures only `isPending` still compiles, still renders,
 * and is wrong in a way nobody sees in review: when the lookup FAILS, `child`
 * is undefined, and every one of these screens falls through to the same
 * `if (!child)` branch as a parent who genuinely has nobody linked.
 *
 * That branch shows NoChildYet — "Your account is set up. No child is linked to
 * it yet" — with a Link a child button. So a network blip tells a family their
 * child is not linked and sends them back through a flow they have already
 * completed. Goals & IEP, Home Observations, Privacy, Progress and Messages all
 * did this.
 *
 * If you are writing a screen with this hook: `!child` means NOBODY IS LINKED.
 * It does not mean "we could not find out". Handle `isError` first.
 */
export function useSelectedChild(): {
  children: StudentRow[]
  child: StudentRow | undefined
  selectChild: (id: string) => void
  isPending: boolean
  isError: boolean
  error: Error | null
} {
  const { children, isPending, isError, error } = useMyChildren()
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SELECTED_KEY)
    } catch {
      return null
    }
  })

  /**
   * Falls back to the first child rather than to nothing: a remembered id can
   * point at a child this account is no longer a guardian of, and an empty
   * screen would be the wrong way to find that out.
   *
   * DERIVED, NOT SYNCED. An earlier version wrote the fallback back into state
   * from an effect, which is the cascading-render pattern this project has been
   * caught by before — and it was pointless, because this line already produces
   * the right answer on every render. Storage is written only when somebody
   * actually chooses.
   */
  const child = children.find((c) => c.id === selectedId) ?? children[0]

  function selectChild(id: string) {
    setSelectedId(id)
    try {
      localStorage.setItem(SELECTED_KEY, id)
    } catch {
      /* as above */
    }
  }

  return { children, child, selectChild, isPending, isError, error }
}
