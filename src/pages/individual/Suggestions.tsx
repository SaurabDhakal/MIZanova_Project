import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteSelfRequest,
  fetchAiHealth,
  fetchMySelfRequests,
  queryKeys,
  requestSelfStrategies,
  type SelfRequest,
} from '../../lib/api'
import { showToast } from '../../lib/toast'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import Icon from '../../components/Icon'
import DictatedTextarea from '../../components/DictatedTextarea'

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
  /* Null means "the most recent", worked out at render rather than stored, so
     a fresh answer opens itself without anything having to remember it. */
  const [openAsk, setOpenAsk] = useState<string | null>(null)

  const history = useQuery({
    queryKey: queryKeys.mySelfRequests,
    queryFn: fetchMySelfRequests,
  })

  /*
   * Asked when the page opens, so somebody learns the AI is unreachable BEFORE
   * writing a paragraph about what they are finding hard — not after pressing
   * a button and waiting. Retries are off: this is a yes/no about right now,
   * and a stale "it is down" is worse than asking again on the next visit.
   */
  const health = useQuery({
    queryKey: queryKeys.aiHealth,
    queryFn: fetchAiHealth,
    retry: false,
    staleTime: 30_000,
    // Re-checked when the tab is focused, so starting the server in another
    // window fixes the banner without anybody pressing anything.
    refetchOnWindowFocus: true,
  })
  const aiDown =
    health.isSuccess && (!health.data.reachable || !health.data.aiConfigured)

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

      {/* WHAT IT WILL NOT DO, BEFORE THEY TYPE IT — and still before, not
          behind a disclosure. Putting it after the result would mean somebody
          writes something personal expecting a diagnosis and finds out
          afterwards that it was never going to give one.

          COMPRESSED, NOT HIDDEN. This was four bullets that pushed the actual
          box below the fold on every visit, and it is read once. Every fact
          survives — no diagnosis, no medical advice, what is stripped, what is
          stored, who can read it — in two lines instead of ten, laid out as a
          pair of facts rather than a wall of caveats. Collapsing it behind a
          toggle was the other option and it was worse: these are the two
          questions somebody has before writing something personal, and the
          answers should not need a click. */}
      <section className="mb-6 grid gap-x-8 gap-y-3 rounded-card border border-border bg-background p-5 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-bold text-foreground">
            What it will not do
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            It never names a condition, rules one out or hints at one &mdash;
            not even if you ask it directly &mdash; and it gives no medical
            advice. That is a conversation for a GP.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">
            What happens to what you write
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your name, email, phone number and any dates are stripped before it
            is sent. What you write is kept so you can read it again &mdash;
            nobody else can open it, not a school and not Special Miles &mdash;
            and you can delete it below.
          </p>
        </div>
      </section>

      {aiDown && (
        <div className="mb-6 rounded-card border border-warning bg-warning-subtle p-5">
          <h2 className="font-semibold text-foreground">
            Suggestions are not working just now
          </h2>
          <p className="mt-1 max-w-prose text-sm text-foreground">
            {health.data?.reachable
              ? 'The server is running but has no AI key configured, so nothing can be generated. Everything else on your account works normally.'
              : 'The part of MiZanova that generates suggestions cannot be reached. Everything else on your account works normally — the courses, the reading and your goals are all still there.'}
          </p>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            You are being told now rather than after you have written
            something. Nothing you type would have been sent.
          </p>
          <button
            type="button"
            onClick={() => void health.refetch()}
            className="mt-3 rounded-btn border border-border bg-card px-4 py-2 font-semibold text-foreground"
          >
            Try again
          </button>
        </div>
      )}

      {/* --- the box ------------------------------------------------------- */}
      <div className="rounded-card border border-border bg-card p-5 shadow-raised">
        {/* DICTATION, BECAUSE THIS IS THE HARDEST BOX IN THE PRODUCT TO TYPE
            INTO. Everywhere else somebody records a fact; here they describe
            something they are finding hard, which is more words and worse
            timing — and the people this account is for are the ones most
            likely to lose the thread halfway through a paragraph.

            DictatedTextarea already existed for behaviour logging and does
            exactly this, including falling back to a plain box where the
            browser has no speech recognition. Reused rather than rebuilt. */}
        <DictatedTextarea
          id="situation"
          label="What is going on?"
          hint="A sentence or two about the situation. What happens, when, and what you have already tried."
          rows={5}
          value={text}
          onChange={setText}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            /*
             * NOT DISABLED BY THE HEALTH CHECK, and that was a real bug I put
             * here. A page loaded before the server was up latched `aiDown`,
             * and the button then stayed dead even after the server came up —
             * somebody typed a paragraph into a button that would never light.
             * The banner informs; it does not gate. Pressing it when the
             * server is genuinely down gives the honest error it always did.
             */
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
                open={(openAsk ?? history.data[0]?.id) === request.id}
                onToggle={() =>
                  setOpenAsk(
                    (openAsk ?? history.data[0]?.id) === request.id
                      ? ''
                      : request.id,
                  )
                }
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
  open,
  onToggle,
}: {
  request: SelfRequest
  onDelete: () => void
  deleting: boolean
  open: boolean
  onToggle: () => void
}) {
  /* The TIME as well as the date. Somebody who asked four things on a Tuesday
     had four collapsed rows reading "Asked 6 September 2026", which
     distinguishes nothing — and this is a screen people use in bursts on the
     same day. */
  const asked = new Date(request.created_at).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <li className="rounded-card border border-border bg-card p-5 shadow-raised">
      {/* ---------------------------------------------------------------
          THE LATEST ONE IS OPEN, THE REST ARE A LINE EACH.
          ---------------------------------------------------------------
          Every past ask rendered its question and all three suggestions in
          full, so somebody who had used this five times met a page that never
          ended — and the thing they came back for, the answer they just got,
          was at the top of an unbounded scroll rather than the page.

          Collapsed, an ask is still completely legible: the date and their own
          question, which is how anybody would recognise one. The answers are
          one press away, and the most recent is already open because that is
          the one somebody almost always wants.
          --------------------------------------------------------------- */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="text-sm font-medium text-primary hover:underline"
        >
          Asked {asked}
          {!open && request.individual_ai_suggestions.length > 0 && (
            <span className="ml-2 font-normal text-muted-foreground">
              — {request.individual_ai_suggestions.length} suggestion
              {request.individual_ai_suggestions.length === 1 ? '' : 's'}
            </span>
          )}
        </button>
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
      {open && request.redaction_count > 0 && (
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
      {open && request.risk_flagged && (
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

      {open && request.individual_ai_suggestions.length > 0 && (
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
      {open && request.withheld_count > 0 && (
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
