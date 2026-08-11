/**
 * Reading a roster out of a spreadsheet, and deciding what is safe to write.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE TOUCHES THE DATABASE
 * ---------------------------------------------------------------------------
 * Parsing, validation and duplicate detection are pure functions over text, so
 * they can be reasoned about — and tested — without a network. The screen does
 * the writing, and only after a person has seen exactly what will be written.
 *
 * ---------------------------------------------------------------------------
 * WHY A PREVIEW IS NOT OPTIONAL
 * ---------------------------------------------------------------------------
 * This creates records for children. An import that runs on submit and reports
 * afterwards gives somebody no moment to notice that a column shifted, that a
 * date read as American, or that they picked last term's file. Every route into
 * this — typing one, pasting many, choosing a file — ends at the same table of
 * rows with a verdict against each, and nothing is written until that is
 * accepted.
 *
 * ---------------------------------------------------------------------------
 * A ROW IS NEVER SILENTLY DROPPED
 * ---------------------------------------------------------------------------
 * Every line of the source appears in the preview with a line number matching
 * the file, whether it is going to be created, skipped, or refused. A count of
 * "42 imported" against a file of 47 is the kind of report that costs somebody
 * an afternoon working out which five.
 */

/** The columns a school is asked for, in the order the template writes them. */
export const IMPORT_COLUMNS = [
  'first_name',
  'last_name',
  'year_level',
  'external_ref',
  'date_of_birth',
] as const

export type ImportColumn = (typeof IMPORT_COLUMNS)[number]

/** Header spellings a real spreadsheet arrives with. */
const HEADER_ALIASES: Record<string, ImportColumn> = {
  first_name: 'first_name',
  firstname: 'first_name',
  'first name': 'first_name',
  given: 'first_name',
  'given name': 'first_name',
  givenname: 'first_name',
  last_name: 'last_name',
  lastname: 'last_name',
  'last name': 'last_name',
  surname: 'last_name',
  family: 'last_name',
  'family name': 'last_name',
  year_level: 'year_level',
  yearlevel: 'year_level',
  'year level': 'year_level',
  year: 'year_level',
  grade: 'year_level',
  class: 'year_level',
  external_ref: 'external_ref',
  externalref: 'external_ref',
  'external ref': 'external_ref',
  'student id': 'external_ref',
  studentid: 'external_ref',
  id: 'external_ref',
  reference: 'external_ref',
  date_of_birth: 'date_of_birth',
  dateofbirth: 'date_of_birth',
  'date of birth': 'date_of_birth',
  dob: 'date_of_birth',
  birthday: 'date_of_birth',
  born: 'date_of_birth',
}

export type ParsedRow = {
  /** 1-based, matching what the spreadsheet shows, so an error can be found. */
  line: number
  first_name: string
  last_name: string
  year_level: string
  external_ref: string
  date_of_birth: string
}

export type RowVerdict =
  | { status: 'ready' }
  /** Will not be written, and the sentence says why. */
  | { status: 'error'; reason: string }
  /** Already at this school — a re-import of an overlapping file is normal. */
  | { status: 'duplicate'; reason: string }

export type CheckedRow = ParsedRow & { verdict: RowVerdict }

// ---------------------------------------------------------------------------
// Delimited text
// ---------------------------------------------------------------------------
/**
 * A CSV/TSV parser that understands quotes, because school data contains them.
 *
 * `O'Brien` is fine unquoted, but `"L'Estrange, Sofia"` and a note containing a
 * newline are not, and splitting on commas turns both into silent corruption —
 * a surname sliced in half, or one child becoming two. `""` inside a quoted
 * field is an escaped quote, which is what a spreadsheet writes.
 */
export function parseDelimited(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  // Tab beats comma when the text clearly has more of them — pasting from
  // Excel gives tab-separated values, not CSV.
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || undefined)
  const delimiter =
    (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
      ? '\t'
      : ','

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    // A trailing newline should not produce a phantom empty row.
    if (row.some((c) => c.trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === delimiter) pushField()
    else if (c === '\r') continue
    else if (c === '\n') pushRow()
    else field += c
  }
  if (field !== '' || row.length > 0) pushRow()
  return rows
}

/**
 * Turn a grid into rows, using the header if there is one.
 *
 * WHY A HEADER IS DETECTED RATHER THAN DEMANDED. Somebody pasting three names
 * out of an email has no header line, and refusing them would make the paste
 * box useless for the case it exists to serve. If the first row maps to known
 * column names it is a header; otherwise the default order is assumed and said
 * so on screen.
 */
