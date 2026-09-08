import { createContext, useContext, type ReactNode } from 'react'
import { speechToTextSupported, useSpeechToText } from '../hooks/useSpeechToText'
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
 *
 * A form with three dictatable fields printed it three times, which is how a
 * disclosure stops being read. `DictationNotice` below moves it to one place
 * per form. It can be moved; it cannot be removed.
 *
 * ---------------------------------------------------------------------------
 * IT ALSO DRAWS A SINGLE-LINE INPUT, DESPITE THE NAME
 * ---------------------------------------------------------------------------
 * The evidence database needs dictation on two `<input>` fields and one
 * textarea, and everything around the control — the label, the toggle, the
 * live region, the error, the disclosure — is identical either way. The name
 * is kept because five screens already import it and renaming a shared
 * component while three people have work open buys a conflict for nothing.
 */

/** Set by DictationNotice, so a field inside one does not repeat it. */
const NoticeHandled = createContext(false)

const control =
  'mt-1.5 w-full rounded-btn border border-border bg-card p-2.5 text-sm text-foreground placeholder:text-muted-foreground'

/**
 * Wraps a group of dictatable fields and carries their shared disclosure,
 * printed once after the group. Fields outside one still carry their own.
 */
export function DictationNotice({ children }: { children: ReactNode }) {
  return (
    <NoticeHandled.Provider value={true}>
      {children}
      <DictationDisclosure />
    </NoticeHandled.Provider>
  )
}

function DictationDisclosure() {
  return speechToTextSupported() ? (
    <p className="text-xs text-muted-foreground">
      Dictation is your browser&rsquo;s, not MiZanova&rsquo;s — in Chrome the
      audio is sent to Google to be transcribed. Type instead if that is not
      appropriate for what you are about to say.
    </p>
  ) : (
    <p className="text-xs text-muted-foreground">
      Dictation is not available in this browser. Typing works everywhere.
    </p>
  )
}

export default function DictatedTextarea({
  id,
  label,
  labelSuffix,
  hint,
  rows = 3,
  multiline = true,
  required,
  placeholder,
  value,
  onChange,
}: {
  id: string
  label: string
  /** Qualifying words that belong with the label, in lighter type. */
  labelSuffix?: ReactNode
  hint?: ReactNode
  rows?: number
  /** False draws an `<input>`. Everything around it is unchanged. */
  multiline?: boolean
  required?: boolean
  placeholder?: string
  value: string
  onChange: (value: string) => void
}) {
  const noticeHandled = useContext(NoticeHandled)
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

      {multiline ? (
        <textarea
          id={id}
          rows={rows}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={control}
        />
      ) : (
        <input
          id={id}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={control}
        />
      )}

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

      {!noticeHandled && (
        <div className="mt-1">
          <DictationDisclosure />
        </div>
      )}
    </div>
  )
}
