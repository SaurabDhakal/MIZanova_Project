/**
 * Local-time values for <input type="datetime-local"> and date columns.
 *
 * `starts_at` is a timestamptz and arrives as UTC. Deriving a wall-clock value
 * from the ISO string — `starts_at.slice(0, 10)` — puts an early-morning Sydney
 * appointment on the previous day, every time, for half the year. These go
 * through Date so the browser's own offset does the work.
 */

/**
 * 'YYYY-MM-DDTHH:mm'. The input refuses an ISO string carrying a timezone and
 * silently shows an empty field instead of complaining.
 */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The 'YYYY-MM-DD' a session_date column wants, in local time. */
export function toLocalDateValue(date: Date): string {
  return toLocalInputValue(date).slice(0, 10)
}

/**
 * Today, where the person is standing.
 *
 * `new Date().toISOString().slice(0, 10)` is the same mistake this file was
 * written to stop, and it had spread to every screen that pre-fills a date or
 * caps one with `max`. Australia is UTC+10 or +11, so from midnight until
 * mid-morning that expression returns YESTERDAY: a parent writing up last
 * night's meltdown before school dated it a day early, and the `max` on the
 * field refused to let them correct it to today.
 */
export function todayLocal(): string {
  return toLocalDateValue(new Date())
}
