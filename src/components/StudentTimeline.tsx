import { useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  TIMELINE_KIND_LABEL,
  fetchStrategiesForStudent,
  fetchStrategyStatus,
  fetchStudentTimeline,
  queryKeys,
  setLogShared,
  type LogStrategyStatus,
  type StrategyRow,
  type TimelineKind,
  type TimelineRow,
} from '../lib/api'
import { ErrorState } from './QueryState'
import Icon, { type IconName } from './Icon'
import Spinner from './Spinner'
import StrategyPanel from './StrategyPanel'
import EditBehaviourLogDialog from './EditBehaviourLogDialog'

/**
 * One child's story, in date order.
 *
 * REPLACES FOUR SEPARATE LISTS. Behaviour history, shared from home, specialist
 * sessions and goal progress each had their own section ordered by type, which
 * meant "what has been happening with Ethan?" was five lookups and a mental
 * merge. Measured before this: a child with 35 logs was 37.8 screens, and a
 * child with no data at all was still 2.4 screens of five empty states.
 *
 * THE DATABASE DECIDES WHAT IS IN IT. `student_timeline` is `security_invoker`
 * (db/056), so a parent, a teacher and a specialist get different rows from the
 * same query. Nothing here filters by role, and nothing here should: those
 * rules live in five table policies and a copy would go stale.
 *
 * NULL IS NOT FALSE. `is_flagged` is null on rows where safeguarding does not
 * apply, so the flag pill renders only where the answer is genuinely `true` and
 * never says "not flagged" about a parent's note.
 */

const KINDS: TimelineKind[] = [
  'behaviour',
  'home',
  'session',
  'milestone',
  'plan',
]

const KIND_ICON: Record<TimelineKind, IconName> = {
  behaviour: 'observations',
  home: 'home',
  session: 'caseload',
  milestone: 'tick',
  plan: 'compliance',
}

/**
 * The node on the rail, not a stripe on the row.
 *
 * WHY THIS CHANGED. Every entry used to carry its own 2px coloured left border,
 * so twenty entries meant twenty stripes in four colours stacked down the page
 * — which is most of what Saurab meant by jumbled. The activity-log reference
 * in docs/log inspiration does the opposite: ONE continuous hairline rail, with
 * a small typed node sitting on it per entry. The kind is still legible at a
 * glance, and the page reads as one story instead of twenty fragments.
 */
const KIND_NODE: Record<TimelineKind, string> = {
  behaviour: 'bg-warning-subtle text-warning-foreground',
  home: 'bg-primary-subtle text-primary',
  session: 'bg-accent-subtle text-accent-foreground',
  milestone: 'bg-success-subtle text-success-foreground',
  plan: 'bg-background text-muted-foreground',
}

const BEHAVIOUR_LABEL: Record<string, string> = {
  disruptive: 'Disruptive',
  withdrawn: 'Withdrawn',
  emotional: 'Emotional',
  physical: 'Physical',
}

const INTENSITY_LABEL: Record<string, string> = {
  standard: 'Standard',
  medium: 'Medium',
  high: 'High',
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const then = new Date(d)
  then.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  // A home observation is recorded against a DAY, so it lands at midnight.
  // Printing "12:00am" would be inventing a precision the parent never gave.
  if (d.getHours() === 0 && d.getMinutes() === 0) return ''
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
}

function headline(row: TimelineRow): string {
  switch (row.kind) {
    case 'behaviour': {
      const type = BEHAVIOUR_LABEL[row.behaviour_type ?? ''] ?? 'Behaviour'
      const intensity = INTENSITY_LABEL[row.intensity ?? ''] ?? ''
      return intensity ? `${type} · ${intensity.toLowerCase()}` : type
    }
    case 'home':
      return row.title ?? 'Shared from home'
    case 'session':
      return 'Specialist session'
    case 'milestone':
      return row.title ? `Step done — ${row.title}` : 'Step done'
    case 'plan':
      return 'Education plan agreed'
  }
}

/**
 * BEHAVIOUR ROWS OPEN IN PLACE, and that is why there is no separate behaviour
 * history section any more.
 *
 * A behaviour log is not read-only like the other four kinds: it carries a
 * share-with-family toggle and the AI strategy suggestions attached to it.
 * Leaving those in a second list below would put every behaviour log on the
 * page twice — once as a story and once as a control panel. Expanding the row
 * keeps one copy of each event and puts the actions on the event itself.
 */
