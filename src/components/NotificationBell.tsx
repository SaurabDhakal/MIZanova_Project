import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchWorkQueue, queryKeys, type WorkQueue } from '../lib/api'
import type { Role } from '../lib/roles'
import Icon from './Icon'

/**
 * What is waiting for you.
 *
 * ---------------------------------------------------------------------------
 * NO NOTIFICATIONS TABLE, AND THAT IS THE DESIGN RATHER THAN A SHORTCUT
 * ---------------------------------------------------------------------------
 * The obvious build is a `notifications` table with a read flag. This has no
 * such table, because read state would let somebody dismiss a safeguarding
 * incident without acknowledging it — the bell would go quiet while the queue
 * stayed full, and a bell you can silence without doing the work is a bell that
 * lies. On a product holding children's records that is not a small lie.
 *
 * Every line here is counted live from work that already exists. An item leaves
 * when the work is done and not before, so the count is always true and there
 * is nothing to mark as read.
 *
 * ---------------------------------------------------------------------------
 * EVERY ROLE, AND EVERY ROLE'S LINE IS A REAL ONE
 * ---------------------------------------------------------------------------
 * Saurab asked for a bell for everybody. The way to give one to everybody
 * without inventing anything was to go and find what each role actually has
 * queued, rather than to show four roles a number and the fifth an empty box:
 *
 *   platform admin  staff awaiting verification, screening about to lapse,
 *                   untouched specialist applications, unanswered enquiries
 *   school admin    flagged incidents nobody has acknowledged, unread replies
 *   specialist      suggestions held back from teachers, unread conversations
 *   educator        conversations somebody is waiting on a reply to
 *   parent          the same, plus invoices still to pay
 *
 * Each line links to the screen that clears it, which is the test a line has to
 * pass to be here at all. That test is what turned up the missing Messages
 * screens: specialists were already in threads with nowhere to read them, and a
 * school admin could start a conversation and never see the answer. Both screens
 * exist now, so both lines have somewhere to point.
 *
 * ---------------------------------------------------------------------------
 * TWO MINUTES STALE, AND COUNTED IN THE DATABASE
 * ---------------------------------------------------------------------------
 * Almost every count comes back as a number with no rows attached — see
 * `fetchWorkQueue`. That matters because this is mounted on every screen: the
 * list fetchers these replaced would have read every live screening check, with
 * names, to render one digit. Two minutes then means a page-to-page walk costs
 * nothing at all, while an incident logged in class shows up here well inside
 * the time it takes anybody to walk to the office.
 */

const STALE = 2 * 60 * 1000

type Item = {
  key: string
  label: string
  detail: string
  to: string
  /** Somebody is at risk, or a legal check has lapsed. Colours the badge red. */
  urgent?: boolean
}

/** `1 thing` / `2 things`, without an "(s)" anywhere in the product. */
/*
 * `plural` covers the LABEL. The details beside them were fixed strings, and
 * two of them disagreed with the number they sat under: "1 specialist
 * application — Nobody has opened THESE yet", and "3 new enquiries — A SCHOOL
 * asked to talk to us". A caption that contradicts its own figure makes a
 * reader distrust the figure rather than the sentence, and the same pair of
 * mistakes existed on Global Overview, which has its own copy of this text.
 */
function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * The queue counts, turned into lines somebody can act on.
 *
 * Kept out of the component so the rule is readable in one place: a key that is
 * absent does not apply to this role, null means the count could not be read,
 * and 0 means genuinely nothing — three different things that must not collapse
 * into each other.
 */
function itemsFor(queue: WorkQueue, basePath: string) {
  const items: Item[] = []
  let unreadable = 0

  const add = (
    value: number | null | undefined,
    build: (n: number) => Item,
  ) => {
    if (value === undefined) return // not this role's queue
    if (value === null) unreadable += 1 // asked, and could not be told
    else if (value > 0) items.push(build(value))
  }

  add(queue.staffAwaitingVerification, (n) => ({
    key: 'verification',
    label: `${plural(n, 'person', 'people')} awaiting verification`,
    detail: 'They can see no student records until you decide',
    to: `${basePath}/verification`,
  }))

  add(queue.screeningDueSoon, (n) => ({
    key: 'screening',
    label: `${plural(n, 'screening check', 'screening checks')} expiring`,
    detail: 'Within thirty days, or already lapsed',
    to: `${basePath}/screening`,
    urgent: true,
  }))

  add(queue.newApplications, (n) => ({
    key: 'applications',
    label: `${plural(n, 'specialist application', 'specialist applications')}`,
    detail: n === 1 ? 'Nobody has opened this yet' : 'Nobody has opened these yet',
    to: `${basePath}/applications`,
  }))

  add(queue.newEnquiries, (n) => ({
    key: 'enquiries',
    label: `${plural(n, 'new enquiry', 'new enquiries')}`,
    detail:
      n === 1
        ? 'A school asked to talk to us and has had no reply'
        : 'Schools asked to talk to us and have had no reply',
    to: `${basePath}/enquiries`,
  }))

  add(queue.openSafeguarding, (n) => ({
    key: 'safeguarding',
    label: `${plural(n, 'flagged incident', 'flagged incidents')} open`,
    detail: 'Waiting for an administrator to acknowledge',
    to: `${basePath}/safeguarding`,
    urgent: true,
  }))

  add(queue.strategiesAwaitingReview, (n) => ({
    key: 'review-queue',
    label: `${plural(n, 'suggestion', 'suggestions')} held for review`,
    detail: 'No teacher can see these until you clear them',
    to: `${basePath}/review-queue`,
    urgent: true,
  }))

  add(queue.unreadThreads, (n) => ({
    key: 'messages',
    label: `${plural(n, 'conversation', 'conversations')} unread`,
    detail: 'Somebody has written and had no reply',
    to: `${basePath}/messages`,
  }))

  add(queue.invoicesDue, (n) => ({
    key: 'invoices',
    label: `${plural(n, 'invoice', 'invoices')} to pay`,
    detail: 'Issued and not settled yet',
    to: `${basePath}/finance`,
  }))

  /*
   * db/072's two sides, and they are different questions.
   *
   * A platform admin is owed money nobody has chased — so this counts only
   * invoices PAST their due date, because one issued this morning is not work.
   *
   * A school admin owes it — so theirs counts every issued invoice, because
   * "you have one to pay" is the prompt that prevents the overdue one, and
   * waiting until it is late would be withholding it.
   */
  add(queue.platformInvoicesOverdue, (n) => ({
    key: 'platform-invoices-overdue',
    label: `${plural(n, 'school invoice', 'school invoices')} past ${n === 1 ? 'its' : 'their'} due date`,
    detail: 'Issued to a school and not paid by the date on it',
    to: `${basePath}/subscriptions`,
  }))

  add(queue.platformInvoicesToPay, (n) => ({
    key: 'platform-invoices-to-pay',
    label: `${plural(n, 'invoice', 'invoices')} from Special Miles`,
    detail: 'Issued to your school and not settled yet',
    // Settings, not this role's basePath: what a school pays Special Miles
    // lives on Settings > School, beside the rest of that relationship.
    to: '/account/school',
  }))

  return { items, unreadable }
}

