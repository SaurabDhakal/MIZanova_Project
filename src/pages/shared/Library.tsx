import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchArticles, queryKeys, type Article } from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import PageHeader, { PageNote } from '../../components/PageHeader'

/**
 * Reading, as opposed to the Academy's doing — db/079.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT PART OF THE ACADEMY
 * ---------------------------------------------------------------------------
 * A course is a sequence somebody works through and is counted for. An article
 * is a page somebody reads and closes. Putting a one-page article in the
 * Academy would give it an enrolment, a progress bar and a "Mark as done"
 * button — furniture for something nobody is completing, and a progress figure
 * that would mean nothing.
 *
 * The brief lists them separately for the same reason: "courses, articles, case
 * studies".
 *
 * ---------------------------------------------------------------------------
 * ONE SCREEN FOR EVERY READER
 * ---------------------------------------------------------------------------
 * As with the Academy, db/079's policies decide what arrives rather than a prop
 * — an article written for educators does not reach a parent's browser and get
 * filtered out here, it never arrives.
 */

const KIND_LABEL: Record<Article['kind'], string> = {
  article: 'Article',
  // Named plainly. "Success story" would be marketing language for something
  // that is a record of work with a real family.
  case_study: 'Case study',
}

const KIND_STYLE: Record<Article['kind'], string> = {
  article: 'bg-background text-muted-foreground',
  case_study: 'bg-primary-subtle text-primary',
}

export default function Library() {
  const [open, setOpen] = useState<string | null>(null)
  const articles = useQuery({
    queryKey: queryKeys.articles,
    queryFn: fetchArticles,
  })

  if (articles.isPending) return <LoadingCards count={3} />
  if (articles.isError) return <ErrorState message={articles.error.message} />

  /*
   * A platform admin can read drafts — db/079 lets them, because somebody has
   * to write one. They are hidden here rather than shown greyed out: this is
   * the reader's screen, and a draft has nothing to read. They are edited on
   * Articles.
   */
  const visible = articles.data.filter((a) => a.is_published)

  return (
    <div>
      <PageHeader
        title="Library"
        lead="Short reads from Special Miles — practical guidance, and work with real schools."
      />

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing published for you yet"
          detail="Special Miles publishes articles and case studies for particular audiences. When one is published for your role, it appears here."
        />
      ) : (
        <ul className="space-y-4">
          {visible.map((a) => {
            const isOpen = open === a.id
            return (
              <li
                key={a.id}
                className="rounded-card border border-border bg-card shadow-raised p-5"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-semibold text-foreground">{a.title}</h2>
                  <span
                    className={`rounded-btn px-2 py-0.5 text-xs font-semibold ${KIND_STYLE[a.kind]}`}
                  >
                    {KIND_LABEL[a.kind]}
                  </span>
                </div>

                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                  {a.summary}
                </p>

                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : a.id)}
                  aria-expanded={isOpen}
                  className="mt-3 text-sm font-semibold text-primary hover:underline"
                >
                  {isOpen ? 'Close' : 'Read it'}
                </button>

                {isOpen && (
                  /*
                    whitespace-pre-line, not dangerouslySetInnerHTML. db/079
                    stores plain text on purpose — rendering staff-written
                    content as markup is how a content field becomes an
                    injection surface, and the brief names input validation.
                  */
                  <p className="mt-3 max-w-prose text-sm whitespace-pre-line text-foreground">
                    {a.body || 'This one has no text yet.'}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <PageNote>
        Written and published by Special Miles for particular audiences, so this
        shows what is meant for your role rather than everything that exists.
        Case studies describe work with real schools and families and are only
        published once somebody has confirmed the people in them agreed —
        db/079 refuses to publish one otherwise, so that is a rule rather than a
        habit.
      </PageNote>
    </div>
  )
}
