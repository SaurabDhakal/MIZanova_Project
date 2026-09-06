import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchMyGoalsPersonal,
  fetchMySelfRequests,
  queryKeys,
  type SelfSuggestion,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import Icon from '../../components/Icon'

/**
 * "What works for me" — a page somebody can hand to another person.
 *
 * ---------------------------------------------------------------------------
 * THE ONE THING HERE THAT IS NOT A COMMODITY
 * ---------------------------------------------------------------------------
 * Everything else this account offers can be got elsewhere and mostly for
 * nothing. A general-purpose chatbot writes better generic advice than this
 * product ever will, and it is free.
 *
 * What it cannot do is hold six months of somebody's history. After a while
 * this account knows which suggestions that person marked as having helped,
 * which they marked as useless, what they decided to work on and in whose
 * words, and how the check-ins went. Nothing outside MiZanova has that, and
 * the person themselves cannot easily reconstruct it — remembering which of
 * eleven things actually stuck is exactly the task they find hardest, which is
 * why db/108 exists at all.
 *
 * So this turns that history into one page: for a GP, an employer being asked
 * for workplace adjustments, a university disability office, an NDIS plan
 * review, or a new specialist on the first appointment instead of spending it
 * on history-taking.
 *
 * ---------------------------------------------------------------------------
 * WHAT PROMPTED A SUGGESTION IS NEVER IN IT
 * ---------------------------------------------------------------------------
 * This is the most important decision on the page and the easiest to get
 * wrong. The obvious build includes the question — it is the richest text in
 * the account and it reads as context.
 *
 * It is also the disclosure. "I keep missing deadlines because I cannot start
 * anything and my manager has noticed" is precisely what somebody must not
 * hand their manager. The useful half is the answer: "break the first step
 * down to something that takes two minutes".
 *
 * So the strategies appear and the questions never do — not as an option, not
 * behind a checkbox. The same reasoning as the specialist's booking email,
 * which carries the time and nothing about what the person wrote.
 *
 * ---------------------------------------------------------------------------
 * THEY CHOOSE WHAT GOES IN, ITEM BY ITEM
 * ---------------------------------------------------------------------------
 * A document about somebody, handed by them to someone with power over them —
 * an employer, an assessor — has to be theirs to edit. Everything starts
 * included, because the common case is "print the lot", and every line can be
 * taken out. Nothing is chosen on their behalf.
 *
 * ---------------------------------------------------------------------------
 * IT SAYS WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 * Receipts prints "this is a receipt, not a tax invoice" because a document
 * about money that looks official and is not is worse than one that is clear
 * about itself. This is the same risk with more at stake: a page listing
 * strategies, printed by a health-adjacent product, will be read as clinical
 * evidence unless it says plainly that it is self-reported and that nothing
 * here diagnoses or assesses anybody. That line is not a disclaimer bolted on
 * — it is what makes the document honest enough to hand over.
 *
 * ---------------------------------------------------------------------------
 * NO MIGRATION, AND NO NEW READS
 * ---------------------------------------------------------------------------
 * Assembled in the browser from `fetchMyGoalsPersonal` and
 * `fetchMySelfRequests` — the same two calls the Goals and Suggestions screens
 * already make, so RLS decides what is in it and this page cannot show
 * anything the person could not already see. Storing a generated copy would
 * add a table, a policy and a second thing to keep in step, to hold what these
 * two reads produce on demand.
 */
