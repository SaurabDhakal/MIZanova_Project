import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Voice-to-text for observation notes (FR3), using the browser's built-in Web
 * Speech API. Free, no account, no audio sent anywhere we control.
 *
 * PRIVACY NOTE WORTH KNOWING: in Chrome this is not on-device — audio goes to
 * Google's speech servers for transcription. That is a disclosure the privacy
 * policy has to make honestly under the Australian Privacy Principles, and it
 * is a reason to keep teachers to observable descriptions rather than clinical
 * or identifying detail. Firefox does not implement it at all, hence
 * `supported`: the textarea must always work on its own.
 */

interface SpeechAlternative {
  transcript: string
}
interface SpeechResult {
  readonly length: number
  readonly isFinal: boolean
  [index: number]: SpeechAlternative
}
interface SpeechResultList {
  readonly length: number
  [index: number]: SpeechResult
}
interface SpeechEvent {
  resultIndex: number
  results: SpeechResultList
}
interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((event: SpeechEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionConstructor = new () => RecognitionLike

function getConstructor(): RecognitionConstructor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function useSpeechToText(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<RecognitionLike | null>(null)

  // Kept in a ref so restarting recognition is not required every time the
  // caller re-renders with a new closure over the notes state. Updated in an
  // effect rather than during render — writing to a ref while rendering is a
  // side effect, and React may render twice without committing.
  const handler = useRef(onText)
  useEffect(() => {
    handler.current = onText
  }, [onText])

  const supported = getConstructor() !== undefined

  const start = useCallback(() => {
    const Constructor = getConstructor()
    if (!Constructor) return

    setError(null)
    const rec = new Constructor()
    // Australian English: gets local place and person names far closer than
    // the en-US default.
    rec.lang = 'en-AU'
    rec.continuous = true
    rec.interimResults = false

    rec.onresult = (event) => {
      let text = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) text += event.results[i][0].transcript
      }
      if (text) handler.current(text)
    }
    rec.onerror = (event) => {
      setError(
        event.error === 'not-allowed'
          ? 'Microphone permission was refused. You can still type your notes.'
          : `Dictation stopped: ${event.error}`,
      )
      setListening(false)
    }
    rec.onend = () => setListening(false)

    recognition.current = rec
    rec.start()
    setListening(true)
  }, [])

  const stop = useCallback(() => {
    recognition.current?.stop()
    setListening(false)
  }, [])

  // Never leave the microphone running because a modal closed.
  useEffect(() => {
    return () => recognition.current?.stop()
  }, [])

  return { supported, listening, error, start, stop }
}
