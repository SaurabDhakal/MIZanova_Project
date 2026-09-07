import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addMyGoal,
  deleteSelfRequest,
  fetchAiHealth,
  fetchAiMemory,
  fetchMyGoalsPersonal,
  fetchMySelfRequests,
  setAiMemory,
  setSuggestionOutcome,
  queryKeys,
  requestSelfStrategies,
  type SelfRequest,
  type SelfSuggestion,
} from '../../lib/api'
import { showToast } from '../../lib/toast'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import Icon from '../../components/Icon'
import DictatedTextarea from '../../components/DictatedTextarea'
import { Link } from 'react-router-dom'
import WhatWorksLink from '../../components/WhatWorksLink'

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
  const [openFact, setOpenFact] = useState<'limits' | 'privacy' | null>(null)
  /* Three, then the rest on ask. Somebody who has used this for a month has
     thirty, and a page that never ends is the same fault as the one collapsing
     the old answers fixed. */
  const [showAllAsks, setShowAllAsks] = useState(false)

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

  /* db/107. Read here rather than taken from the profile the app already
     holds, so what the button does matches what the switch says at the moment
     it is pressed. */
  const memory = useQuery({ queryKey: queryKeys.aiMemory, queryFn: fetchAiMemory })
  const goals = useQuery({
    queryKey: queryKeys.myPersonalGoals,
    queryFn: fetchMyGoalsPersonal,
  })

  const setMemory = useMutation({
    mutationFn: setAiMemory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.aiMemory })
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const ask = useMutation({
    mutationFn: ({ text, about }: { text: string; about?: string }) =>
      requestSelfStrategies(text, about),
    onSuccess: async () => {
      setText('')
      /* A follow-up's answer is the newest thing in the list, and the list
         opens whichever is newest — so nothing has to be told to open it. */
      setOpenAsk(null)
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

  /*
   * ---------------------------------------------------------------------
   * SOMEWHERE TO START, BECAUSE AN EMPTY BOX IS THE HARDEST THING TO ANSWER
   * ---------------------------------------------------------------------
   * This is the feature the product is sold on, and it opened with a blank
   * textarea and a placeholder. Somebody who came here because they are
   * struggling to start things is exactly the person who will not start here
   * either — and the ones who do tend to write three words, which produces a
   * thin answer and confirms their suspicion that it was not worth it.
   *
   * docs/14 names this pattern by name: "Suggestion chips along the bottom of
   * a screen — context-specific starting points". These are openings rather
   * than questions, because the box asks what is going on and a chip that asks
   * a question would be answering it.
   */
  const openings = [
    'I lose the whole morning before I start anything',
    'I keep putting off the same task every week',
    'Meetings leave me wiped out for the rest of the day',
    'I cannot switch off at night',
    'I forget things people have told me',
  ]

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Ask for suggestions</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Describe something you are finding hard and get one or two practical
          things to try.
        </p>
      </header>

      {/* ---------------------------------------------------------------
          THE QUESTIONS STAY VISIBLE; THE ANSWERS FOLD.
          ---------------------------------------------------------------
          These were two paragraphs open on every visit. Both are read once and
          both were pushing the box down the page, which is the complaint.

          What is NOT done here is hiding them behind a single "learn more".
          The headings are the two questions somebody has before typing
          something personal — will it tell me what is wrong with me, and who
          reads this — and leaving them on the page means the answers are
          visibly available rather than something you would have to suspect
          exists. It is the move NotBuiltYet and PageNote already made in this
          codebase: fold, never delete.
          --------------------------------------------------------------- */}
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          {
            key: 'limits' as const,
            icon: 'hand' as const,
            label: 'What it will not do',
            body: 'A starting point, not an answer. It never names a condition or hints at one, even if you ask directly, and gives no medical advice — that is a conversation for a GP.',
          },
          {
            key: 'privacy' as const,
            icon: 'privacy' as const,
            label: 'What happens to what you write',
            body: 'Your name, email, phone number and dates are stripped before it is sent. What you write is kept so you can read it again, nobody else can open it, and you can delete it below.',
          },
        ].map((f) => (
          <div key={f.key} className="w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setOpenFact(openFact === f.key ? null : f.key)}
              aria-expanded={openFact === f.key}
              className={`flex w-full items-center gap-2 rounded-btn border px-3 py-2 text-sm font-semibold ${
                openFact === f.key
                  ? 'border-primary bg-primary-subtle text-foreground'
                  : 'border-border bg-card text-foreground'
              }`}
            >
              <Icon name={f.icon} className="h-4 w-4 shrink-0 text-primary" />
              {f.label}
            </button>
            {openFact === f.key && (
              <p className="mt-2 max-w-prose rounded-card border border-border bg-background p-3 text-sm text-muted-foreground">
                {f.body}
              </p>
            )}
          </div>
        ))}
      </div>

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
        {!text.trim() && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Or start with one of these and change it
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {openings.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setText(o + ' ')}
                  className="rounded-btn border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:border-primary"
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------
            THE SWITCH, WITH THE ACTUAL COUNTS ON IT.
            ---------------------------------------------------------------
            "Let it use your history" is a checkbox somebody ticks without
            knowing what they agreed to. The numbers make it a real decision:
            they can see it is three goals and eleven check-ins, not a vague
            "your data".

            Off unless they turn it on, because Goals.tsx promises nobody else
            can see any of it and an AI is somebody else — db/107.
            --------------------------------------------------------------- */}
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-card border border-border bg-background p-3">
          <input
            type="checkbox"
            checked={memory.data ?? false}
            disabled={setMemory.isPending || memory.isPending}
            onChange={(e) => setMemory.mutate(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span className="text-sm">
            <span className="font-semibold text-foreground">
              Let it see what you are working on
            </span>
            <span className="mt-0.5 block text-muted-foreground">
              {/* THE COUNTS, AND NOTHING ELSE. This was fifty words explaining
                  redaction, defaults and reversibility — all true, all already
                  said in the panel above, and all of it turning a one-line
                  decision into a paragraph on the page somebody said was too
                  full of words. What somebody needs here is what would travel
                  and how much of it. */}
              {(() => {
                const active = (goals.data ?? []).filter(
                  (g) => g.status === 'active',
                )
                const checkins = active.reduce(
                  (n, g) => n + g.individual_goal_checkins.length,
                  0,
                )
                const asks = Math.min(history.data?.length ?? 0, 3)
                if (active.length === 0 && asks === 0) {
                  return 'Nothing to send yet — it starts working once you have a goal or have asked something.'
                }
                const bits = [
                  `${active.length} goal${active.length === 1 ? '' : 's'}`,
                  checkins > 0 &&
                    `${checkins} check-in${checkins === 1 ? '' : 's'}`,
                  asks > 0 && `${asks} recent question${asks === 1 ? '' : 's'}`,
                ].filter(Boolean)
                return `Sends ${bits.join(', ')} — redacted, and off again whenever you like.`
              })()}
            </span>
          </span>
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
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
            onClick={() => ask.mutate({ text: text.trim() })}
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

      {/* THIRTEEN SECONDS IS A LONG TIME TO LOOK AT A DISABLED BUTTON.
          That is what a real generation takes, and the only sign of life was
          the word "Thinking…" on a control somebody had just pressed. On the
          feature this product is sold on, that reads as nothing happening.

          It says what is actually going on, in the order it happens, because
          the first step is the one people care about and nobody would guess it
          otherwise: the details are stripped before anything is sent. */}
      {ask.isPending && (
        <section
          aria-live="polite"
          className="mt-6 rounded-card border border-border bg-primary-subtle p-5"
        >
          <p className="font-semibold text-foreground">Working on it</p>
          <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>Your name and contact details stripped out</li>
            <li>Sent, read, and a few things worth trying written back</li>
            <li>Anything too vague to be worth your time held back</li>
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">
            It takes about fifteen seconds. You can leave this page and come
            back &mdash; the answer is saved to your account either way.
          </p>
        </section>
      )}

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
          <h2 className="mt-10 mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Icon name="ai" className="h-5 w-5 shrink-0 text-primary" />
            What you have asked
            <span className="text-sm font-normal text-muted-foreground">
              {history.data.length}
            </span>
          </h2>
          <ul className="space-y-5">
            {history.data
              .slice(0, showAllAsks ? undefined : 3)
              .map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                onDelete={() => remove.mutate(request.id)}
                deleting={remove.isPending && remove.variables === request.id}
                onAskAbout={(id, question) =>
                  ask.mutate({ text: question, about: id })
                }
                asking={ask.isPending}
                onChanged={() =>
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.mySelfRequests,
                  })
                }
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

          {history.data.length > 3 && !showAllAsks && (
            <button
              type="button"
              onClick={() => setShowAllAsks(true)}
              className="mt-5 rounded-btn border border-border bg-card px-4 py-2.5 font-semibold text-foreground hover:border-primary"
            >
              See the other {history.data.length - 3}
            </button>
          )}
        </>
      )}

      <WhatWorksLink from="suggestions" />
    </div>
  )
}

