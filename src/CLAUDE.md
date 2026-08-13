# Frontend guide (`src/`)

Read [../CLAUDE.md](../CLAUDE.md) first for the invariants. This file is how the
frontend is built.

---

## Layer map — one job per folder

| Folder | Holds | Never holds |
|---|---|---|
| `pages/<role>/` | One screen per file. Composition, layout, wiring. | Supabase queries, reusable UI |
| `pages/shared/` | Screens more than one role opens through the same URL shape | Role-specific copy |
| `components/` | Reusable presentational + interactive pieces | `useQuery` calls tied to one screen's key |
| `hooks/` | Reusable stateful behaviour (`use*`) | Anything used once |
| `lib/api.ts` | **Every** database read and write | JSX, React imports |
| `lib/*.ts` | Pure logic, constants, copy tables, typed enums | Side effects at import time |

The hard rule: **a screen never builds a query.** It calls a function from
`lib/api.ts`. A query written inline gets copy-pasted, drifts, and turns a
renamed column into twelve edits instead of one.

---

## Adding a screen

1. **Is it in the sidebar?** It needs a `NavItem` in `ROLE_CONFIG[role].nav` in
   `lib/roles.ts` — `path`, `label`, `icon` (typed against `lib/icons.ts`),
   optional `group`, and the `milestone` that builds it.
2. Write `pages/<role>/<Name>.tsx` with a default export.
3. In `App.tsx`, add the lazy import **under your own name block**, then one
   line to `BUILT_SCREENS` keyed `` `${role}:${path}` ``.
4. A page reached by clicking a row is not a sidebar item — it goes in
   `DETAIL_ROUTES[role]` instead. Static segments before dynamic ones:
   `students/add` must be listed before `students/:studentId`, or `add` is read
   as a student id.

Anything in `ROLE_CONFIG` but not in `BUILT_SCREENS` renders a `<Placeholder>`
naming its milestone. That is deliberate — half-finished is visibly
half-finished, not quietly missing. Do not delete a nav item to hide it.

Every role section is already wrapped in `<ProtectedRoute allow={[role]}>` and
`<AppShell>`, so there is no way to add a route and forget the guard. It is
still only convenience — RLS is the real gate.

---

## Reading data

TanStack Query, always keyed from `queryKeys` in `lib/api.ts`. Never write a key
literal inline — a cache entry invalidated by the wrong name is silent.

```tsx
const pending = useQuery({ queryKey: queryKeys.pendingStrategies, queryFn: fetchPendingStrategies })
```

New query? Add its key to `queryKeys` in the same commit as its fetcher.
Parameterised keys are functions: `queryKeys.student(id)`.

**Handle all three states.** `components/QueryState.tsx` exists so you do not
write them again:

```tsx
if (q.isPending) return <LoadingCards count={3} />
if (q.isError) return <ErrorState message={q.error.message} onRetry={q.refetch} />
if (q.data.length === 0) return <EmptyState title="…" detail="…" />
```

- `ErrorState` detects offline from the error text (not `navigator.onLine`,
  which lies) and rewords itself. Pass the raw message; it keeps it in fine
  print for debugging.
- `EmptyState` wording matters: *"You have not been assigned any students"*
  tells someone what to do. *"No students"* does not.
- `LoadingCards` is skeleton-shaped so the layout does not jump.

A query whose absence should not block the screen (a secondary count, say) is
read with `q.isSuccess ? q.data : undefined` and rendered as unknown, not zero.

### Pagination

Anything that can exceed ~1000 rows returns `Page<T>` from `lib/api.ts`, not an
array. PostgREST caps at 1000 rows and says nothing about it, so a component
that does `rows.length` reports a complete-looking lie. `Page.total` comes from
`count: 'exact'`. Render with `components/Pagination.tsx`.

**No component ever counts rows to produce a user-facing total.**

---

## Writing data

```tsx
const qc = useQueryClient()
const save = useMutation({
  mutationFn: createGoal,
  onSuccess: () => { void qc.invalidateQueries({ queryKey: queryKeys.goals(studentId) }); showToast('Goal added') },
  onError: (e: Error) => showToast(e.message, 'error'),
})
```