export default function WhatWorks() {
  const { profile } = useAuth()

  const goals = useQuery({
    queryKey: queryKeys.myGoals,
    queryFn: fetchMyGoalsPersonal,
  })
  const requests = useQuery({
    queryKey: queryKeys.mySelfRequests,
    queryFn: fetchMySelfRequests,
  })

  /* Left out rather than kept in: the set holds what has been REMOVED, so
     anything that arrives later is included by default. A set of what is
     included would silently exclude every new goal and every suggestion
     answered after the page was first opened. */
  const [dropped, setDropped] = useState<Set<string>>(new Set())
  const [showName, setShowName] = useState(true)

  const toggle = (id: string) =>
    setDropped((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const suggestions = useMemo(() => {
    const all: SelfSuggestion[] = []
    for (const r of requests.data ?? []) {
      for (const s of r.individual_ai_suggestions ?? []) all.push(s)
    }
    return all
  }, [requests.data])

  if (goals.isPending || requests.isPending) return <LoadingCards count={3} />
  if (goals.isError) {
    return (
      <ErrorState
        message={goals.error.message}
        onRetry={() => void goals.refetch()}
      />
    )
  }
  if (requests.isError) {
    return (
      <ErrorState
        message={requests.error.message}
        onRetry={() => void requests.refetch()}
      />
    )
  }

  const helped = suggestions.filter((s) => s.outcome === 'helped')
  const didnt = suggestions.filter((s) => s.outcome === 'didnt_help')
  const working = (goals.data ?? []).filter((g) => g.status !== 'parked')

  /* NOTHING IS REMOVED FROM THE SCREEN, only from the printed page.
     The first version filtered excluded rows out of the list, which meant
     taking one out made it vanish with no way to put it back short of
     reloading — a control that is easy to press and impossible to undo, on a
     page whose whole point is deciding what to disclose. Everything stays
     visible and struck through; `print-hide` is what actually leaves it out. */
  const allIn = <T extends { id: string }>(rows: T[]) =>
    rows.every((r) => dropped.has(r.id))

  // A heading with every line under it struck out must not print either.
  const goalsOut = working.length === 0 || allIn(working)
  const helpedOut = helped.length === 0 || allIn(helped)
  const didntOut = didnt.length === 0 || allIn(didnt)
  const empty = goalsOut && helpedOut && didntOut

  const nothingRecordedYet =
    working.length === 0 && helped.length === 0 && didnt.length === 0

  const who = profile?.full_name?.trim() || profile?.email || ''

  return (
    <div>
      {/* ---------------- the screen, not the document ---------------- */}
      <header className="print-hide mb-6">
        <h1 className="text-title text-foreground">What works for me</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          One page you can print or hand to somebody &mdash; a GP, an employer
          asking what adjustments would help, a university disability office, or
          a specialist you are seeing for the first time. It is built from what
          you have told this account, and you choose what goes in.
        </p>
      </header>

      {/* ---------------------------------------------------------------
          NOTHING TO SAY YET, SAID ONCE AND PROPERLY.
          ---------------------------------------------------------------
          A brand new account has no goals and no answered suggestions, and
          printing an empty page with three headings on it would look broken.
          This says what to do instead, and names the two things that fill it.
          --------------------------------------------------------------- */}
      {nothingRecordedYet && (
        <div className="print-hide rounded-card border border-border bg-card p-6 shadow-raised">
          <p className="max-w-prose text-muted-foreground">
            There is nothing here yet, because this page is built from what you
            have already told MiZanova. Two things fill it: something you decide
            to work on, and saying whether a suggestion helped after you have
            tried it. Neither takes long, and after a few weeks this becomes a
            page worth handing to somebody.
          </p>
        </div>
      )}

      {!nothingRecordedYet && (
        <>
          {/* ------------- what goes in, chosen by them ------------- */}
          <section className="print-hide mb-6 rounded-card border border-border bg-background p-5">
            <h2 className="font-semibold text-foreground">What goes in</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Everything is included to start with. Untick anything you would
              rather not hand over &mdash; it stays in your account either way.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={showName}
                onChange={(e) => setShowName(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Put my name on it
            </label>
            {!showName && (
              <p className="mt-1 text-xs text-muted-foreground">
                It will print with no name and no email address on it.
              </p>
            )}
          </section>

          {/* ---------------- THE DOCUMENT ITSELF ---------------- */}
          <article className="rounded-card border border-border bg-card p-6 shadow-raised">
            <div className="border-b border-border pb-4">
              <p className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                What works for me
              </p>
              {showName && who && (
                <h2 className="mt-1 text-2xl font-bold text-foreground">
                  {who}
                </h2>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                Prepared{' '}
                {new Date().toLocaleDateString('en-AU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>

            {empty && (
              <p className="print-hide mt-6 text-muted-foreground">
                You have taken everything out, so there is nothing to print.
              </p>
            )}

            {working.length > 0 && (
              <section
                className={`print-keep mt-6 ${goalsOut ? 'print-hide' : ''}`}
              >
                <h3 className="font-bold text-foreground">
                  What I am working on
                </h3>
                <ul className="mt-3 space-y-4">
                  {working.map((g) => {
                    const checkins = g.individual_goal_checkins ?? []
                    const good = checkins.filter(
                      (c) => c.how_it_went === 'good',
                    ).length
                    const out = dropped.has(g.id)
                    return (
                      <li
                        key={g.id}
                        className={`flex gap-3 ${out ? 'print-hide opacity-50' : ''}`}
                      >
                        <Remove id={g.id} out={out} onToggle={toggle} />
                        <div className={`min-w-0 ${out ? 'line-through' : ''}`}>
                          <p className="font-semibold text-foreground">
                            {g.title}
                          </p>
                          {g.why && (
                            <p className="mt-0.5 text-muted-foreground">
                              {g.why}
                            </p>
                          )}
                          {/* A COUNT, NOT A SCORE. db/101 refused streaks and
                              percentages because a number that resets to zero
                              after a bad fortnight is a punishment. Saying how
                              many check-ins there were and how many went well
                              is a fact; turning it into 43% is a judgement, and
                              a judgement in a document going to an employer is
                              the last thing this should manufacture. */}
                          {checkins.length > 0 && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {checkins.length}{' '}
                              {checkins.length === 1 ? 'check-in' : 'check-ins'}
                              {good > 0 && `, ${good} of them good`}.
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {helped.length > 0 && (
              <section
                className={`print-keep mt-8 ${helpedOut ? 'print-hide' : ''}`}
              >
                <h3 className="font-bold text-foreground">
                  Things that have helped
                </h3>
                <ul className="mt-3 space-y-4">
                  {helped.map((s) => (
                    <li
                      key={s.id}
                      className={`flex gap-3 ${dropped.has(s.id) ? 'print-hide opacity-50' : ''}`}
                    >
                      <Remove id={s.id} out={dropped.has(s.id)} onToggle={toggle} />
                      <div
                        className={`min-w-0 ${dropped.has(s.id) ? 'line-through' : ''}`}
                      >
                        <p className="font-semibold text-foreground">
                          {s.title}
                        </p>
                        <p className="mt-0.5 text-muted-foreground">{s.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* WHAT DID NOT WORK IS THE HALF PEOPLE LEAVE OUT, and it is often
                the more useful one. Somebody arriving at a new specialist has
                usually been told to try the obvious things already; a list of
                what has been tried and did not help saves them a month of
                being handed it again. */}
            {didnt.length > 0 && (
              <section
                className={`print-keep mt-8 ${didntOut ? 'print-hide' : ''}`}
              >
                <h3 className="font-bold text-foreground">
                  Things I have tried that did not help
                </h3>
                <ul className="mt-3 space-y-4">
                  {didnt.map((s) => (
                    <li
                      key={s.id}
                      className={`flex gap-3 ${dropped.has(s.id) ? 'print-hide opacity-50' : ''}`}
                    >
                      <Remove id={s.id} out={dropped.has(s.id)} onToggle={toggle} />
                      <div
                        className={`min-w-0 ${dropped.has(s.id) ? 'line-through' : ''}`}
                      >
                        <p className="font-semibold text-foreground">
                          {s.title}
                        </p>
                        <p className="mt-0.5 text-muted-foreground">{s.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* SAYS WHAT IT IS NOT — Receipts' rule, with more at stake. */}
            {!empty && (
              <p className="print-keep mt-8 max-w-prose border-t border-border pt-4 text-xs text-muted-foreground">
                This page was written by the person named on it, using
                MiZanova. It is a record of what they have found helpful and
                what they have not. It is not an assessment, a diagnosis or a
                clinical opinion, nobody has been tested for anything, and no
                clinician has reviewed it. The strategies were suggested by
                software and kept because this person tried them and said they
                worked.
              </p>
            )}
          </article>

          {!empty && (
            <button
              type="button"
              onClick={() => window.print()}
              className="print-hide mt-6 inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
            >
              <Icon name="resources" className="h-4 w-4 shrink-0" />
              Print or save as PDF
            </button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Take one line out.
 *
 * `print-hide` so the control never prints, and a real button rather than a
 * checkbox because it does not represent a value being submitted anywhere — it
 * removes a line from a page that exists only until it is printed.
 */
function Remove({
  id,
  out,
  onToggle,
}: {
  id: string
  out: boolean
  onToggle: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      className="print-hide mt-0.5 shrink-0 rounded-btn border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground"
      aria-label={out ? 'Put this back in' : 'Leave this out'}
      title={out ? 'Put this back in' : 'Leave this out'}
    >
      <Icon name={out ? 'tick' : 'cross'} className="h-3.5 w-3.5" />
    </button>
  )
}
