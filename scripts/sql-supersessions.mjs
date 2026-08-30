/**
 * Which db/ file holds the LIVE definition of each SQL function.
 *
 *   npm run sql-supersessions
 *
 * ---------------------------------------------------------------------------
 * THE MISTAKE THIS EXISTS TO STOP
 * ---------------------------------------------------------------------------
 * Migrations are applied in order and `create or replace function` replaces the
 * whole body. So when a function is defined in more than one file, only the
 * LAST one is real — every earlier file is a historical record of what it used
 * to do, sitting in the repository looking exactly like source code.
 *
 * Reproducing a function from an earlier file therefore deletes every fix made
 * after it, silently, with the suite still green. This project has done it
 * three times:
 *
 *   - `redeem_invitation` rebuilt from db/035, dropping db/046's membership
 *     insert and db/036's assignment-ending. Caught by onboarding.test.ts.
 *   - `my_role`, left returning null for students until db/077.
 *   - `audit_behaviour_log_edited`, where db/065 writes the full previous note
 *     into the audit trail and db/069 replaced it with a hash. Opening db/065
 *     to read "the" definition is the natural move and gives the wrong answer;
 *     that near-miss is what prompted this script.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------
 * It reads the files, not the database. It cannot tell you that somebody
 * re-ran an old migration by hand — only which file you should be reading if
 * you want to change a function. That is the question that keeps being got
 * wrong, and it can be answered without credentials, which is why this runs
 * anywhere and needs no keys.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DB_DIR = 'db'

/* `create or replace function public.name(` — and the bare `create function`
   form, which db/003 uses for the first definition of several helpers. */
const DEFINITION = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/gi

const files = readdirSync(DB_DIR)
  .filter((f) => f.endsWith('.sql'))
  // Numeric order, not lexicographic: db/100 must sort after db/099, and
  // seed_demo_school.sql has no number at all and is not a migration.
  .filter((f) => /^\d+_/.test(f))
  .sort((a, b) => Number(a.split('_')[0]) - Number(b.split('_')[0]))

/** @type {Map<string, string[]>} function name -> files that define it, in order */
const defined = new Map()

for (const file of files) {
  const sql = readFileSync(join(DB_DIR, file), 'utf8')
  const seenHere = new Set()
  for (const m of sql.matchAll(DEFINITION)) {
    const name = m[1]
    // A file that defines the same function twice still counts once; what
    // matters is which FILE is authoritative.
    if (seenHere.has(name)) continue
    seenHere.add(name)
    if (!defined.has(name)) defined.set(name, [])
    defined.get(name).push(file)
  }
}

const multiple = [...defined.entries()]
  .filter(([, where]) => where.length > 1)
  .sort((a, b) => a[0].localeCompare(b[0]))

console.log(
  `${defined.size} functions defined across ${files.length} migrations; ` +
    `${multiple.length} of them more than once.\n`,
)

if (multiple.length === 0) {
  console.log('Nothing is superseded. Any file is safe to read.')
  process.exit(0)
}

console.log('For each of these, read the LAST file. The others are history.\n')

for (const [name, where] of multiple) {
  const live = where[where.length - 1]
  const older = where.slice(0, -1)
  console.log(`  ${name}`)
  console.log(`      live:      ${live}`)
  console.log(`      superseded: ${older.join(', ')}`)
}

/* Deliberately exits 0. Being defined twice is normal and correct — it is how
   a migration changes behaviour. This reports, it does not judge. */
