/**
 * Week arithmetic in LOCAL time, which is the only kind a calendar can use.
 *
 * `starts_at` is a timestamptz and arrives as UTC. Deriving "which day is this
 * on" from the ISO string — `starts_at.slice(0, 10)` — puts an early-morning
 * Sydney appointment on the previous day, every time, for half the year. These
 * go through Date so the browser's own offset does the work.
 */

/** Monday, midnight. Australian school weeks start there, not on Sunday. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * 'YYYY-MM-DDTHH:mm' for <input type="datetime-local">, which refuses an ISO
 * string with a timezone on it and silently shows an empty field instead.
 */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The 'YYYY-MM-DD' a session_date column wants, in local time. */
export function toLocalDateValue(date: Date): string {
  return toLocalInputValue(date).slice(0, 10)
}