export default function NotificationBell({
  role,
  basePath,
}: {
  role: Role
  basePath: string
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.workQueue(role),
    queryFn: () => fetchWorkQueue(role),
    staleTime: STALE,
  })

  /* CLOSES ON A CLICK ANYWHERE ELSE, on `mousedown` rather than `click`: a
     click that starts inside the panel and finishes outside it is a text
     selection, and closing the panel out from under a drag is maddening. */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      // Focus goes back to the button that opened it. Escaping a panel and
      // landing at the top of the document is how a keyboard user loses
      // their place.
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const { items, unreadable } = itemsFor(data ?? {}, basePath)
  const count = items.length
  const anyUrgent = items.some((i) => i.urgent)
  /* isError is the whole request failing — offline, or the session gone.
     `unreadable` is one count inside a request that otherwise worked. Both
     mean "we cannot tell you", and neither may render as nothing waiting. */
  const cannotTell = isError || unreadable > 0

  return (
    /*
     * POSITIONED FROM `sm` UP, AND DELIBERATELY NOT BELOW IT.
     *
     * The panel is 320px and hangs to the left of a button that sits 96px in
     * from the right edge — measured on a 375px phone, that put its left edge
     * at -41 and cut the first word off every line. Below `sm` the wrapper is
     * left static so the panel anchors to the header instead and spans the
     * screen with a gutter each side; from `sm` up it anchors to the button
     * again, which is where it belongs when there is room.
     */
    <div ref={boxRef} className="sm:relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        /* THE COUNT IS IN THE NAME, not only in a coloured dot. Otherwise a
           screen reader announces "Notifications" identically whether four
           things are waiting or none, which is the one thing this control
           exists to tell you. */
        aria-label={
          isPending
            ? 'Notifications, still loading'
            : cannotTell
              ? 'Notifications, could not be checked'
              : count > 0
                ? `Notifications, ${count} waiting`
                : 'Notifications, nothing waiting'
        }
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-btn text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <Icon name="bell" className="h-5 w-5" />
        {!isPending && (count > 0 || cannotTell) && (
          <span
            aria-hidden="true"
            className={`absolute top-1.5 right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold text-white ${
              anyUrgent || cannotTell ? 'bg-danger' : 'bg-primary'
            }`}
          >
            {/* A queue we could not read is shown as a question, never as a
                number we do not have. */}
            {count > 0 ? count : '?'}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="What needs you"
          className="absolute top-full right-3 left-3 z-50 mt-1.5 overflow-hidden rounded-card border border-border bg-card shadow-lifted sm:top-auto sm:right-0 sm:left-auto sm:w-80"
        >
          <p className="border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            What needs you
          </p>

          {isPending && (
            <p className="px-4 py-4 text-sm text-muted-foreground">Checking…</p>
          )}

          {items.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block border-b border-border px-4 py-3 last:border-b-0 hover:bg-background"
            >
              <span
                className={`block text-sm font-semibold ${
                  item.urgent ? 'text-danger-foreground' : 'text-foreground'
                }`}
              >
                {item.label}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {item.detail}
              </span>
            </NavLink>
          ))}

          {!isPending && count === 0 && !cannotTell && (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              Nothing waiting. This counts real work rather than messages, so it
              empties when the queues do.
            </p>
          )}

          {/* SAYS SO RATHER THAN COUNTING ZERO. A queue that could not be read
              is not an empty queue, and this is the one place somebody looks to
              find out whether anything needs them. */}
          {!isPending && cannotTell && (
            <p className="border-t border-border px-4 py-3 text-xs text-danger-foreground">
              {isError
                ? 'Nothing could be checked just now, so something may be waiting that is not listed here.'
                : `${unreadable === 1 ? 'One queue' : `${unreadable} queues`} could not be checked, so something may be waiting that is not listed here.`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