export function toRows(grid: string[][]): {
  rows: ParsedRow[]
  usedHeader: boolean
  unknownHeaders: string[]
} {
  if (grid.length === 0) return { rows: [], usedHeader: false, unknownHeaders: [] }

  const normalise = (s: string) => s.trim().toLowerCase().replace(/[_\s]+/g, ' ')
  const first = grid[0].map(normalise)
  const mapped = first.map((h) => HEADER_ALIASES[h] ?? HEADER_ALIASES[h.replace(/\s/g, '')])
  const looksLikeHeader = mapped.filter(Boolean).length >= 2

  const order: (ImportColumn | null)[] = looksLikeHeader
    ? mapped.map((m) => m ?? null)
    : [...IMPORT_COLUMNS]

  const unknownHeaders = looksLikeHeader
    ? grid[0].filter((_, i) => !mapped[i] && grid[0][i].trim() !== '')
    : []

  const body = looksLikeHeader ? grid.slice(1) : grid
  const offset = looksLikeHeader ? 2 : 1

  const rows = body.map((cells, i) => {
    const get = (col: ImportColumn) => {
      const at = order.indexOf(col)
      return at === -1 ? '' : (cells[at] ?? '').trim()
    }
    return {
      line: i + offset,
      first_name: get('first_name'),
      last_name: get('last_name'),
      year_level: get('year_level'),
      external_ref: get('external_ref'),
      date_of_birth: get('date_of_birth'),
    }
  })

  return { rows, usedHeader: looksLikeHeader, unknownHeaders }
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
/**
 * A date of birth, or a reason it could not be read.
 *
 * AMBIGUOUS DATES ARE REFUSED, NOT GUESSED. This is an Australian product, so
 * 03/04/2015 is 3 April — but a file exported from a US system means 4 March,
 * and nothing in the cell says which. Guessing puts a wrong birthday on a
 * child's record silently. Anything where the first number could be either is
 * refused with a message asking for YYYY-MM-DD, which is never ambiguous.
 *
 * Empty is fine. Date of birth is nullable, and a school that has not been
 * given one should not be blocked from creating the child.
 */
export function readDate(raw: string): { value: string | null; error?: string } {
  const s = raw.trim()
  if (s === '') return { value: null }

  // ISO, and what a spreadsheet gives when the cell is a real date.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (iso) return validCalendarDate(+iso[1], +iso[2], +iso[3], s)

  const slash = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s)
  if (slash) {
    const a = +slash[1]
    const b = +slash[2]
    let year = +slash[3]
    if (year < 100) year += year > 50 ? 1900 : 2000

    if (a > 12 && b <= 12) return validCalendarDate(year, b, a, s) // unambiguous D/M
    if (b > 12 && a <= 12) {
      return {
        value: null,
        error: `"${s}" reads as month/day. Use YYYY-MM-DD so there is no doubt.`,
      }
    }
    if (a <= 12 && b <= 12) {
      return {
        value: null,
        error: `"${s}" could be ${a}/${b} or ${b}/${a}. Use YYYY-MM-DD.`,
      }
    }
  }

  return { value: null, error: `"${s}" is not a date this can read. Use YYYY-MM-DD.` }
}

