import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchCareTeam,
  fetchMessages,
  fetchThreads,
  markThreadRead,
  messageAttachmentMimeType,
  messageAttachmentUrl,
  queryKeys,
  sendMessage,
  startThread,
  unreadMessagesInThread,
  unsendMessage,
  type MessageAttachmentRow,
  type PendingMessageAttachment,
  type ThreadRow,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { ROLE_CONFIG } from '../lib/roles'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { EmptyState, ErrorState, LoadingCards } from './QueryState'
import Icon from './Icon'

/**
 * Secure messaging between a family and a child's care team.
 * docs/Figma Pages Design/Parent Messages.png.
 *
 * Two panes on a laptop; on a phone the list and the conversation are separate
 * screens, because a 375px-wide split view is unusable and parents are the
 * mobile-first audience (NFR3).
 *
 * Attachments live in a private bucket and every download is a short-lived
 * signed URL. Dictation uses the browser speech API; voice notes use
 * MediaRecorder and are uploaded as ordinary audio attachments.
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

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function MessageAttachment({
  attachment,
  mine,
}: {
  attachment: MessageAttachmentRow
  mine: boolean
}) {
  const url = useQuery({
    queryKey: queryKeys.messageAttachment(attachment.storage_path),
    queryFn: () => messageAttachmentUrl(attachment.storage_path),
    staleTime: 8 * 60 * 1000,
  })

  if (url.isPending) {
    return <p className="mt-2 text-xs opacity-70">Loading attachment…</p>
  }
  if (url.isError) {
    return <p className="mt-2 text-xs opacity-70">Attachment unavailable</p>
  }

  if (attachment.kind === 'image') {
    return (
      <a href={url.data} target="_blank" rel="noreferrer" className="mt-2 block">
        <img
          src={url.data}
          alt={attachment.file_name}
          className="max-h-72 max-w-full rounded-btn object-contain"
        />
      </a>
    )
  }

  if (attachment.kind === 'audio') {
    return (
      <div className="mt-2 min-w-56">
        <audio controls preload="metadata" src={url.data} className="w-full" />
        <p className={`mt-1 text-xs ${mine ? 'text-white/70' : 'text-muted-foreground'}`}>
          {attachment.file_name} · {fileSize(attachment.size_bytes)}
        </p>
      </div>
    )
  }

  return (
    <a
      href={url.data}
      target="_blank"
      rel="noreferrer"
      className={`mt-2 flex items-center gap-2 rounded-btn border px-3 py-2 text-sm font-medium ${
        mine ? 'border-white/30' : 'border-border'
      }`}
    >
      <Icon name="resources" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">{attachment.file_name}</span>
      <span className="ml-auto shrink-0 text-xs opacity-70">
        {fileSize(attachment.size_bytes)}
      </span>
    </a>
  )
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
  const [attachments, setAttachments] = useState<PendingMessageAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [dictationLanguage, setDictationLanguage] = useState('en-AU')
  const [conversationSearch, setConversationSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimeoutRef = useRef<number | null>(null)

  const speech = useSpeechToText((text) => {
    setDraft((current) => `${current}${current.trim() ? ' ' : ''}${text}`)
  }, dictationLanguage)

  const canRecord =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'

  useEffect(() => {
    return () => {
      recorderRef.current?.stop()
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
      if (recordingTimeoutRef.current !== null) {
        window.clearTimeout(recordingTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

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

  function addFiles(files: File[]) {
    setAttachmentError(null)
    const remaining = 5 - attachments.length
    if (files.length > remaining) {
      setAttachmentError('A message can have at most five attachments.')
      files = files.slice(0, Math.max(remaining, 0))
    }

    const accepted: PendingMessageAttachment[] = []
    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) {
        setAttachmentError(`${file.name} is larger than 15 MB.`)
        continue
      }
      const mimeType = messageAttachmentMimeType(file)
      if (!mimeType) {
        setAttachmentError(`${file.name} is not an accepted file type.`)
        continue
      }
      const kind = mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('audio/')
          ? 'audio'
          : 'file'
      accepted.push({ file, kind })
    }
    setAttachments((current) => [...current, ...accepted])
  }

  async function startVoiceNote() {
    setAttachmentError(null)
    if (!canRecord || attachments.length >= 5) {
      setAttachmentError(
        attachments.length >= 5
          ? 'Remove an attachment before recording a voice note.'
          : 'Voice recording is not supported in this browser.',
      )
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordingStreamRef.current = stream
      const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
      const selected = candidates.find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = selected
        ? new MediaRecorder(stream, { mimeType: selected })
        : new MediaRecorder(stream)
      const baseType = recorder.mimeType.split(';')[0] || 'audio/webm'
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        if (recordingTimeoutRef.current !== null) {
          window.clearTimeout(recordingTimeoutRef.current)
          recordingTimeoutRef.current = null
        }
        const blob = new Blob(audioChunksRef.current, { type: baseType })
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
        recordingStreamRef.current = null
        recorderRef.current = null
        setRecording(false)
        if (blob.size === 0) {
          setAttachmentError('The voice note was empty. Please try again.')
          return
        }
        const extension = baseType === 'audio/mp4' ? 'm4a' : 'webm'
        const file = new File(
          [blob],
          `voice-note-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`,
          { type: baseType },
        )
        addFiles([file])
      }
      recorder.onerror = () => {
        if (recordingTimeoutRef.current !== null) {
          window.clearTimeout(recordingTimeoutRef.current)
          recordingTimeoutRef.current = null
        }
        stream.getTracks().forEach((track) => track.stop())
        setRecording(false)
        setAttachmentError('Voice recording stopped unexpectedly.')
      }
      recorderRef.current = recorder
      recorder.start()
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, 5 * 60 * 1000)
      setRecording(true)
    } catch {
      setAttachmentError(
        'Microphone access was refused. You can still type or attach a file.',
      )
    }
  }

  function stopVoiceNote() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  const send = useMutation({
    mutationFn: () => sendMessage(activeId!, draft, attachments),
    onSuccess: async () => {
      setDraft('')
      setAttachments([])
      setAttachmentError(null)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages(activeId!),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
      ])
    },
  })

  const unsend = useMutation({
    mutationFn: (messageId: string) => unsendMessage(messageId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(activeId!) }),
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
    if (!profile?.id) return 0
    return unreadMessagesInThread(thread, profile.id)
  }

  // The student picker is the primary scope. Educators additionally get inbox
  // controls when looking across their whole class, where finding one family
  // in a long list otherwise becomes slow and error-prone.
  const studentThreads = (threads.data ?? []).filter(
    (t) => studentId === null || t.student_id === studentId,
  )
  const educatorInbox = profile?.role === 'educator' && studentId === null
  const normalisedSearch = conversationSearch.trim().toLocaleLowerCase('en-AU')
  const visibleThreads = studentThreads.filter((thread) => {
    if (!educatorInbox) return true
    const person = counterpart(thread)
    const searchable = [
      person?.full_name,
      person ? ROLE_CONFIG[person.role].label : '',
      thread.students?.display_name,
      thread.subject,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('en-AU')
    return (
      (normalisedSearch === '' || searchable.includes(normalisedSearch)) &&
      (!unreadOnly || unreadCount(thread) > 0)
    )
  })
  const unreadThreads = studentThreads.filter((thread) => unreadCount(thread) > 0)

  const markAllRead = useMutation({
    mutationFn: () =>
      Promise.all(unreadThreads.map((thread) => markThreadRead(thread.id))),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
  })

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
  const canSend = draft.trim() !== '' || attachments.length > 0

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
        {educatorInbox && studentThreads.length > 0 && (
          <div className="mb-3 rounded-card border border-border bg-card p-3 shadow-raised">
            <label htmlFor="conversation-search" className="sr-only">
              Search conversations
            </label>
            <input
              id="conversation-search"
              type="search"
              value={conversationSearch}
              onChange={(event) => setConversationSearch(event.target.value)}
              placeholder="Search family or student…"
              className="w-full rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setUnreadOnly((current) => !current)}
                aria-pressed={unreadOnly}
                className={`rounded-btn border px-2.5 py-1.5 text-xs font-semibold ${
                  unreadOnly
                    ? 'border-primary bg-primary-subtle text-primary'
                    : 'border-border text-muted-foreground'
                }`}
              >
                Unread ({unreadThreads.length})
              </button>
              {unreadThreads.length > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="rounded-btn px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary-subtle disabled:opacity-50"
                >
                  {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
                </button>
              )}
              {(normalisedSearch || unreadOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setConversationSearch('')
                    setUnreadOnly(false)
                  }}
                  className="ml-auto rounded-btn px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-background"
                >
                  Clear
                </button>
              )}
            </div>
            {markAllRead.isError && (
              <p role="alert" className="mt-2 text-xs text-danger-foreground">
                Some conversations could not be marked as read. Please try again.
              </p>
            )}
          </div>
        )}

        {educatorInbox &&
          studentThreads.length > 0 &&
          visibleThreads.length === 0 && (
            <div className="rounded-card border border-border bg-card p-5 text-center shadow-raised">
              <p className="font-semibold text-foreground">
                No conversations match
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Clear the search or unread filter to show the rest of your inbox.
              </p>
            </div>
          )}

        {visibleThreads.length === 0 && canStartWith.length === 0 && (
          !(
            educatorInbox &&
            studentThreads.length > 0 &&
            (normalisedSearch || unreadOnly)
          ) && (
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
          )
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
                        {latest?.deleted_at
                          ? 'Message unsent'
                          : latest?.body ||
                            (latest?.message_attachments.length
                              ? 'Sent an attachment'
                              : 'No messages yet')}
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
                const deleted = message.deleted_at !== null
                const canUnsend =
                  mine &&
                  !deleted &&
                  clock - new Date(message.created_at).getTime() <=
                    15 * 60 * 1000
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
                      {deleted ? (
                        <p className="italic opacity-70">Message unsent</p>
                      ) : (
                        <>
                          {message.body && (
                            <p className="whitespace-pre-wrap">{message.body}</p>
                          )}
                          {(message.message_attachments ?? []).map(
                            (attachment) => (
                              <MessageAttachment
                                key={attachment.id}
                                attachment={attachment}
                                mine={mine}
                              />
                            ),
                          )}
                        </>
                      )}
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
                      {canUnsend && (
                        <button
                          type="button"
                          onClick={() => unsend.mutate(message.id)}
                          disabled={unsend.isPending}
                          className={`mt-1 text-xs underline underline-offset-2 ${
                            mine ? 'text-white/80' : 'text-muted-foreground'
                          }`}
                        >
                          Unsend
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (canSend) send.mutate()
              }}
              className="border-t border-border p-3"
            >
              {attachments.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-2">
                  {attachments.map((attachment, index) => (
                    <li
                      key={`${attachment.file.name}-${attachment.file.lastModified}-${index}`}
                      className="flex max-w-full items-center gap-2 rounded-btn bg-background px-3 py-2 text-sm"
                    >
                      <Icon
                        name={attachment.kind === 'audio' ? 'mic' : 'resources'}
                        className="h-4 w-4 shrink-0"
                      />
                      <span className="max-w-48 truncate">{attachment.file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {fileSize(attachment.file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        aria-label={`Remove ${attachment.file.name}`}
                        className="rounded-full p-1 hover:bg-card"
                      >
                        <Icon name="cross" className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-end gap-2">
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
                      if (canSend) send.mutate()
                    }
                  }}
                  placeholder="Type or dictate your message…"
                  className="min-w-0 flex-1 resize-none rounded-btn border border-border bg-card p-3 text-foreground placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={send.isPending || !canSend}
                  className="rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {send.isPending ? 'Sending…' : 'Send'}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,audio/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []))
                    event.target.value = ''
                  }}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= 5}
                  className="inline-flex items-center gap-1.5 rounded-btn border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  <Icon name="resources" className="h-4 w-4" />
                  Photo or file
                </button>

                {speech.supported && (
                  <>
                    <button
                      type="button"
                      onClick={speech.listening ? speech.stop : speech.start}
                      className={`inline-flex items-center gap-1.5 rounded-btn border px-3 py-2 text-sm font-medium ${
                        speech.listening
                          ? 'border-danger bg-danger-subtle text-danger-foreground'
                          : 'border-border'
                      }`}
                    >
                      <Icon name="mic" className="h-4 w-4" />
                      {speech.listening ? 'Stop dictation' : 'Dictate text'}
                    </button>
                    <label className="sr-only" htmlFor="dictation-language">
                      Dictation language
                    </label>
                    <select
                      id="dictation-language"
                      value={dictationLanguage}
                      onChange={(event) => setDictationLanguage(event.target.value)}
                      disabled={speech.listening}
                      className="rounded-btn border border-border bg-card px-2.5 py-2 text-sm"
                    >
                      <option value="en-AU">English (Australia)</option>
                      <option value="ar-SA">Arabic</option>
                      <option value="zh-CN">Chinese (Mandarin)</option>
                      <option value="hi-IN">Hindi</option>
                      <option value="vi-VN">Vietnamese</option>
                    </select>
                  </>
                )}

                {canRecord && (
                  <button
                    type="button"
                    onClick={recording ? stopVoiceNote : () => void startVoiceNote()}
                    className={`inline-flex items-center gap-1.5 rounded-btn border px-3 py-2 text-sm font-medium ${
                      recording
                        ? 'border-danger bg-danger-subtle text-danger-foreground'
                        : 'border-border'
                    }`}
                  >
                    <Icon name="mic" className="h-4 w-4" />
                    {recording ? 'Stop voice note' : 'Record voice note'}
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  Up to 5 files, 15 MB each · voice notes stop after 5 minutes
                </span>
              </div>
              {speech.supported && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Dictation may use your browser provider&rsquo;s speech service.
                  Voice notes are stored privately with this conversation.
                </p>
              )}
            </form>

            {(send.isError || unsend.isError || attachmentError || speech.error) && (
              <p role="alert" className="px-4 pb-3 text-sm text-danger-foreground">
                {send.isError
                  ? send.error.message
                  : unsend.isError
                    ? unsend.error.message
                    : attachmentError ?? speech.error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
