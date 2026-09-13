import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchMyReviewDecisions, queryKeys } from '../lib/api'
import Icon from './Icon'

/**
 * The decisions this specialist has already made.
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------
 * `reviewed_by`, `reviewed_at` and `review_note` have been written on every
 * review since db/006 and no specialist screen ever read them back. A decision
 * was made, the card left the queue, and there was no way to answer "what did
 * I release last week, and why did I say no to that one?"
 *
 * A review note is the reasoning behind a clinical judgement about a child. A
 * school asked to account for why a suggestion was withheld had nowhere to
 * look, and the person who wrote the reason could not re-read their own words.
 *
 * ---------------------------------------------------------------------------
 * A DISCLOSURE, NOT A SECOND PAGE
 * ---------------------------------------------------------------------------
 * It lives collapsed at the foot of the review queue rather than as its own
 * nav item. The queue is the work; this is the receipt. A separate screen in
 * the sidebar would compete with "Review Queue" for the same glance and
 * suggest there are two jobs here when there is one, with a history.
 *
 * Closed by default, because on most days the answer to "what did I decide"
 * is not needed and an open list of past work above the pending pile would
 * bury it.
 */
export default function MyReviewDecisions() {
  const decisions = useQuery({
    queryKey: queryKeys.myReviewDecisions,
    queryFn: fetchMyReviewDecisions,
  })

  return (
    <details className="mt-8 rounded-card border border-border bg-card p-5 shadow-raised">
      <summary className="min-h-11 flex cursor-pointer items-center text-section text-foreground">
        What you have already decided
      </summary>

      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        Your own reviews, newest first. Only yours &mdash; a child with two
        specialists has two sets of judgements, and whose call it was is the
        point of recording it.
      </p>

      {decisions.isPending && (
        <div
          role="status"
          aria-label="Loading your decisions"
          className="mt-3 h-20 animate-pulse rounded-btn bg-background"
        />
      )}

      {decisions.isError && (
        <p role="alert" className="mt-3 text-sm text-danger-foreground">
          Your decisions could not be loaded: {decisions.error.message}
        </p>
      )}

      {decisions.isSuccess && decisions.data.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          You have not released or declined anything yet. Decisions appear here
          as soon as you make one.
        </p>
      )}

      {decisions.isSuccess && decisions.data.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {decisions.data.map((d) => (
            <li key={`${d.path}-${d.id}`} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* RELEASED or DECLINED, as a word. A green tick and a grey
                    cross would make the reader decode a colour to find out
                    what they did about a child. */}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-btn px-2 py-0.5 text-xs font-semibold ${
                    d.status === 'approved'
                      ? 'bg-success-subtle text-success-foreground'
                      : 'bg-background text-muted-foreground'
                  }`}
                >
                  <Icon
                    name={d.status === 'approved' ? 'tick' : 'cross'}
                    aria-hidden
                    className="h-3.5 w-3.5"
                  />
                  {d.status === 'approved' ? 'Released' : 'Declined'}
                </span>

                <span className="text-xs font-medium text-muted-foreground">
                  {d.path === 'home' ? 'For a family' : 'For a classroom'}
                </span>

                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {new Date(d.reviewed_at).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>

              <p className="mt-1 text-sm font-semibold text-foreground">
                {d.title}
              </p>

              <p className="text-sm text-muted-foreground">
                {d.student_name ?? 'A student'}
                {d.student_id ? (
                  <>
                    {' · '}
                    <Link
                      to={`/specialist/students/${d.student_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      their record
                    </Link>
                  </>
                ) : null}
              </p>

              {/* THE REASON, which is the whole point of keeping this. An
                  entry with no note is shown as such rather than skipped —
                  "no reason recorded" is itself the useful fact when somebody
                  asks later. */}
              {d.review_note ? (
                <p className="mt-1 max-w-prose text-sm text-foreground">
                  &ldquo;{d.review_note}&rdquo;
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  No reason recorded.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