function Entry({
  row,
  studentId,
  strategies,
  status,
  onShare,
  sharing,
}: {
  row: TimelineRow
  studentId: string
  strategies: StrategyRow[]
  status?: LogStrategyStatus
  onShare: (id: string, shared: boolean) => void
  sharing: boolean
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const time = timeLabel(row.occurred_at)
  const actionable = row.kind === 'behaviour'

  /*
   * TWO DENSITIES, TAKEN FROM THE REFERENCE. In docs/log inspiration the small
   * events are a single line — "Steve added file_document.csv · 4 days ago" —
   * and only the substantial ones become a bordered card. Giving every entry a
   * card is what made twenty rows feel like twenty separate things.
   *
   * Here a behaviour log earns a card: it carries notes, badges, and controls.
   * A ticked milestone or an agreed plan is one line, because that is all there
   * is to say about it.
   */
  const isCard = row.kind === 'behaviour' || Boolean(row.detail)

  return (
    <li className="relative flex gap-3 pb-4">
      {/* The node sits ON the rail drawn by the list. */}
      <span
        className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card ${KIND_NODE[row.kind]}`}
        aria-hidden="true"
      >
        <Icon name={KIND_ICON[row.kind]} className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div
          className={
            isCard
              ? 'rounded-card border border-border bg-card p-3'
              : undefined
          }
        >
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="font-medium text-foreground">{headline(row)}</p>

            {/* Only where the answer is genuinely true. A null means the
                question does not apply to this kind of row. */}
            {row.is_flagged === true && (
              <span className="rounded-btn bg-danger-subtle px-2 py-0.5 text-xs font-semibold text-danger-foreground">
                Flagged
              </span>
            )}
            {row.kind === 'behaviour' && row.shared_with_parents === true && (
              <span className="rounded-btn bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                Shared with family
              </span>
            )}

            {time && (
              <span className="ml-auto text-sm text-muted-foreground">
                {time}
              </span>
            )}
          </div>

          {row.detail && (
            <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
              {row.detail}
            </p>
          )}

          {actionable && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-2 text-sm font-medium text-primary hover:underline"
            >
              {open ? 'Hide details' : 'Sharing and strategies'}
            </button>
          )}

          {actionable && open && (
            <div className="mt-3 border-t border-border pt-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={row.shared_with_parents === true}
                  disabled={sharing}
                  onChange={(e) => onShare(row.source_id, e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm text-foreground">
                  {row.shared_with_parents
                    ? 'Visible to parents'
                    : 'Not shared with parents'}
                </span>
              </label>

              {/*
                CORRECTING THE OBSERVATION — db/010 allowed it and nothing
                offered it. Shown to everyone who can see the log rather than
                only its author: a school administrator may correct any of
                them, and the dialog says which rule applies once it has read
                the record. Hiding it here would have meant guessing at the
                acknowledgement state from a timeline row that does not carry
                it.
              */}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-3 text-sm font-semibold text-primary hover:underline"
              >
                Correct this observation
              </button>

              {editing && (
                <EditBehaviourLogDialog
                  logId={row.source_id}
                  studentId={studentId}
                  onClose={() => setEditing(false)}
                />
              )}

              <div className="mt-3">
                <StrategyPanel
                  logId={row.source_id}
                  studentId={studentId}
                  strategies={strategies}
                  status={status}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export default function StudentTimeline({ studentId }: { studentId: string }) {
  const [kinds, setKinds] = useState<TimelineKind[]>([])
  const [page, setPage] = useState(0)
  const queryClient = useQueryClient()

  const timeline = useQuery({
    queryKey: queryKeys.timeline(studentId, kinds, page),
    queryFn: () => fetchStudentTimeline({ studentId, kinds, page }),
    // The list must not blink back to a spinner when a chip is pressed; that
    // is what made the old paginated screens feel like they were reloading.
    placeholderData: keepPreviousData,
  })

  const strategies = useQuery({
    queryKey: queryKeys.studentStrategies(studentId),
    queryFn: () => fetchStrategiesForStudent(studentId),
  })

  // What happened to suggestions this account may not read. Without it,
  // "never generated" and "generated then rejected" look identical.
  const strategyStatus = useQuery({
    queryKey: queryKeys.strategyStatus(studentId),
    queryFn: () => fetchStrategyStatus(studentId),
  })

  const share = useMutation({
    mutationFn: ({ id, shared }: { id: string; shared: boolean }) =>
      setLogShared(id, shared),
    // The whole timeline, because the row that just changed lives in it and
    // the badge on that row is read from the view.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['timeline', studentId] }),
  })

  const toggle = (kind: TimelineKind) => {
    setPage(0)
    setKinds((current) =>
      current.includes(kind)
        ? current.filter((k) => k !== kind)
        : [...current, kind],
    )
  }

  const rows = timeline.data?.rows ?? []
  const filtered = kinds.length > 0

  /* Group by day so the reader sees "Friday" once rather than on every row —
     the thing a stack of separate sections could never do. */
  const days: { label: string; rows: TimelineRow[] }[] = []
  for (const row of rows) {
    const label = dayLabel(row.occurred_at)
    const last = days[days.length - 1]
    if (last && last.label === label) last.rows.push(row)
    else days.push({ label, rows: [row] })
  }

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-raised">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h2 className="text-section text-foreground">Activity</h2>
        {timeline.isSuccess && (
          <span className="text-sm text-muted-foreground">
            {timeline.data.total}
            {filtered ? ' matching' : ''} entr
            {timeline.data.total === 1 ? 'y' : 'ies'}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setKinds([])
            setPage(0)
          }}
          aria-pressed={!filtered}
          className={`rounded-btn px-2.5 py-1 text-xs font-semibold ${
            !filtered
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-muted-foreground hover:bg-background'
          }`}
        >
          All
        </button>
        {KINDS.map((kind) => {
          const on = kinds.includes(kind)
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggle(kind)}
              aria-pressed={on}
              className={`rounded-btn px-2.5 py-1 text-xs font-semibold ${
                on
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:bg-background'
              }`}
            >
              {TIMELINE_KIND_LABEL[kind]}
            </button>
          )
        })}
      </div>

      {timeline.isPending && (
        <div className="mt-6">
          <Spinner label="Loading activity" />
        </div>
      )}
      {timeline.isError && (
        <div className="mt-4">
          <ErrorState
            message={timeline.error.message}
            onRetry={() => void timeline.refetch()}
          />
        </div>
      )}

      {timeline.isSuccess && rows.length === 0 && (
        /* ONE empty state, where there used to be five. It also distinguishes
           "nothing has happened" from "nothing matches your filter", which the
           old per-section empties could not do. */
        <p className="mt-6 text-sm text-muted-foreground">
          {filtered
            ? 'Nothing of that kind yet. Press All to see everything.'
            : 'Nothing recorded yet. Behaviour you log, notes the family shares, specialist sessions and goal progress all appear here as they happen.'}
        </p>
      )}

      {days.map((day) => (
        <div key={day.label} className="mt-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {day.label}
          </p>
          {/* ONE HAIRLINE BEHIND THE NODES, drawn by the list rather than by
              each row. before:left-[13px] centres it under the 28px nodes; the
              nodes carry ring-4 ring-card so the rail appears to pass behind
              them instead of through them. */}
          <ul className="relative mt-2 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border">
            {day.rows.map((row) => (
              <Entry
                key={`${row.kind}-${row.source_id}`}
                row={row}
                studentId={studentId}
                strategies={(strategies.data ?? []).filter(
                  (s) => s.behaviour_log_id === row.source_id,
                )}
                status={(strategyStatus.data ?? {})[row.source_id]}
                onShare={(id, shared) => share.mutate({ id, shared })}
                sharing={share.isPending}
              />
            ))}
          </ul>
        </div>
      ))}

      {timeline.isSuccess && (timeline.data.hasMore || page > 0) && (
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
          >
            Newer
          </button>
          <button
            type="button"
            disabled={!timeline.data.hasMore}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
          >
            Older
          </button>
          <span className="text-sm text-muted-foreground">
            {page * timeline.data.pageSize + 1}–
            {page * timeline.data.pageSize + rows.length} of{' '}
            {timeline.data.total}
          </span>
        </div>
      )}
    </section>
  )
}
