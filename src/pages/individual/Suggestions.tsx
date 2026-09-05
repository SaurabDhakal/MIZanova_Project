import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteSelfRequest,
  fetchMySelfRequests,
  queryKeys,
  requestSelfStrategies,
  type SelfRequest,
} from '../../lib/api'
import { showToast } from '../../lib/toast'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import Icon from '../../components/Icon'

/**
 * Asking the AI about your own situation — db/094.
 *
 * ---------------------------------------------------------------------------
 * THE SAME FEATURE, ANSWERING A DIFFERENT QUESTION
 * ---------------------------------------------------------------------------
 * StrategyPanel.tsx asks the model what a teacher could try with a child. This
 * asks what somebody could try in their own life. The screens look similar on
 * purpose — it is the same product — but three things differ, and all three
 * come from the fact that NOBODY ELSE IS INVOLVED:
 *
 *   1. There is no specialist queue, so nothing says "held for review". A
 *      suggestion the model was unsure about is gone, and the screen says so
 *      in one sentence rather than implying somebody is looking at it.
 *   2. A risk flag shows THEM support, rather than telling somebody about
 *      them. db/094 argues that at length; the short version is that the page
 *      they signed up from promises nothing here is reported to anybody.
 *   3. The limits are stated before they type, not after. Somebody asking a
 *      computer about their own difficulties deserves to know what it will not
 *      do before they write it down.
 */
