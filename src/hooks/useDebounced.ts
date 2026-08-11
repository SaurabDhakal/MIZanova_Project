import { useEffect, useState } from 'react'

/**
 * The value, once it has stopped changing.
 *
 * WHY A SEARCH BOX NEEDS THIS NOW AND DID NOT BEFORE. While filtering happened
 * in the browser, typing cost nothing — the rows were already there. Now each
 * keystroke would be a database query with an exact count over it, so
 * "Parramatta" is eleven queries of which ten are thrown away, and the answers
 * can arrive out of order.
 *
 * 300ms is the usual compromise: below about 200 a fast typist still fires
 * several, and above about 400 the delay is noticeable as lag rather than as
 * waiting.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    // Cleared on every change, so the timer only fires once typing stops.
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return settled
}