- The mutation function lives in `lib/api.ts`, not in the component.
- Any mutation whose success depends on an RLS policy calls `assertChanged()`
  inside its `lib/api.ts` function — `.update()`/`.delete()` filtered out by a
  policy returns success having changed nothing.
- Invalidate by `queryKeys.*`, never by a literal.
- `showToast(message, tone)` from `lib/toast.ts`. `<Toasts />` is already
  mounted in `AppShell`.
- Disable the submit control while `isPending`. A double-click is a second row.

Behaviour logs are the one write that goes through `lib/offlineQueue.ts`
(`saveBehaviourLog`) rather than straight to Supabase — a teacher in a
classroom dead spot must not lose the log. Do not add other writes to that
queue without a reason; everything else can honestly fail.

---

## Styling

Tailwind v4. There is no `tailwind.config.js` — `src/index.css` under `@theme`
**is** the config.

**Use the named tokens, never raw hex and never `blue-600`-style built-ins in
app code.** A token named `--color-primary` gives you `bg-primary`,
`text-primary`, `border-primary` automatically.

| Purpose | Token classes |
|---|---|
| Surfaces | `bg-background` (page), `bg-card`, `border-border` |
| Text | `text-foreground`, `text-muted-foreground` |
| Action | `bg-primary` / `text-primary-foreground`, `bg-primary-subtle` |
| Status | `success` / `warning` / `danger` / `accent`, each with `-subtle` (fill) and `-foreground` (text) |
| Shape | `rounded-card` (10px), `rounded-btn` (6px) |
| Elevation | `shadow-raised`, `shadow-lifted` |
| Type | `text-display`, `text-title` (screen h1), `text-section`, `text-caption` |

The `-foreground` variants exist because the base colour fails WCAG AA as text.
**Status text uses `text-danger-foreground`, not `text-danger`.** `npm run
contrast-check` measures every pair actually used and fails the build in CI.

Standard card: `rounded-card border border-border bg-card shadow-raised p-5`.

`/design-tokens` renders the whole palette in the running app.

### Accessibility, not optional

- Focus rings are handled globally by `:focus-visible` in `index.css`. Do not
  remove outlines.
- Form controls get their border from an unlayered rule in `index.css`, which
  deliberately beats Tailwind's `border-border`. `FormField` sets
  `aria-invalid` so an errored field keeps its red border.
- An alert region gets `role="alert"`; a skeleton gets `role="status"` and
  `aria-label`.
- Icon-only buttons get `aria-label`. Icons come from `components/Icon.tsx` —
  adding one means adding a path to `lib/icons.ts`, which types `IconName`.
- Mobile matters for parents (NFR3): the sidebar is a drawer under `sm`.
  Educator and admin screens are laptop-first.
- Dates: `toLocaleDateString('en-AU', …)`. Money: `formatMoney()` from
  `lib/api.ts`, never a manual `/100`.

---

## Modularity rules

- A page file over **~250 lines** means a section wants extracting into
  `components/`. Sections that already did this: `GoalsSection`,
  `SessionsSection`, `IepDocumentsSection`, `GuardianAccessSection`.
- A component over **~200 lines** with two responsibilities is two components.
- Repeated `useState` + `useEffect` in two files is a hook in `hooks/`.
- A shared screen goes in `pages/shared/` and is routed from each role's
  `DETAIL_ROUTES` block. **Never copy a screen into a second role's folder.**
- Constants, copy tables and typed enums (`CONSENT_COPY`, `goalCategories`,
  `observationCategories`) live in `lib/`, not inline in JSX.
- Everything lazy-loaded except the auth pages, the shell and the landing page.
  Those are what a first visit renders; splitting them trades one download for
  two round trips with nothing on screen.

---

## Do not

- Query Supabase from a component.
- Write a query key literal.
- Trust a role check in JavaScript as security.
- Render an RLS-filtered empty result as `0`.
- Use `navigator.onLine` to decide anything — ask the failed request instead
  (`isOfflineFailure` in `lib/offlineQueue.ts`).
- Put a secret in a `VITE_` variable.
- Reorder or reformat `App.tsx`, `roles.ts` or `api.ts` while someone else has
  work open on them.
