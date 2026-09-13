import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * Every column this product captures must reach a person — docs/20.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS TEST EXISTS
 * ---------------------------------------------------------------------------
 * Across db/122–127 the same mistake was made seven times: a column was added,
 * wired into the AI prompt, and shown on no screen. Each time it was fixed and
 * then repeated on the next field.
 *
 *   - `strategy_feedback` collected since db/006, read by nothing
 *   - the ABC columns, on no screen at all (db/123 fixed it)
 *   - `still_escalated`, captured and excluded from every ranking
 *   - `did_not_fit`, a measurement nothing surfaced
 *   - the 'other' notes — a teacher dictated a sentence and read back
 *     "After something else"
 *   - the profile, which guardians were given permission to read and no way to
 *   - `fetchSharedLogs`, nine columns and none of the context
 *
 * The cause is a reflex: "the model can use it" feels like done, because the
 * model is the feature. A principle written in a doc failed to stop it twice.
 * This is the version that fails a build.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CAN AND CANNOT PROVE
 * ---------------------------------------------------------------------------
 * It greps. It cannot prove a column is rendered WELL, in the right place, to
 * the right role — docs/20 §2 is the table that tracks that, and a person keeps
 * it. What it can prove is that somebody wrote the column's name into a screen
 * at all, which is the step that kept being skipped.
 *
 * `src/lib/api.ts` IS DELIBERATELY EXCLUDED from the search. A column named
 * only there is the exact failure this catches: selected from the database,
 * carried to the browser, and rendered by nobody.
 */

const CAPTURE_TABLES = ['behaviour_logs', 'student_profiles', 'school_day_context']

/**
 * Columns with no screen, each with the reason. Adding to this list is a
 * decision somebody makes in a diff review, which is the point of it being a
 * list rather than a heuristic.
 */
const NO_SCREEN: Record<string, string> = {
  id: 'a key',
  student_id: 'a key',
  profile_id: 'a key',
  school_id: 'a key',
  goal_id: 'a key',
  created_at: 'plumbing',
  updated_at: 'plumbing',
  updated_by: 'plumbing',
  created_by: 'plumbing',
  logged_by: 'rendered as a person, not a column name',
  client_ref: 'an offline dedupe key; a person never sees it',
  started_at: 'the timer renders a duration, not the raw timestamps',
  ended_at: 'as above',
  duration_seconds: 'rendered by formatDuration from the timeline row',
  occurred_at: 'rendered as a date heading',
  context_date: 'the day control is always about today',
  notes_source: 'db/005 records typed-vs-voice for review; no screen yet, and it is not a fact about a child',
  safeguarding_acknowledged_at: 'drives the queue filter; the state is shown, not the timestamp',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.tsx?$/.test(entry)) out.push(path)
  }
  return out
}

/** Column names, read from the migration files rather than a hand-kept list. */
function columnsOf(table: string): string[] {
  const dir = new URL('../../db/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n')

  const names = new Set<string>()

  // `create table ... ( name type, ... )`
  const created = new RegExp(
    `create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
    'g',
  )
  for (const match of sql.matchAll(created)) {
    for (const line of match[1].split('\n')) {
      const m = /^\s{2}([a-z_]+)\s+[a-z]/.exec(line)
      if (m) names.add(m[1])
    }
  }

  // `alter table ... add column if not exists name type`
  const added = new RegExp(
    `alter table public\\.${table}[\\s\\S]{0,400}?add column if not exists\\s+([a-z_]+)`,
    'g',
  )
  for (const match of sql.matchAll(added)) names.add(match[1])

  // and the multi-column form, which the single pattern above stops at
  const block = new RegExp(
    `alter table public\\.${table}\\s*\\n((?:\\s*add column if not exists[^;]*\\n?)+);`,
    'g',
  )
  for (const match of sql.matchAll(block)) {
    for (const m of match[1].matchAll(/add column if not exists\s+([a-z_]+)/g)) {
      names.add(m[1])
    }
  }

  return [...names]
}

/*
 * ALIASES ARE RESOLVED, NOT ALLOWLISTED.
 *
 * PostgREST needs `alias:table!constraint ( col )` to disambiguate two foreign
 * keys to the same table, so `safeguarding_acknowledged_by` legitimately
 * reaches a screen under the name `acknowledged_by`. A plain grep called that a
 * write-only column and the honest fix is for this test to understand the
 * idiom — putting it on the allowlist would have hidden a real check behind a
 * false excuse, which is the failure mode of every allowlist.
 */
const API = readFileSync(
  new URL('../../src/lib/api.ts', import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    '$1',
  ),
  'utf8',
)

function aliasesFor(column: string): string[] {
  const found: string[] = []
  // `acknowledged_by:profiles!behaviour_logs_safeguarding_acknowledged_by_fkey`
  for (const m of API.matchAll(/([a-z_]+):[a-z_]+!([a-z_]+)/g)) {
    if (m[2].includes(column)) found.push(m[1])
  }
  // `alias:column` — the plain rename form
  for (const m of API.matchAll(/([a-z_]+):([a-z_]+)[\s,)]/g)) {
    if (m[2] === column) found.push(m[1])
  }
  return found
}

const SCREENS = walk(
  new URL('../../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
)
  .filter((f) => !f.endsWith(join('lib', 'api.ts')))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')

describe('no column is captured from a person and shown to nobody', () => {
  for (const table of CAPTURE_TABLES) {
    test(`${table}`, () => {
      const unread = columnsOf(table).filter(
        (column) =>
          !NO_SCREEN[column] &&
          !SCREENS.includes(column) &&
          !aliasesFor(column).some((alias) => SCREENS.includes(alias)),
      )

      expect(
        unread,
        unread.length === 0
          ? ''
          : `These columns of ${table} are written and read by no screen:\n` +
            `  ${unread.join(', ')}\n\n` +
            'Either render them somewhere under src/ (outside lib/api.ts), or ' +
            'add them to NO_SCREEN in this file with the reason. Both are fine; ' +
            'silently collecting something from a busy person and showing it to ' +
            'nobody is not.',
      ).toEqual([])
    })
  }

  test('it can actually see the columns, so a passing run means something', () => {
    // A regex that silently matched nothing would make every table above pass.
    expect(columnsOf('behaviour_logs')).toContain('antecedent')
    expect(columnsOf('student_profiles')).toContain('interests')
    expect(columnsOf('school_day_context')).toContain('setting_events')
  })

  test('an alias counts as being rendered, and only a real one', () => {
    // The case that made this necessary.
    expect(aliasesFor('safeguarding_acknowledged_by')).toContain('acknowledged_by')
    // And it must not match everything, or the guard is decorative.
    expect(aliasesFor('antecedent')).toEqual([])
  })
})
