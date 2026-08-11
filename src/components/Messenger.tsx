import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchCareTeam,
  fetchMessages,
  fetchThreads,
  markThreadRead,
  queryKeys,
  sendMessage,
  startThread,
  type ThreadRow,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { ROLE_CONFIG } from '../lib/roles'
import { EmptyState, ErrorState, LoadingCards } from './QueryState'

/**
 * Secure messaging between a family and a child's care team - text only.
 * docs/Figma Pages Design/Parent Messages.png.
 *
 * Two panes on a laptop; on a phone the list and the conversation are separate
 * screens, because a 375px-wide split view is unusable and parents are the
 * mobile-first audience (NFR3).
 *
 * Not built, deliberately: attachments, the online indicator, and read
 * receipts on individual messages. Each needs infrastructure we do not have
 * (storage rules, realtime presence), and a half-working version of any of
 * them in a channel families use to raise concerns is worse than its absence.
 */

function whenLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function Messenger({
  studentId,
}: {
  /** Null means "all my conversations". A value filters to that one student. */
  studentId: string | null
}) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const threads = useQuery({
    queryKey: queryKeys.threads,
    queryFn: fetchThreads,
  })

  const careTeam = useQuery({
    queryKey: queryKeys.careTeam(studentId ?? ''),
    queryFn: () => fetchCareTeam(studentId!),
    enabled: Boolean(studentId),
  })

  const messages = useQuery({
    queryKey: queryKeys.messages(activeId ?? ''),
    queryFn: () => fetchMessages(activeId!),
    enabled: Boolean(activeId),
  })

  // Scroll to the newest message when the conversation changes or grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.data])

  // Marking read is a side effect of opening a thread, not of rendering it.
  useEffect(() => {
    if (!activeId) return
    void markThreadRead(activeId).then(() =>
      queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
    )
  }, [activeId, queryClient])

  const send = useMutation({
    mutationFn: () => sendMessage(activeId!, draft),
    onSuccess: async () => {
      setDraft('')
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages(activeId!),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
      ])
    },
  })

  const begin = useMutation({
    // Only reachable when a student is selected — the button that calls this
    // is not rendered otherwise.
    mutationFn: (otherId: string) => startThread(studentId!, otherId),
    onSuccess: async (threadId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.threads })
      setActiveId(threadId)
    },
  })

  /** The other person in a two-person thread. */
  const counterpart = (thread: ThreadRow) =>
    thread.thread_participants.find((p) => p.profile_id !== profile?.id)
      ?.profiles ?? null

  const unreadCount = (thread: ThreadRow) => {
    const mine = thread.thread_participants.find(
      (p) => p.profile_id === profile?.id,
    )
    if (!mine?.last_read_at) return thread.messages.length
    return thread.messages.filter(
      (m) => new Date(m.created_at) > new Date(mine.last_read_at!),
    ).length
  }

  // The filter actually filters. Anything else is a control that lies about
  // what it does — you pick a student, the list does not change, and you end
  // up messaging about a different child than the one on screen.
  const visibleThreads = (threads.data ?? []).filter(
    (t) => studentId === null || t.student_id === studentId,
  )

  // Derived, not stored. A conversation excluded by the current filter simply
  // stops being `active` — no effect needed to go and clear the id, and no
  // extra render pass. Everything below keys off `active`, not `activeId`.
  const active = visibleThreads.find((t) => t.id === activeId) ?? null
  const activeWith = active ? counterpart(active) : null

  // Anyone on THIS STUDENT'S care team we do not already have a thread with.
  //
  // The student filter is load-bearing. Without it, having a conversation with
  // a specialist about one child silently blocked starting one with the same
  // specialist about another — the person disappeared from the list with no
  // explanation, and threads are per-student by design.
  const existingWith = new Set(
    (threads.data ?? [])
      .filter((t) => t.student_id === studentId)
      .flatMap((t) =>
        t.thread_participants
          .filter((p) => p.profile_id !== profile?.id)
          .map((p) => p.profile_id),
      ),
  )
  const canStartWith = (careTeam.data ?? []).filter(
    (person) => !existingWith.has(person.id),
  )

  if (threads.isPending) return <LoadingCards count={2} />
  if (threads.isError) return <ErrorState message={threads.error.message} />

  return (
    <div className="lg:flex lg:gap-5">
      {/* --- Conversation list ------------------------------------------- */}
      {/* Hidden on phones once a conversation is open: two panes at 375px is
          unusable, so the list behaves like a separate screen. */}
      <div
        className={`lg:w-80 lg:shrink-0 ${active ? 'hidden lg:block' : ''}`}
      >
        {visibleThreads.length === 0 && canStartWith.length === 0 && (
          <EmptyState
            title={
              studentId
                ? 'No conversations about this student yet'
                : 'No conversations yet'
            }
            detail={
              studentId
                ? 'Start one below, or choose a different student.'
                : 'Conversations become available once staff are assigned and guardians are linked.'
            }
          />
        )}

        {visibleThreads.length > 0 && (
          <ul className="overflow-hidden rounded-card border border-border bg-card shadow-raised">
            {visibleThreads.map((thread) => {
              const person = counterpart(thread)
              const unread = unreadCount(thread)
              const latest = [...thread.messages].sort((a, b) =>
                a.created_at < b.created_at ? 1 : -1,
              )[0]
              return (
                <li key={thread.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    onClick={() => setActiveId(thread.id)}
                    aria-current={thread.id === activeId ? 'true' : undefined}
                    className={`w-full px-4 py-3 text-left ${
                      thread.id === activeId
                        ? 'bg-primary-subtle'
                        : 'hover:bg-background'
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-semibold text-foreground">
                        {person?.full_name || 'Unknown'}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {whenLabel(thread.last_message_at)}
                      </span>
                    </div>
                    {/* Which child this is about. A staff inbox spans every
                        student they support, so the role alone is not enough
                        to tell two conversations apart. */}
                    <p className="text-xs font-medium text-primary">
                      {person ? ROLE_CONFIG[person.role].label : ''}
                      {thread.students?.display_name &&
                        ` · about ${thread.students.display_name}`}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="line-clamp-2 min-w-0 flex-1 text-sm text-muted-foreground">
                        {latest?.body ?? 'No messages yet'}
                      </p>
                      {unread > 0 && (
                        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                          {unread}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {studentId === null && (
          <p className="mt-4 rounded-card border border-border bg-card shadow-raised p-4 text-sm text-muted-foreground">
            Showing every conversation. Choose a student above to filter this
            list and start a new conversation.
          </p>
        )}

        {studentId !== null && canStartWith.length > 0 && (
          <div className="mt-4 rounded-card border border-border bg-card shadow-raised p-4">
            <p className="text-sm font-semibold text-foreground">
              Start a conversation
            </p>
            <ul className="mt-2 space-y-2">
              {canStartWith.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => begin.mutate(person.id)}
                    disabled={begin.isPending}
                    className="w-full rounded-btn border border-border px-3 py-2 text-left text-sm hover:border-primary disabled:opacity-60"
                  >
                    <span className="font-medium text-foreground">
                      {person.full_name || 'Unnamed'}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {ROLE_CONFIG[person.role].label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {begin.isError && (
              <p role="alert" className="mt-2 text-sm text-danger-foreground">
                {begin.error.message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* --- Conversation --------------------------------------------------- */}
      <div className={`min-w-0 flex-1 ${active ? '' : 'hidden lg:block'}`}>
        {!active ? (
          <div className="hidden h-full items-center justify-center rounded-card border border-border bg-card shadow-raised p-10 lg:flex">
            <p className="text-muted-foreground">
              Choose a conversation to read it.
            </p>
          </div>
        ) : (
          <div className="flex h-[70vh] flex-col rounded-card border border-border bg-card shadow-raised">
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="rounded-btn border border-border px-3 py-1.5 text-sm font-medium lg:hidden"
              >
                ← Back
              </button>
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {activeWith?.full_name || 'Unknown'}
                </p>
                <p className="text-xs font-medium text-primary">
                  {activeWith ? ROLE_CONFIG[activeWith.role].label : ''}
                  {active.students?.display_name &&
                    ` · about ${active.students.display_name}`}
                </p>
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.isPending && (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
              {messages.isError && (
                <ErrorState message={messages.error.message} />
              )}
              {messages.isSuccess && messages.data.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  No messages yet. Say hello.
                </p>
              )}

              {(messages.data ?? []).map((message) => {
                const mine = message.sender_id === profile?.id
                return (
                  <div
                    key={message.id}
                    className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-card px-4 py-2.5 ${
                        mine
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-foreground'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <p
                        className={`mt-1 text-xs ${
                          mine ? 'text-white/70' : 'text-muted-foreground'
                        }`}
                      >
                        <span className="sr-only">
                          {mine ? 'Sent by you at ' : 'Received at '}
                        </span>
                        {whenLabel(message.created_at)}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (draft.trim() !== '') send.mutate()
              }}
              className="flex items-end gap-2 border-t border-border p-3"
            >
              <label htmlFor="message-draft" className="sr-only">
                Type your message
              </label>
              <textarea
                id="message-draft"
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter makes a new line.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (draft.trim() !== '') send.mutate()
                  }
                }}
                placeholder="Type your message here…"
                className="min-w-0 flex-1 resize-none rounded-btn border border-border bg-card p-3 text-foreground placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={send.isPending || draft.trim() === ''}
                className="rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50"
              >
                {send.isPending ? 'Sending…' : 'Send'}
              </button>
            </form>

            {send.isError && (
              <p role="alert" className="px-4 pb-3 text-sm text-danger-foreground">
                {send.error.message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
