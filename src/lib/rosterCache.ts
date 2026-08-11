import type { StudentRow } from './api'

/**
 * The teacher's own roster, kept on the device so it survives losing signal.
 *
 * THIS REVERSES PART OF AN EARLIER DECISION, AND IT SHOULD.
 *
 * vite.config.ts says no student data is ever cached, on the grounds that
 * classroom laptops are shared. That reasoning still holds for records —
 * behaviour history, notes, goals, messages, home observations. None of those
 * are cached and none should be.
 *
 * But it made the central promise impossible. Logging an incident starts by
 * opening a student, opening a student needs the roster, and the roster came
 * from the network — so offline a teacher could not reach the screen the
 * offline queue was built to serve. "You can still record what you are seeing
 * now" was not true. A feature you cannot navigate to is not a feature.
 *
 * So exactly one thing is cached: the list of children this teacher is already
 * assigned to, and only the fields needed to identify one — name, year, id.
 * Nothing about what any of them did.
 *
 * It is keyed by user id and cleared on sign-out, so the next person to use
 * the laptop cannot see the previous teacher's class.
 */

const KEY = 'mizanova.roster.v1'

type CachedRoster = {
  userId: string
  cachedAt: string
  students: StudentRow[]
}

export function cacheRoster(userId: string, students: StudentRow[]): void {
  try {
    const payload: CachedRoster = {
      userId,
      cachedAt: new Date().toISOString(),
      students,
    }
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    // Storage full or blocked. Online everything still works; offline the
    // roster is simply unavailable, which is where we started.
  }
}

/** Returns null unless a roster was stored for THIS user. */
export function readCachedRoster(userId: string): StudentRow[] | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedRoster
    if (parsed.userId !== userId) return null
    return parsed.students ?? null
  } catch {
    return null
  }
}

export function clearRosterCache(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing useful to do */
  }
}