function validCalendarDate(y: number, m: number, d: number, raw: string) {
  const dt = new Date(Date.UTC(y, m - 1, d))
  const real =
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  if (!real) return { value: null, error: `"${raw}" is not a real date.` }

  const now = new Date()
  if (dt.getTime() > now.getTime())
    return { value: null, error: `"${raw}" is in the future.` }
  if (y < now.getUTCFullYear() - 25)
    return { value: null, error: `"${raw}" would make this child over 25.` }

  return { value: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------
/**
 * What will happen to each row, decided before anything is written.
 *
 * `existingRefs` are the student IDs already at this school. The database has
 * `unique (school_id, external_ref)` so a clash would be refused anyway — but
 * being refused by a constraint mid-import is a worse experience than being
 * told beforehand which four rows are already on the roll.
 */
export function checkRows(
  rows: ParsedRow[],
  existingRefs: Set<string>,
): CheckedRow[] {
  /*
   * WHICH LINE FIRST CLAIMED EACH ID, computed over EVERY row before any of
   * them are judged.
   *
   * An earlier version recorded the id only once a row had passed all its other
   * checks, which meant a clash could hide behind an unrelated fault: a file
   * with Katherine on line 4 and Alan on line 7 both holding 7003 reported Alan
   * as fine, because Katherine had already been rejected for an ambiguous date.
   * Alan would import, and the office would never learn their export has two
   * children sharing an id — until they fixed the date, re-imported, and hit it
   * from the other side. Two rows claiming one id is a fault in the FILE,
   * whatever else is wrong with either row.
   */
  const firstLineForRef = new Map<string, number>()
  for (const row of rows) {
    const ref = row.external_ref.trim()
    if (ref !== '' && !firstLineForRef.has(ref)) firstLineForRef.set(ref, row.line)
  }

  return rows.map((row) => {
    const first = row.first_name.trim()
    const last = row.last_name.trim()

    if (first === '' && last === '')
      return { ...row, verdict: { status: 'error', reason: 'No name in this row.' } }
    if (first === '')
      return { ...row, verdict: { status: 'error', reason: 'First name is missing.' } }
    if (last === '')
      return { ...row, verdict: { status: 'error', reason: 'Last name is missing.' } }
    if (first.length > 80 || last.length > 80)
      return { ...row, verdict: { status: 'error', reason: 'That name is implausibly long.' } }

    const date = readDate(row.date_of_birth)
    if (date.error) return { ...row, verdict: { status: 'error', reason: date.error } }

    const ref = row.external_ref.trim()
    if (ref !== '') {
      if (existingRefs.has(ref))
        return {
          ...row,
          verdict: {
            status: 'duplicate',
            reason: `Student ID ${ref} is already on the roll.`,
          },
        }
      // Two rows in one file claiming the same ID. Reported on the LATER row,
      // naming the earlier line, whether or not that earlier row is itself
      // going to be imported — see the note where firstLineForRef is built.
      const earlier = firstLineForRef.get(ref)
      if (earlier !== undefined && earlier !== row.line)
        return {
          ...row,
          verdict: {
            status: 'error',
            reason: `Student ID ${ref} is also on line ${earlier}.`,
          },
        }
    }

    return { ...row, verdict: { status: 'ready' } }
  })
}

// ---------------------------------------------------------------------------
// Spreadsheets
// ---------------------------------------------------------------------------
/**
 * Read the first sheet of an .xlsx into the same grid a CSV produces.
 *
 * LOADED ONLY WHEN SOMEBODY PICKS ONE. exceljs is large and this app is cached
 * whole by a service worker for offline use; making every teacher who never
 * imports a spreadsheet carry the parser would be a poor trade. The dynamic
 * import means it is fetched on the first .xlsx and never otherwise.
 *
 * exceljs rather than the `xlsx` package: the latter is pinned at 0.18.5 on the
 * public registry with known advisories, and this parses files containing
 * children's names.
 */
export async function parseSpreadsheet(file: File): Promise<string[][]> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())

  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('That file has no sheets in it.')

  const grid: string[][] = []
  sheet.eachRow((row) => {
    const cells: string[] = []
    // `row.values` is 1-based with a hole at index 0.
    const values = row.values as unknown[]
    for (let i = 1; i < values.length; i++) {
      cells.push(cellText(values[i]))
    }
    if (cells.some((c) => c.trim() !== '')) grid.push(cells)
  })
  return grid
}

/**
 * One cell as text.
 *
 * A DATE CELL IS FORMATTED, NOT STRINGIFIED. exceljs gives a real Date for a
 * date-formatted cell, and `String(date)` produces "Wed Apr 03 2015 …" in the
 * browser's locale — which then fails the date reader for a value that was
 * perfectly good in the file. Formatting it as ISO here means a properly typed
 * spreadsheet column imports without the school having to reformat anything.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
  }
  if (typeof value === 'object') {
    const rich = value as { text?: string; result?: unknown; richText?: { text: string }[] }
    if (Array.isArray(rich.richText)) return rich.richText.map((r) => r.text).join('')
    if (typeof rich.text === 'string') return rich.text
    if (rich.result !== undefined) return cellText(rich.result)
    return ''
  }
  return String(value)
}

/** The file a school is given to fill in, so the columns are never in doubt. */
export function templateCsv(): string {
  return [
    IMPORT_COLUMNS.join(','),
    'Ada,Lovelace,4,4001,2015-12-10',
    'Alan,Turing,3,4002,2016-06-23',
    'Grace,Hopper,4,4003,',
  ].join('\n')
}