export default function Suggestions() {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')

  const history = useQuery({
    queryKey: queryKeys.mySelfRequests,
    queryFn: fetchMySelfRequests,
  })

  const ask = useMutation({
    mutationFn: requestSelfStrategies,
    onSuccess: async () => {
      setText('')
      await queryClient.invalidateQueries({ queryKey: queryKeys.mySelfRequests })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: deleteSelfRequest,
    onSuccess: async () => {
      showToast('Deleted.')
      await queryClient.invalidateQueries({ queryKey: queryKeys.mySelfRequests })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const tooShort = text.trim().length < 20
  const tooLong = text.trim().length > 2000

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Ask for suggestions</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Describe something you are finding hard and it will suggest a few
          practical things to try. It is a starting point, not an answer.
        </p>
      </header>

      {/* WHAT IT WILL NOT DO, BEFORE THEY TYPE IT. Putting this after the
          result would mean somebody writes something personal expecting a
          diagnosis and finds out afterwards that it was never going to give
          one. */}
      <section className="mb-6 rounded-card border border-border bg-background p-5">
        <h2 className="font-semibold text-foreground">Before you start</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          <li>
            It will not tell you whether you have anything. It is not allowed
            to name a condition, rule one out, or hint at one &mdash; not even
            if you ask it directly.
          </li>
          <li>
            It gives no medical advice and nothing about medication or therapy.
            That is a conversation for a GP.
          </li>
          <li>
            Your name is removed before anything is sent, along with any email
            address, phone number or date you happen to type.
          </li>
          <li>
            What you write is stored against your account so you can read it
            again. Nobody else can open it &mdash; not a school, not Special
            Miles &mdash; and you can delete it below whenever you like.
          </li>
        </ul>
      </section>

      {/* --- the box ------------------------------------------------------- */}
      <div className="rounded-card border border-border bg-card p-5 shadow-raised">
        <label
          htmlFor="situation"
          className="block font-semibold text-foreground"
        >
          What is going on?
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          A sentence or two about the situation. What happens, when, and what
          you have already tried.
        </p>
        <textarea
          id="situation"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={ask.isPending}
          className="mt-3 w-full rounded-btn border border-border bg-background p-3 text-foreground disabled:opacity-60"
          placeholder="I lose the whole morning to getting started on anything, even things I want to do."
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={ask.isPending || tooShort || tooLong}
            onClick={() => ask.mutate(text.trim())}
            className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {ask.isPending ? 'Thinking…' : 'Ask for suggestions'}
          </button>
          <span className="text-sm text-muted-foreground">
            {tooLong
              ? 'That is longer than it can take — try the essentials.'
              : tooShort
                ? 'A bit more detail gives it something to work with.'
                : `${text.trim().length} characters`}
          </span>
        </div>
      </div>

      {/* --- what came back ------------------------------------------------ */}
      {history.isPending && <div className="mt-8"><LoadingCards count={1} /></div>}

      {history.isError && (
        <div className="mt-8">
          <ErrorState
            message={history.error.message}
            onRetry={() => void history.refetch()}
          />
        </div>
      )}

      {history.isSuccess && history.data.length === 0 && !ask.isPending && (
        <p className="mt-8 max-w-prose text-muted-foreground">
          Nothing asked yet. Whatever you ask stays on this page.
        </p>
      )}

      {history.isSuccess && history.data.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
            What you have asked
          </h2>
          <ul className="space-y-5">
            {history.data.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                onDelete={() => remove.mutate(request.id)}
                deleting={remove.isPending && remove.variables === request.id}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function RequestCard({
  request,
  onDelete,
  deleting,
}: {
  request: SelfRequest
  onDelete: () => void
  deleting: boolean
}) {
  const asked = new Date(request.created_at).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <li className="rounded-card border border-border bg-card p-5 shadow-raised">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-muted-foreground">Asked {asked}</p>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="text-sm font-semibold text-muted-foreground hover:text-danger-foreground hover:underline disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete this'}
        </button>
      </div>

      <p className="mt-2 max-w-prose whitespace-pre-wrap text-foreground">
        {request.asked}
      </p>
      {request.redaction_count > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {request.redaction_count}{' '}
          {request.redaction_count === 1 ? 'detail was' : 'details were'}{' '}
          removed before this was sent.
        </p>
      )}

      {/* SUPPORT, NOT A REPORT. See db/094 — the school flow tells a
          safeguarding lead because the subject is a child. Here the subject is
          an adult who was promised nobody is watching, so the response is to
          put help in front of them. */}
      {request.risk_flagged && (
        <section className="mt-4 rounded-card border border-warning bg-warning-subtle p-4">
          <h3 className="font-semibold text-foreground">
            If you want to talk to a person
          </h3>
          <p className="mt-1 max-w-prose text-sm text-foreground">
            Some of what you wrote sounds heavy going, and this is a computer.
            Nobody has been told and nothing has been reported &mdash; this is
            just here in case it is useful.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            <li>
              <strong>Lifeline</strong> &mdash; 13 11 14, any time, any day.
            </li>
            <li>
              <strong>Emergency</strong> &mdash; 000, if someone is in danger
              right now.
            </li>
            <li>Your GP, for anything that needs a proper look.</li>
          </ul>
        </section>
      )}

      {request.individual_ai_suggestions.length > 0 && (
        <ul className="mt-4 space-y-3">
          {request.individual_ai_suggestions.map((s) => (
            <li
              key={s.id}
              className="rounded-card border border-border bg-background p-4"
            >
              <p className="font-bold text-foreground">{s.title}</p>
              <p className="mt-2 border-l-4 border-accent pl-3 text-foreground">
                {s.body}
              </p>
              {s.rationale.length > 0 && (
                <>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    Why this might help:
                  </p>
                  <ul className="mt-1 space-y-1">
                    {s.rationale.map((reason, i) => (
                      <li key={i} className="flex gap-2 text-sm text-foreground">
                        <Icon
                          name="tick"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-foreground"
                        />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* NOT "held for review". There is no reviewer, and saying there is
          would leave somebody waiting on nobody. */}
      {request.withheld_count > 0 && (
        <p className="mt-4 max-w-prose rounded-card border border-border bg-background p-4 text-sm text-muted-foreground">
          {request.withheld_count === 1
            ? 'One suggestion was not shown. '
            : `${request.withheld_count} suggestions were not shown. `}
          {request.withheld_reason}{' '}
          {request.individual_ai_suggestions.length === 0
            ? 'That left nothing worth showing you, which is a poor result — asking again with more detail usually helps.'
            : 'Nobody is reviewing it; it is simply not being passed on.'}
        </p>
      )}
    </li>
  )
}
