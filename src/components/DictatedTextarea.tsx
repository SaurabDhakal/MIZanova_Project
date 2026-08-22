import type { ReactNode } from 'react'
import { useSpeechToText } from '../hooks/useSpeechToText'
import Icon from './Icon'

/**
 * A textarea you can talk into — FR3's voice-to-text, as a field rather than a
 * screen.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A COMPONENT AND NOT FORTY LINES COPIED TWICE
 * ---------------------------------------------------------------------------
 * BehaviourLogModal built the pattern inline: a label, a control that toggles
 * between "Voice-to-text" and "Stop dictation", the textarea, the error, and a
 * line for browsers that cannot do it at all. Recording a session needs the
 * same thing in four places — clinical notes and the shared summary, on the
 * appointment panel and on the student's page — and four hand-written copies
 * is how one of them ends up without the unsupported-browser line, on the one
 * screen somebody opens in Firefox.
 *
 * ---------------------------------------------------------------------------
 * DICTATION APPENDS, IT DOES NOT REPLACE
 * ---------------------------------------------------------------------------
 * Transcribed text is added to whatever is already in the box, and the box
 * stays fully editable while listening. Speech recognition mishears clinical
 * vocabulary constantly — the correction has to be possible without throwing
 * the sentence away and starting again.
 *
 * ---------------------------------------------------------------------------
 * THE DISCLOSURE IS NOT OPTIONAL, WHICH IS WHY IT IS NOT A PROP
 * ---------------------------------------------------------------------------
 * This is the browser's speech engine, not ours, and in Chrome that means the
 * audio is sent to Google to be transcribed. For a behaviour observation that
 * is worth knowing. For a clinical note about a named child it is a disclosure
 * the Australian Privacy Principles require us to make plainly — so it is
 * baked in, appears wherever the control does, and no caller can leave it off.
 */
export default function DictatedTextarea({
  id,
  label,
  labelSuffix,
  hint,
  rows = 3,
  value,
  onChange,
}: {
  id: string
  label: string
  /** Qualifying words that belong with the label, in lighter type. */
  labelSuffix?: ReactNode
  hint?: ReactNode
  rows?: number
  value: string
  onChange: (value: string) => void
}) {
  const speech = useSpeechToText((text) => {
    onChange(value ? `${value} ${text}` : text)
  })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-foreground">
          {label}
          {labelSuffix && (
            <span className="font-normal text-muted-foreground">
              {' '}
              {labelSuffix}
            </span>
          )}
        </label>

        {speech.supported && (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            aria-pressed={speech.listening}
            aria-controls={id}
            className="text-sm font-semibold text-primary hover:underline"
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon name="mic" className="h-4 w-4" />
              {speech.listening ? 'Stop dictation' : 'Voice-to-text'}
            </span>
          </button>
        )}
      </div>

      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}

      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-btn border border-border bg-card p-2.5 text-sm text-foreground placeholder:text-muted-foreground"
      />

      {/* A live region, because the only other signal that dictation is running
          is the word on a button the person has just looked away from. */}
      <p role="status" className="sr-only">
        {speech.listening ? `Dictating into ${label}.` : ''}
      </p>

      {speech.error && (
        <p role="alert" className="mt-1 text-sm font-medium text-danger-foreground">
          {speech.error}
        </p>
      )}

      {speech.supported ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Dictation is your browser&rsquo;s, not MiZanova&rsquo;s — in Chrome the
          audio is sent to Google to be transcribed. Type instead if that is not
          appropriate for what you are about to say.
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          Dictation is not available in this browser. Typing works everywhere.
        </p>
      )}
    </div>
  )
}