/**
 * Turning a suggestion into something that survives the page.
 *
 * ---------------------------------------------------------------------------
 * THE GAP THIS CLOSES
 * ---------------------------------------------------------------------------
 * Somebody described what they were finding hard, waited, read a couple of
 * practical things to try — and then nothing happened to any of them. The suggestions
 * sat in a history and were never seen again. The one part of this product
 * that carries a thread from one week to the next is a goal, and there was no
 * way to get from here to there except retyping.
 *
 * So a suggestion becomes a goal with its own words as the title and the
 * person's own reason attached: they got this on a day they were struggling,
 * and that is exactly the "why" they will have forgotten in six weeks. db/101
 * built the goal to hold precisely that.
 *
 * NOT AUTOMATIC, AND NOT ON EVERY SUGGESTION AT ONCE. Three goals from one
 * question is a to-do list, and this product says in as many words that one
 * thing at a time is plenty.
 */
function SuggestionActions({
  suggestion,
  onChanged,
  onAskAbout,
  asking,
  askedAt,
}: {
  suggestion: SelfSuggestion
  onChanged: () => void
  onAskAbout: (suggestionId: string, question: string) => void
  asking: boolean
  askedAt: string
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [followUp, setFollowUp] = useState<string | null>(null)

  /*
   * ---------------------------------------------------------------------
   * THE ACTIONS FOLLOW THE AGE OF THE ANSWER
   * ---------------------------------------------------------------------
   * Four buttons sat on every suggestion — try it, ask about it, it helped,
   * not for me — and two of them asked about the past on an answer written ten
   * seconds ago. Nobody has tried anything yet, so "did it help" is not a
   * question, it is clutter competing with the two things somebody might
   * actually do.
   *
   * A day is the line. Before it, the answer is new and the useful actions are
   * forward-looking; after it, they have had a night and a morning with it and
   * whether it worked is the only thing worth asking. Two controls at a time
   * rather than four, and each one is a question that makes sense when it is
   * asked.
   */
  /* The clock read once at mount, not on every render — the linter is right
     that a clock read during render is not a pure value, and a card must not
     change what it offers while somebody is looking at it. */
  const [now] = useState(() => Date.now())
  const oldEnoughToHaveTried = now - +new Date(askedAt) > 20 * 3600 * 1000

  const outcome = useMutation({
    mutationFn: (o: 'helped' | 'didnt_help' | null) =>
      setSuggestionOutcome(suggestion.id, o),
    onSuccess: onChanged,
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  /* ALREADY ANSWERED. It says what they said, and lets them take it back —
     somebody who pressed the wrong one should not be stuck with a record that
     is not true, and the model is reading these. */
  if (suggestion.outcome) {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`inline-flex items-center gap-1.5 font-semibold ${
            suggestion.outcome === 'helped'
              ? 'text-success-foreground'
              : 'text-muted-foreground'
          }`}
        >
          <Icon
            name={suggestion.outcome === 'helped' ? 'tick' : 'cross'}
            className="h-4 w-4 shrink-0"
          />
          {suggestion.outcome === 'helped'
            ? 'You said this helped'
            : 'You said this was not for you'}
        </span>
        <button
          type="button"
          onClick={() => outcome.mutate(null)}
          className="text-muted-foreground hover:underline"
        >
          Undo
        </button>
      </p>
    )
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {state === 'saved' ? (
        <p className="text-sm text-success-foreground">
          Added to what you are working on.{' '}
          <Link
            to="/individual/goals"
            className="font-semibold text-primary hover:underline"
          >
            See it
          </Link>
        </p>
      ) : oldEnoughToHaveTried ? null : (
        <button
          type="button"
          disabled={state === 'saving'}
          onClick={() => {
            setState('saving')
            addMyGoal({
              title: suggestion.title,
              why: 'From a suggestion, on a day I was finding this hard.',
              targetDate: null,
            })
              .then(() => setState('saved'))
              .catch((e: Error) => {
                setState('idle')
                showToast(e.message, 'error')
              })
          }}
          className="inline-flex items-center gap-1.5 rounded-btn border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground hover:border-primary disabled:opacity-50"
        >
          {/* The icon says where it goes — this button makes a goal, and the
              goals screen wears the same one in the sidebar. */}
          <Icon name="goals" className="h-4 w-4 shrink-0" />
          {state === 'saving' ? 'Adding…' : 'I want to try this'}
        </button>
      )}

      {/* ---------------------------------------------------------------
          ASKING ABOUT THIS ONE — db/110.
          ---------------------------------------------------------------
          The obvious next thought on reading a suggestion is a question about
          it: "I cannot do that because I share a room", "which part do I do
          first". The only way to ask was to start again in the box at the top
          and describe the whole situation from scratch, hoping the model
          landed on the same idea so it could be pushed on — so most people
          would not, and a suggestion somebody cannot act on is worth nothing
          however good it was.

          The openings are the obstacles people actually hit, because "ask a
          follow-up" in an empty box has the same problem the main box had.
          --------------------------------------------------------------- */}
      <button
        type="button"
        onClick={() => setFollowUp(followUp === null ? '' : null)}
        aria-expanded={followUp !== null}
        className="inline-flex items-center gap-1.5 rounded-btn border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground hover:border-primary"
      >
        <Icon
          name={followUp === null ? 'messages' : 'cross'}
          className="h-4 w-4 shrink-0"
        />
        {followUp === null ? 'Ask about this' : 'Never mind'}
      </button>

      {followUp !== null && (
        <div className="mt-2 w-full rounded-card border border-border bg-card p-4">
          <label
            htmlFor={`fu-${suggestion.id}`}
            className="block text-sm font-semibold text-foreground"
          >
            What is in the way?
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              'I cannot do that because',
              'I have tried this before and',
              'Which part do I start with?',
            ].map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setFollowUp(o.endsWith('?') ? o : o + ' ')}
                className="rounded-btn border border-border bg-background px-3 py-1 text-sm text-foreground hover:border-primary"
              >
                {o}
              </button>
            ))}
          </div>
          <textarea
            id={`fu-${suggestion.id}`}
            rows={2}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            className="mt-2 w-full rounded-btn border border-input-border bg-background p-2.5 text-foreground"
          />
          <button
            type="button"
            disabled={asking || followUp.trim().length < 5}
            onClick={() => {
              onAskAbout(suggestion.id, followUp.trim())
              setFollowUp(null)
            }}
            className="mt-2 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {asking ? 'Asking…' : 'Ask'}
          </button>
        </div>
      )}

      {/* ---------------------------------------------------------------
          DID IT HELP — the step this product never had.
          ---------------------------------------------------------------
          Two answers, because "did this help" is answerable in the
          half-second somebody has and a five-point scale is a decision. The
          same reasoning db/101 used for three check-in options rather than
          five.

          It is not feedback for us. db/107 lets the model see what somebody
          is working on, and "I tried this and it did not help" is the single
          most useful thing it could be told — without it, it will suggest the
          same thing again in six weeks and be right to, because nothing ever
          said otherwise.
          --------------------------------------------------------------- */}
      {oldEnoughToHaveTried && (
        <span className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Did this help?</span>
          <button
            type="button"
            disabled={outcome.isPending}
            onClick={() => outcome.mutate('helped')}
            className="inline-flex items-center gap-1.5 rounded-btn border border-border bg-card px-3 py-1.5 font-semibold text-success-foreground hover:border-success disabled:opacity-50"
          >
            <Icon name="tick" className="h-4 w-4 shrink-0" />
            Yes
          </button>
          <button
            type="button"
            disabled={outcome.isPending}
            onClick={() => outcome.mutate('didnt_help')}
            className="inline-flex items-center gap-1.5 rounded-btn border border-border bg-card px-3 py-1.5 font-semibold text-muted-foreground hover:border-primary disabled:opacity-50"
          >
            <Icon name="cross" className="h-4 w-4 shrink-0" />
            Not for me
          </button>
        </span>
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
  onChanged,
  onAskAbout,
  asking,
}: {
  request: SelfRequest
  onDelete: () => void
  deleting: boolean
  open: boolean
  onToggle: () => void
  onChanged: () => void
  onAskAbout: (suggestionId: string, question: string) => void
  asking: boolean
}) {
  /* The TIME as well as the date. Somebody who asked four things on a Tuesday
     had four collapsed rows reading "Asked 6 September 2026", which
     distinguishes nothing — and this is a screen people use in bursts on the
     same day. */
  const [confirming, setConfirming] = useState(false)
  const kept = request.individual_ai_suggestions.length

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
        {/* CONFIRMED, because this cascades. `individual_ai_suggestions` is
            ON DELETE CASCADE on request_id, so deleting a question also
            deletes every answer it produced — including any marked as having
            helped, which are the ones feeding the "what works for me" page.
            db/110 reasoned carefully about this deletion and made follow-ups
            survive it with ON DELETE SET NULL; the button then let it happen
            on a single misclick, with no undo.

            Same one-step shape as the goals list, for consistency. */}
        {confirming ? (
          <span className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-danger-foreground">
              Delete this question
              {kept > 0
                ? ` and the ${kept} suggestion${kept === 1 ? '' : 's'} under it`
                : ''}
              ?
            </span>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="font-semibold text-danger-foreground hover:underline disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete it'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="font-semibold text-foreground hover:underline"
            >
              Keep it
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={deleting}
            className="text-sm font-semibold text-muted-foreground hover:text-danger-foreground hover:underline disabled:opacity-50"
          >
            Delete this
          </button>
        )}
      </div>

      {/* SAYS WHAT IT IS. Without this a follow-up reads as somebody asking a
          strange half-question out of nowhere, because the thing it was about
          is further down the page. */}
      {request.about_suggestion_id && (
        <p className="mt-2 text-xs font-bold tracking-wider text-brand-blue uppercase">
          Following up on a suggestion
        </p>
      )}
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
          {request.individual_ai_suggestions.map((s, i) => (
            <li
              key={s.id}
              className="rounded-card border border-border bg-background p-4"
            >
              {/* NUMBERED, because three suggestions are a set of options
                  somebody is choosing between and an unnumbered stack of three
                  identical cards makes that a reading task rather than a
                  choice. */}
              <div className="flex items-start gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground tabular-nums">
                  {i + 1}
                </span>
                <p className="font-bold text-foreground">{s.title}</p>
              </div>
              <p className="mt-2 border-l-4 border-accent pl-3 text-foreground">
                {s.body}
              </p>
              <SuggestionActions
                suggestion={s}
                onChanged={onChanged}
                onAskAbout={onAskAbout}
                asking={asking}
                askedAt={request.created_at}
              />

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
