import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  queryKeys,
  searchSchools,
  searchStudents,
  type SearchHit,
} from '../lib/api'
import { paletteKindFor, type Role } from '../lib/roles'
import Icon from './Icon'

/**
 * Jump straight to a child, without browsing to find them.
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------
 * Ranked second in docs/14-Interface-Direction.md: "a school admin with 600
 * students cannot jump to a child. Everything is browse-then-filter." Browsing
 * is fine at four students and unusable at six hundred, and nothing got worse
 * quickly enough for anyone to notice.
 *
 * ---------------------------------------------------------------------------
 * A BAR, NOT A MODAL — and it was a modal first
 * ---------------------------------------------------------------------------
 * The first build put a button on the right of the top bar that opened a
 * <dialog>. It worked, and it was wrong twice: the study asks for search
 * CENTRED, and a dialog makes you open a thing before you can type into the
 * thing. Somebody reaching for a search box wants to type immediately.
 *
 * So the box IS the control. ⌘K focuses it rather than opening anything, the
 * results hang under it, and clicking anywhere else dismisses them — which a
 * <dialog> only did through its backdrop, and only after you had found the
 * backdrop.
 *
 * ---------------------------------------------------------------------------
 * SEARCHES WHAT YOUR ROLE CAN OPEN, WHICH IS NOT A SECURITY DECISION
 * ---------------------------------------------------------------------------
 * Who may SEE which child is decided by `can_view_student` in the database, so
 * the same query returns an educator their assigned children and a platform
 * admin everybody. `paletteKindFor` only chooses the DESTINATION — a platform
 * admin has no student record to open, so they get schools. Nothing here
 * filters results and nothing here should ever start to.
 */
export default function GlobalSearch({
  role,
  basePath,
}: {
  role: Role
  basePath: string
}) {
  const kind = paletteKindFor(role)
  const navigate = useNavigate()
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)

  /*
   * Cmd on a Mac, Ctrl everywhere else — decided once at mount so the hint
   * printed on the box and the key that actually works cannot disagree.
   * Osheit is on a Mac; the rest of the team is on Windows.
   */
  const [hint] = useState(() =>
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform)
      ? '⌘K'
      : 'Ctrl K',
  )

  /*
   * 200ms. Every keystroke is an ilike across a table this query cannot index
   * well, so typing "Mitchell" unthrottled is eight scans to answer one
   * question.
   */
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 200)
    return () => clearTimeout(t)
  }, [term])

  // ⌘K focuses the box. It does not open a panel — there is nothing to open.
  useEffect(() => {
    if (!kind) return
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [kind])

  /*
   * Click anywhere else and the results go away. `mousedown` rather than
   * `click`, so the panel is gone before the page underneath reacts — with
   * `click` the listener fires after a result's own handler and the two race.
   */
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const results = useQuery({
    queryKey: queryKeys.search(kind ?? 'none', debounced),
    queryFn: () =>
      kind === 'schools' ? searchSchools(debounced) : searchStudents(debounced),
    enabled: kind !== null && debounced.trim().length >= 2,
  })

  if (!kind) return null

  const hits: SearchHit[] = results.data ?? []
  const tooShort = debounced.trim().length > 0 && debounced.trim().length < 2
  const showPanel = open && term.trim().length > 0

  function go(hit: SearchHit) {
    navigate(
      kind === 'schools'
        ? `${basePath}/tenants/${hit.id}`
        : `${basePath}/students/${hit.id}`,
    )
    setTerm('')
    setOpen(false)
    inputRef.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault()
      go(hits[active])
    }
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Icon
        name="search"
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        aria-label={kind === 'schools' ? 'Search schools' : 'Search students'}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={
          kind === 'schools'
            ? 'Search schools…'
            : 'Search students by name or ID…'
        }
        className="min-h-11 w-full rounded-btn border border-border bg-background pr-14 pl-9 text-sm text-foreground"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground md:block">
        {hint}
      </kbd>

      {showPanel && (
        <div
          id="global-search-results"
          className="absolute top-full right-0 left-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-card border border-border bg-card p-2 shadow-raised"
        >
          {/* Every state says which one it is. A panel that shows an empty list
              for "still typing", "nothing matched" and "the query failed" alike
              is the same fault as a tile rendering a confident zero. */}
          {tooShort && (
            <p className="p-3 text-sm text-muted-foreground">
              Keep typing — two characters at least.
            </p>
          )}

          {results.isError && (
            <p role="alert" className="p-3 text-sm text-danger-foreground">
              Search could not run. {results.error.message}
            </p>
          )}

          {results.isFetching && (
            <p className="p-3 text-sm text-muted-foreground">Searching…</p>
          )}

          {results.isSuccess && hits.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              Nothing matched “{debounced}”. Only{' '}
              {kind === 'schools' ? 'schools' : 'children'} you are allowed to
              see can appear here.
            </p>
          )}

          {hits.map((hit, i) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => go(hit)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-baseline gap-3 rounded-btn px-3 py-2.5 text-left ${
                i === active ? 'bg-primary text-primary-foreground' : ''
              }`}
            >
              <span className="font-medium">{hit.label}</span>
              {hit.detail && (
                <span
                  className={
                    i === active
                      ? 'text-sm opacity-80'
                      : 'text-sm text-muted-foreground'
                  }
                >
                  {hit.detail}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
