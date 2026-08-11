import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  queryKeys,
  type BehaviourIntensity,
  type BehaviourType,
  type StudentRow,
} from '../lib/api'
import { saveBehaviourLog } from '../lib/offlineQueue'
import { showToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import Icon from './Icon'
import { type IconName } from '../lib/icons'
import { formatDuration, useTimer } from '../hooks/useTimer'
import { useSpeechToText } from '../hooks/useSpeechToText'

/**
 * Quick Log — docs/Figma Pages Design/Behaviour Logging Model.png.
 *
 * The design goal is a teacher logging an incident in under 20 seconds without
 * taking their eyes off the class. Everything here serves that: four large
 * targets, three intensity buttons, and Save enabled the moment both are
 * chosen. Notes are optional — requiring them would guarantee they get skipped
 * or filled with rubbish under pressure.
 *
 * Built on the native <dialog> element, which gives us focus trapping, Escape
 * to close, and inert background content for free — all things that are easy
 * to get subtly wrong by hand and that matter for keyboard and screen reader
 * users.
 */

const BEHAVIOURS: {
  value: BehaviourType
  label: string
  detail: string
  icon: IconName
  tint: string
  /** Foreground for the glyph — the tint alone is a background. */
  ink: string
}[] = [
  {
    value: 'disruptive',
    label: 'Disruptive',
    detail: 'Out of seat, shouting',
    icon: 'bolt',
    tint: 'bg-warning-subtle',
    ink: 'text-warning-foreground',
  },
  {
    value: 'withdrawn',
    label: 'Withdrawn',
    detail: 'Non-responsive, quiet',
    icon: 'moon',
    tint: 'bg-primary-subtle',
    ink: 'text-primary',
  },
  {
    value: 'emotional',
    label: 'Emotional',
    detail: 'Crying, anxiety, frustration',
    icon: 'droplet',
    tint: 'bg-accent-subtle',
    ink: 'text-accent-foreground',
  },
  {
    value: 'physical',
    label: 'Physical',
    detail: 'Pushing, throwing objects',
    icon: 'hand',
    tint: 'bg-danger-subtle',
    ink: 'text-danger-foreground',
  },
]

const INTENSITIES: { value: BehaviourIntensity; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export default function BehaviourLogModal({
  student,
  onClose,
}: {
  student: StudentRow
  onClose: () => void
}) {
  // The SESSION, not the profile. `profile` is fetched over the network, and
  // this modal must work when there is none — its only need is the user id,
  // which Supabase keeps in localStorage. Depending on `profile` meant that a
  // page loaded offline reported "choose a behaviour and an intensity first"
  // to a teacher who had chosen both.
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const dialogRef = useRef<HTMLDialogElement>(null)

  const timer = useTimer()
  const [behaviour, setBehaviour] = useState<BehaviourType | null>(null)
  const [intensity, setIntensity] = useState<BehaviourIntensity | null>(null)
  const [notes, setNotes] = useState('')
  const [usedVoice, setUsedVoice] = useState(false)
  const [riskFlagged, setRiskFlagged] = useState(false)
  const [riskNote, setRiskNote] = useState('')

  // Generated once, before any request. A retry after a dropped connection
  // reuses it, so the same observation cannot be saved twice.
  const [clientRef] = useState(() => crypto.randomUUID())

  const speech = useSpeechToText((text) => {
    setUsedVoice(true)
    setNotes((current) => (current ? `${current} ${text}` : text))
  })

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const save = useMutation({
    // WITHOUT THIS, OFFLINE LOGGING CANNOT WORK.
    //
    // React Query defaults to networkMode: 'online', which PAUSES a mutation
    // when the browser reports no connection — mutationFn is never called, the
    // mutation sits in a pending state, and the button reads "Saving…"
    // forever. All the offline handling below it is unreachable: the library
    // stops the request upstream of our code, so there is no error to catch
    // and nothing is ever queued.
    //
    // That default is right for a mutation that needs the server. This one is
    // built for the opposite case — it writes to localStorage when there is no
    // network — so it has to be allowed to run and decide for itself.
    networkMode: 'always',
    mutationFn: async () => {
      // Three separate conditions, three separate messages. Collapsing them
      // into one sentence is how a missing session came out as "choose a
      // behaviour", which sent teachers looking in the wrong place.
      if (!behaviour || !intensity) {
        throw new Error('Choose a behaviour and an intensity first.')
      }
      const loggedBy = session?.user.id
      if (!loggedBy) {
        throw new Error(
          'You are signed out, so this cannot be saved. Sign in again — copy your notes first.',
        )
      }
      // Returns 'saved' or 'queued'. A dropped connection keeps the log on the
      // device instead of throwing it away — see src/lib/offlineQueue.ts.
      return saveBehaviourLog({
        studentId: student.id,
        studentName: student.display_name,
        loggedBy,
        behaviourType: behaviour,
        intensity,
        notes,
        notesSource: usedVoice ? 'voice' : 'typed',
        /*
         * UNTIMED LOGS RECORD NO DURATION. started_at is not null in db/005, so
         * it still gets a timestamp — the moment the log was written. ended_at
         * stays null, which makes the generated duration_seconds null: the
         * honest answer to "how long did it last?" when nobody timed it.
         */
        startedAt: (timer.startedAt ?? new Date()).toISOString(),
        endedAt: timer.endedAt()?.toISOString() ?? null,
        clientRef,
        riskFlagged,
        riskNote,
        queuedAt: new Date().toISOString(),
      })
    },
    // NOT async, and nothing here is awaited.
    //
    // React Query waits for onSuccess to settle before the mutation leaves its
    // pending state. `invalidateQueries` resolves only once the refetches it
    // triggers have finished — and offline they never do. Awaiting it left the
    // button on "Saving…" forever after a log had already been queued
    // successfully: the save worked and the screen said it was still trying.
    onSuccess: (outcome) => {
      // A queued log changed nothing on the server, so there is nothing to
      // refetch. It does NOT close the modal either: the teacher is shown that
      // it is on this device and not in the school's records, because those
      // are different promises and only one survives a lost iPad.
      if (outcome === 'queued') return

      // Tell the cache these two are stale so the dashboard tiles and the
      // per-student counts update without a page refresh.
      void queryClient.invalidateQueries({ queryKey: queryKeys.classroomStats })
      void queryClient.invalidateQueries({ queryKey: queryKeys.recentLogs })

      // The modal closes on success, so without this the whole interaction
      // ends in silence and the teacher has to go looking for the log to
      // believe it worked.
      showToast(`Log saved for ${student.display_name}.`)
      close()
    },
  })

  function close() {
    speech.stop()
    dialogRef.current?.close()
    onClose()
  }

  const canSave = behaviour !== null && intensity !== null && !save.isPending
  // Derived from the mutation rather than copied into state — the same rule
  // that caused react-hooks/set-state-in-effect twice before.
  const queued = save.data === 'queued'

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        // Escape key. Treated as Discard.
        e.preventDefault()
        close()
      }}
      aria-labelledby="quick-log-title"
      // m-auto is doing real work: a browser centres a modal <dialog> using
      // `margin: auto`, and Tailwind's reset sets margin to 0 on everything,
      // which pins it to the top-left corner.
      className="m-auto w-full max-w-2xl rounded-card border border-border bg-card p-0 shadow-lifted backdrop:bg-black/50"
    >
      {/* A COLUMN WITH A PINNED FOOT, because the actions were unreachable.
          Measured before this change on a 694px-tall laptop: the form was
          1048px of content in a 590px box — 458px, 44% of it, below the fold —
          and "Save log" was among what you had to scroll to find. On the one
          screen in this product whose promise is twenty seconds (NFR1).

          The body scrolls; the actions do not. max-w-lg to max-w-2xl as well,
          so the four behaviour cards sit two-up without squeezing. */}
      <div className="flex max-h-[88vh] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {/* --- Header --------------------------------------------------- */}
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-btn bg-primary-subtle text-primary"
            aria-hidden="true"
          >
            <Icon name="observations" className="h-5 w-5" />
          </span>
          <div>
            <h2 id="quick-log-title" className="text-lg font-bold text-foreground">
              Quick log: {student.display_name}
            </h2>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Student ID: #{student.external_ref ?? '—'}
            </p>
          </div>
        </div>

        {/* --- Timer ---------------------------------------------------- */}
        <div className="mt-4 flex items-center gap-3 rounded-card bg-background p-4">
          <div className="min-w-0">
            {/* OPTIONAL, AND IT SAYS SO. The timer used to start on its own,
                which made duration_seconds "how long the form was open" — the
                incident's length only when somebody logs as it happens, and the
                write-up time when they do not.

                db/005 says "started_at is when the teacher pressed start", and
                nobody ever pressed start. Now they can, and a log written up at
                lunch simply records no duration rather than a made-up one. */}
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {timer.started ? 'Observing for' : 'Timing (optional)'}
            </p>
            {timer.started ? (
              // aria-live off: announcing every second would be unusable. The
              // value is still readable on demand.
              <p
                className="font-mono text-3xl font-bold text-foreground"
                aria-live="off"
              >
                {formatDuration(timer.elapsed)}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-muted-foreground">
                Start it only if you are watching this happen now. Logging
                afterwards records no duration.
              </p>
            )}
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            {timer.started && (
              <button
                type="button"
                onClick={timer.reset}
                className="rounded-btn border border-border bg-card px-3 py-2 text-sm font-medium"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={
                !timer.started
                  ? timer.start
                  : timer.running
                    ? timer.stop
                    : timer.resume
              }
              className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              {!timer.started ? 'Start' : timer.running ? 'Stop' : 'Resume'}
            </button>
          </div>
        </div>

        {/* --- Behaviour ------------------------------------------------ */}
        {/* Radios rather than buttons: arrow keys move between options, and a
            screen reader announces "2 of 4" instead of four unrelated buttons. */}
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-foreground">
            Select primary behaviour
          </legend>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {BEHAVIOURS.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-card border p-4 ${
                  behaviour === option.value
                    ? 'border-primary bg-primary-subtle'
                    : 'border-border bg-card'
                }`}
              >
                <input
                  type="radio"
                  name="behaviour"
                  value={option.value}
                  checked={behaviour === option.value}
                  onChange={() => setBehaviour(option.value)}
                  className="sr-only"
                />
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${option.tint} ${option.ink}`}
                  aria-hidden="true"
                >
                  <Icon name={option.icon} className="h-5 w-5" />
                </span>
                <span className="mt-2 block font-bold text-foreground">
                  {option.label}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {option.detail}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* --- Intensity ------------------------------------------------ */}
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-foreground">
            Intensity level
          </legend>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {INTENSITIES.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-btn border py-3 text-center font-medium ${
                  intensity === option.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="intensity"
                  value={option.value}
                  checked={intensity === option.value}
                  onChange={() => setIntensity(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* --- Notes ---------------------------------------------------- */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="observation-notes"
              className="text-sm font-semibold text-foreground"
            >
              Observation notes
            </label>
            {speech.supported && (
              <button
                type="button"
                onClick={speech.listening ? speech.stop : speech.start}
                aria-pressed={speech.listening}
                className="text-sm font-semibold text-primary hover:underline"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="mic" className="h-4 w-4" />
                  {speech.listening ? 'Stop dictation' : 'Voice-to-text'}
                </span>
              </button>
            )}
          </div>

          <textarea
            id="observation-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Enter detailed observation notes here…"
            className="mt-2 w-full rounded-btn border border-border bg-card p-3 text-foreground placeholder:text-muted-foreground"
          />

          {speech.error && (
            <p role="alert" className="mt-1 text-sm text-danger-foreground">
              {speech.error}
            </p>
          )}
          {!speech.supported && (
            <p className="mt-1 text-xs text-muted-foreground">
              Dictation is not available in this browser. Typing works
              everywhere.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Describe what you saw. Avoid naming other students, and leave
            interpretation to the specialist.
          </p>
        </div>

        {/* --- Safeguarding escalation ----------------------------------- */}
        {/* Deliberately separate from everything else, and deliberately not
            automatic. A teacher who thinks a senior person should see this can
            say so directly, without going through the AI. */}
        <div
          className={`mt-5 rounded-card border p-4 ${
            riskFlagged
              ? 'border-danger bg-danger-subtle'
              : 'border-border bg-background'
          }`}
        >
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={riskFlagged}
              onChange={(e) => setRiskFlagged(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span
                className={`block font-semibold ${
                  riskFlagged ? 'text-danger-foreground' : 'text-foreground'
                }`}
              >
                Flag for safeguarding review
              </span>
              <span
                className={`block text-sm ${
                  riskFlagged
                    ? 'text-danger-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                Sends this straight to a school administrator. Use it whenever
                you think someone senior should see it — you do not need to be
                certain.
              </span>
            </span>
          </label>

          {riskFlagged && (
            <div className="mt-3">
              <label
                htmlFor="risk-note"
                className="block text-sm font-semibold text-danger-foreground"
              >
                What is your concern?{' '}
                <span className="font-normal">(optional)</span>
              </label>
              <textarea
                id="risk-note"
                rows={2}
                value={riskNote}
                onChange={(e) => setRiskNote(e.target.value)}
                placeholder="Third incident this week; another child was hurt."
                className="mt-1.5 w-full rounded-btn border border-danger bg-card p-2.5 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
          )}
        </div>

        {save.isError && (
          <p
            role="alert"
            className="mt-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm font-medium text-danger-foreground"
          >
            {save.error.message}
          </p>
        )}

        {queued && (
          <div
            role="status"
            className="mt-4 rounded-card border border-warning bg-warning-subtle p-4"
          >
            <p className="font-semibold text-warning-foreground">
              Saved on this device — not yet sent
            </p>
            <p className="mt-1 text-sm text-warning-foreground">
              There is no connection right now. This observation is stored in
              this browser and will upload by itself as soon as you are back
              online. Nothing is lost, but it is not in the school&rsquo;s
              records yet, and it will not survive clearing your browser data.
            </p>
          </div>
        )}

        {/* Only once there is a timing session to report the start of. It used
            to print unconditionally, which meant an untimed log carried a
            confident "started at 13:42" describing nothing. */}
        {timer.startedAt && (
          <p className="mt-4 text-xs tracking-wide text-muted-foreground uppercase">
            Timing started at{' '}
            {timer.startedAt.toLocaleTimeString('en-AU', { hour12: false })}
          </p>
        )}
        </div>

        {/* --- Actions, pinned ------------------------------------------- */}
        <div className="shrink-0 border-t border-border bg-card p-4">
        <div className="flex gap-3">
          {queued ? (
            <button
              type="button"
              onClick={close}
              className="flex-1 rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-btn border border-border bg-card px-4 py-3 font-semibold text-foreground"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => save.mutate()}
                disabled={!canSave}
                className="flex-[2] rounded-btn bg-success-strong px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {save.isPending ? 'Saving…' : 'Save log'}
              </button>
            </>
          )}
        </div>
        </div>
      </div>
    </dialog>
  )
}
