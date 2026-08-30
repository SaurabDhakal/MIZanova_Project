import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createArticle,
  deleteArticle,
  fetchArticles,
  queryKeys,
  setArticleConsent,
  setArticlePublished,
  type ArticleKind,
} from '../../lib/api'
import { ROLE_CONFIG, ROLES, type Role } from '../../lib/roles'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import PageHeader, { PageNote } from '../../components/PageHeader'
import { showToast } from '../../lib/toast'
import LibraryFilesSection from '../../components/LibraryFilesSection'

/**
 * Writing articles and case studies — db/079, the reading half of the brief's
 * requirement 4.
 *
 * ---------------------------------------------------------------------------
 * A CASE STUDY IS ABOUT REAL PEOPLE, AND THAT IS THE WHOLE RISK
 * ---------------------------------------------------------------------------
 * Special Miles' own material describes work with named schools and families. A
 * CMS that lets somebody publish "how we supported a Year 3 student with
 * selective mutism at Parramatta West" is a CMS that can identify a child, and
 * nothing about a writing tool would stop it.
 *
 * So publishing a case study requires an explicit confirmation that the people
 * in it agreed, and db/079 enforces it with a check constraint rather than
 * leaving it to this form. A guard against carelessness rather than a security
 * boundary — the same argument db/047 makes about approving a specialist with
 * no screening number, and the same thing being prevented: a tired person at
 * the end of a queue.
 */

const AUDIENCE_CHOICES: Role[] = ROLES.filter((r) => r !== 'platform_admin')

const KIND_LABEL: Record<ArticleKind, string> = {
  article: 'Article',
  case_study: 'Case study',
}

function NewArticleForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<ArticleKind>('article')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [audiences, setAudiences] = useState<Role[]>([])
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      createArticle({
        kind,
        title,
        summary,
        body,
        audiences,
        consentConfirmed: consent,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.articles })
      showToast('Created as a draft.')
      onDone()
    },
    onError: (e) => setError(e.message),
  })

  const toggle = (role: Role) =>
    setAudiences((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    )

  return (
    <form
      className="mb-6 rounded-card border border-border bg-card shadow-raised p-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim() === '') return setError('Give it a title.')
        if (summary.trim() === '')
          return setError('Say what it is about — this is what people read first.')
        if (audiences.length === 0)
          return setError('Choose at least one audience, or nobody can see it.')
        setError(null)
        create.mutate()
      }}
    >
      <h2 className="font-semibold text-foreground">Something new</h2>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-btn border border-danger bg-danger-subtle p-2.5 text-sm text-danger-foreground"
        >
          {error}
        </p>
      )}

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-foreground">What it is</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['article', 'case_study'] as ArticleKind[]).map((k) => (
            <label
              key={k}
              className={`cursor-pointer rounded-btn border px-3 py-1.5 text-sm font-medium ${
                kind === k
                  ? 'border-primary bg-primary-subtle text-primary'
                  : 'border-border bg-card text-muted-foreground'
              }`}
            >
              <input
                type="radio"
                name="article-kind"
                className="sr-only"
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              {KIND_LABEL[k]}
            </label>
          ))}
        </div>
        {kind === 'case_study' && (
          <p className="mt-2 text-xs text-muted-foreground">
            A case study describes work with a real school or family, so it
            cannot be published until somebody confirms they agreed.
          </p>
        )}
      </fieldset>

      <div className="mt-4 grid gap-4">
        <div>
          <label htmlFor="article-title" className="block text-sm font-medium text-foreground">
            Title
          </label>
          <input
            id="article-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          />
        </div>

        <div>
          <label htmlFor="article-summary" className="block text-sm font-medium text-foreground">
            What it is about
          </label>
          <textarea
            id="article-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          />
        </div>

        <div>
          <label htmlFor="article-body" className="block text-sm font-medium text-foreground">
            The text
          </label>
          <textarea
            id="article-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Plain text — no formatting."
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-foreground">Who it is for</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {AUDIENCE_CHOICES.map((role) => (
              <label
                key={role}
                className={`cursor-pointer rounded-btn border px-3 py-1.5 text-sm font-medium ${
                  audiences.includes(role)
                    ? 'border-primary bg-primary-subtle text-primary'
                    : 'border-border bg-card text-muted-foreground'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={audiences.includes(role)}
                  onChange={() => toggle(role)}
                />
                {ROLE_CONFIG[role].label}
              </label>
            ))}
          </div>
        </fieldset>

        {kind === 'case_study' && (
          <label className="flex items-start gap-2 rounded-card border border-border bg-background/60 p-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              The school and family described here have agreed to it being
              published.{' '}
              <span className="text-muted-foreground">
                This can be ticked later, but it must be true before publishing.
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {create.isPending ? 'Creating…' : 'Create as draft'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function Articles() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)

  const articles = useQuery({
    queryKey: queryKeys.articles,
    queryFn: fetchArticles,
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.articles })

  const publish = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      setArticlePublished(id, next),
    onSuccess: async (_d, vars) => {
      await refresh()
      showToast(vars.next ? 'Published.' : 'Withdrawn.')
    },
    onError: (e) => showToast(e.message, 'error'),
  })

  const consent = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      setArticleConsent(id, next),
    onSuccess: refresh,
    onError: (e) => showToast(e.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: deleteArticle,
    onSuccess: async () => {
      await refresh()
      showToast('Deleted.')
    },
    onError: (e) => showToast(e.message, 'error'),
  })

  if (articles.isPending) return <LoadingCards count={3} />
  if (articles.isError) return <ErrorState message={articles.error.message} />

  return (
    <div>
      <PageHeader
        title="Articles"
        lead="Short reads and case studies, and who each one is written for."
        actions={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-btn bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            New
          </button>
        }
      />

      {creating && <NewArticleForm onDone={() => setCreating(false)} />}

      {articles.data.length === 0 ? (
        <EmptyState
          title="Nothing written yet"
          detail="An article is created as a draft and published to the audiences you choose. A case study needs a confirmation first."
        />
      ) : (
        <ul className="space-y-4">
          {articles.data.map((a) => {
            const blocked = a.kind === 'case_study' && !a.consent_confirmed
            return (
              <li
                key={a.id}
                className="rounded-card border border-border bg-card shadow-raised p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-foreground">{a.title}</h2>
                      <span className="rounded-btn bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        {KIND_LABEL[a.kind]}
                      </span>
                      <span
                        className={`rounded-btn px-2 py-0.5 text-xs font-semibold ${
                          a.is_published
                            ? 'bg-success-subtle text-success-foreground'
                            : 'bg-background text-muted-foreground'
                        }`}
                      >
                        {a.is_published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                      {a.summary}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      For {a.audiences.map((r) => ROLE_CONFIG[r]?.label ?? r).join(', ')}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={publish.isPending || (blocked && !a.is_published)}
                      onClick={() =>
                        publish.mutate({ id: a.id, next: !a.is_published })
                      }
                      title={
                        blocked && !a.is_published
                          ? 'Confirm the people in it agreed first.'
                          : undefined
                      }
                      className={`rounded-btn px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
                        a.is_published
                          ? 'border border-border bg-card text-foreground'
                          : 'bg-primary text-primary-foreground'
                      }`}
                    >
                      {a.is_published ? 'Withdraw' : 'Publish'}
                    </button>
                    {!a.is_published && (
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(a.id)}
                        className="rounded-btn border border-danger px-3 py-2 text-sm font-semibold text-danger-foreground disabled:opacity-60"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/*
                  THE CONFIRMATION, ON THE CARD RATHER THAN BURIED IN AN EDIT
                  FORM. It is the thing standing between a story about a real
                  child and an audience, so it belongs where somebody about to
                  press Publish is looking.
                */}
                {a.kind === 'case_study' && (
                  <label className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={a.consent_confirmed}
                      disabled={consent.isPending || a.is_published}
                      onChange={(e) =>
                        consent.mutate({ id: a.id, next: e.target.checked })
                      }
                      className="mt-0.5"
                    />
                    <span>
                      The school and family described here have agreed to it
                      being published.
                      {a.is_published && (
                        <span className="block text-xs text-muted-foreground">
                          Withdraw it first to change this — it is already out.
                        </span>
                      )}
                    </span>
                  </label>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* db/080. The downloads that go with what is published above — kept on
          this screen because they are written and uploaded in the same sitting,
          and a separate page would be one nobody visits. */}
      <LibraryFilesSection />

      <PageNote>
        Separate from the Academy on purpose: a course is a sequence somebody
        works through and is counted for, an article is a page somebody reads.
        Everything is a draft until published, and its audience sees nothing
        before then. A case study cannot be published until somebody confirms
        the people in it agreed — db/079 refuses it with a check constraint, so
        it holds whatever this screen does. Downloads live in db/080&rsquo;s
        bucket, which is separate from a school&rsquo;s own files for a reason
        worth knowing: everything there is visible to every account on the
        platform, so nothing about a child belongs in it.
      </PageNote>
    </div>
  )
}
