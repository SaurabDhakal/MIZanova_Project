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
  if (grid.length === 0)
    return { rows: [], usedHeader: false, unknownHeaders: [] }

  /*
   * A real school spreadsheet does not have tidy headers. It has "First Name*",
   * "DOB (dd/mm/yyyy)" and "Year Level (K-6)", because whoever made it was
   * annotating the column for the person filling it in. Matching those against
   * the alias map literally fails, and the import then reports the column as
   * ignored and every name as missing — which reads as the file being wrong
   * when it is the reader being fussy.
   *
   * So the hint is stripped: a trailing parenthetical, and any asterisk. This
   * is also what lets our own template label its columns "Date of birth
   * (YYYY-MM-DD)" and still be read by the thing that produced it.
   */
  const normalise = (s: string) =>
    s
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[*†‡]/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, ' ')
  const first = grid[0].map(normalise)
  const mapped = first.map(
    (h) => HEADER_ALIASES[h] ?? HEADER_ALIASES[h.replace(/\s/g, '')],
  )
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
export function readDate(raw: string): {
  value: string | null
  error?: string
} {
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

  return {
    value: null,
    error: `"${s}" is not a date this can read. Use YYYY-MM-DD.`,
  }
}

function validCalendarDate(y: number, m: number, d: number, raw: string) {
  const dt = new Date(Date.UTC(y, m - 1, d))
  const real =
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  if (!real) return { value: null, error: `"${raw}" is not a real date.` }

  const now = new Date()
  if (dt.getTime() > now.getTime())
    return { value: null, error: `"${raw}" is in the future.` }
  if (y < now.getUTCFullYear() - 25)
    return { value: null, error: `"${raw}" would make this child over 25.` }

  return {
    value: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  }
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
    if (ref !== '' && !firstLineForRef.has(ref))
      firstLineForRef.set(ref, row.line)
  }

  return rows.map((row) => {
    const first = row.first_name.trim()
    const last = row.last_name.trim()

    if (first === '' && last === '')
      return {
        ...row,
        verdict: { status: 'error', reason: 'No name in this row.' },
      }
    if (first === '')
      return {
        ...row,
        verdict: { status: 'error', reason: 'First name is missing.' },
      }
    if (last === '')
      return {
        ...row,
        verdict: { status: 'error', reason: 'Last name is missing.' },
      }
    if (first.length > 80 || last.length > 80)
      return {
        ...row,
        verdict: { status: 'error', reason: 'That name is implausibly long.' },
      }

    const date = readDate(row.date_of_birth)
    if (date.error)
      return { ...row, verdict: { status: 'error', reason: date.error } }

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
    const rich = value as {
      text?: string
      result?: unknown
      richText?: { text: string }[]
    }
    if (Array.isArray(rich.richText))
      return rich.richText.map((r) => r.text).join('')
    if (typeof rich.text === 'string') return rich.text
    if (rich.result !== undefined) return cellText(rich.result)
    return ''
  }
  return String(value)
}

/**
 * The columns as a person reads them, in the order the importer expects.
 *
 * NOT the database names. `external_ref` means nothing to a school office, and
 * the form on the same page already calls that field "Student ID" — one thing
 * with two names, and the one printed in the template was the wrong one.
 *
 * Every heading here is in HEADER_ALIASES, so a file produced from this
 * template is read back by the importer that produced it. The parenthetical on
 * the date is stripped by `normalise` before matching, which is what makes a
 * self-documenting heading possible at all.
 */
const TEMPLATE_HEADINGS = [
  'First name',
  'Surname',
  'Year level',
  'Student ID',
  'Date of birth (YYYY-MM-DD)',
] as const

/**
 * What the person filling this in needs to know, in the file itself.
 *
 * Kept off the sheet the importer reads — see templateWorkbook. A line of
 * guidance in row 1 of the data sheet would be parsed as a student.
 */
const TEMPLATE_GUIDANCE: [string, string][] = [
  ['First name', 'Required.'],
  ['Surname', 'Required.'],
  ['Year level', 'Optional. Whatever your school writes: 4, K, Prep, Year 7.'],
  [
    'Student ID',
    'Optional. Your own roll number for this child, if you have one. ' +
      'It is what stops the same child being added twice.',
  ],
  [
    'Date of birth (YYYY-MM-DD)',
    'Optional, and the one to be careful with. This column is already ' +
      'formatted as a date, so type it however you normally would — ' +
      '5/3/2015 is fine — and Excel will store it correctly. In a plain ' +
      'CSV there is no such column type, so write it as 2015-03-05.',
  ],
  [
    '',
    'Why the format matters: 05/03/2015 on its own could be the 5th of March ' +
      'or the 3rd of May, and nothing in the cell says which. Rather than ' +
      'guess a birthday onto a child, the import refuses it and asks for ' +
      'YYYY-MM-DD. Dates where the day is 13 or higher are unambiguous and ' +
      'are read without complaint — which is why a file can half-import.',
  ],
  [
    '',
    'Nothing is created until you have seen every row and what will happen ' +
      'to it. Extra columns are ignored, not rejected.',
  ],
]

/**
 * The file a school is given to fill in, so the columns are never in doubt.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS WRONG WITH THE ONE BEFORE IT
 * ---------------------------------------------------------------------------
 * It had the database's column names as headings, and three sample rows:
 *
 *     first_name,last_name,year_level,external_ref,date_of_birth
 *     Ada,Lovelace,4,4001,2015-12-10
 *
 * Ada Lovelace, Alan Turing and Grace Hopper are indistinguishable from real
 * students in a file a school office is filling in. Somebody types their own
 * rows underneath and imports all three — and they PASS, because they are
 * perfectly valid students. The template's own examples would have been
 * enrolled.
 *
 * Nothing said which columns were required, and nothing said the date format
 * was mandatory, which is the expensive one. An Australian school pasting its
 * own DD/MM/YYYY column gets days 13-31 through silently and days 1-12
 * refused: roughly two thirds in, one third out, for no reason the person can
 * see.
 *
 * There are no sample rows here. The guidance lives where it cannot be
 * imported.
 */
export function templateCsv(): string {
  const escape = (cell: string) =>
    /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell

  /*
   * HEADINGS AND NOTHING ELSE, and that is the whole point.
   *
   * A first draft of this put the guidance in the file, below a blank line. It
   * reads fine in Excel and it is a trap: a CSV has no comment convention, so
   * feeding this template back into the importer that produced it would have
   * offered to create a student called "First name Required." — the identical
   * fault to the Ada Lovelace rows it replaced, committed while fixing them.
   *
   * So the notes live where they cannot become children: on the page beside
   * the download button, and on the workbook's second sheet, which
   * parseSpreadsheet never reads.
   */
  return TEMPLATE_HEADINGS.map(escape).join(',') + '\n'
}

/**
 * The same thing as a real workbook, which is the one a school should use.
 *
 * ---------------------------------------------------------------------------
 * THE DATE COLUMN IS THE WHOLE REASON THIS EXISTS
 * ---------------------------------------------------------------------------
 * Sheet 1's birth-date column is formatted as a date. Excel then stores
 * whatever is typed as a real date value rather than text, `parseSpreadsheet`
 * gets a Date back from exceljs, and `cellText` formats it as ISO. So a school
 * secretary types 5/3/2015 the way they always have, and the ambiguity that
 * refuses a third of a CSV import never arises. cellText's own comment made
 * this promise already: "a properly typed spreadsheet column imports without
 * the school having to reformat anything."
 *
 * SHEET ORDER IS LOAD-BEARING. `parseSpreadsheet` reads `worksheets[0]`, so the
 * data sheet must be first and the notes second. Reversing them would import
 * the instructions as children.
 */
export async function templateWorkbook(): Promise<Blob> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MiZanova'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Students')
  sheet.addRow([...TEMPLATE_HEADINGS])

  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: 'middle' }
  header.height = 22
  // Frozen so the headings stay visible on the four hundredth row, which is
  // where somebody loses track of which column they are in.
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  sheet.columns = [
    { width: 18 },
    { width: 18 },
    { width: 12 },
    { width: 14 },
    { width: 24 },
  ]

  // The promise above, in one line. Applied to the column rather than to cells
  // so it holds for every row the school adds.
  sheet.getColumn(5).numFmt = 'yyyy-mm-dd'

  const notes = workbook.addWorksheet('How to fill this in')
  notes.columns = [{ width: 26 }, { width: 96 }]
  notes.addRow(['Column', 'What goes in it'])
  notes.getRow(1).font = { bold: true }
  for (const [column, note] of TEMPLATE_GUIDANCE) {
    const row = notes.addRow([column, note])
    row.alignment = { wrapText: true, vertical: 'top' }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * Why a chosen file could not be read, in words a school office can act on.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACES
 * ---------------------------------------------------------------------------
 * The catch in AddStudents printed the library's own words. Picking the wrong
 * file showed an administrator this:
 *
 *   That file could not be read: Can't find end of central directory : is this
 *   a zip file ? If it is, see https://stuk.github.io/jszip/documentation/…
 *
 * That is JSZip explaining itself to a developer, complete with documentation
 * link, shown to somebody in a school office who picked the wrong thing from a
 * folder. It names no cause they recognise and no action they can take.
 *
 * ---------------------------------------------------------------------------
 * .xls IS THE COMMON CASE AND IT IS NOT AN ERROR ANYBODY CAUSED
 * ---------------------------------------------------------------------------
 * `parseSpreadsheet` calls `workbook.xlsx.load`, which reads the modern zipped
 * format ONLY. Excel's pre-2007 .xls is a completely different binary file, so
 * it fails inside the zip reader and produced exactly the message above — while
 * the file input invited it by listing .xls in `accept`.
 *
 * Schools have old files. This says which format it is and how to convert it,
 * which is a thirty-second job in Excel, instead of implying the file is
 * broken.
 *
 * `error` is accepted but deliberately never shown. A library's exception text
 * is a fact about our dependencies, not about the file somebody chose.
 */
export function readFailureMessage(fileName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : ''

  if (/\.xls$/i.test(fileName)) {
    return (
      'That is an older Excel file (.xls), which cannot be read here. Open it ' +
      'in Excel and choose File \u2192 Save As, then save it as .xlsx or CSV.'
    )
  }

  // Our own sentence from parseSpreadsheet, already written for a reader.
  if (/no sheets in it/i.test(message)) return message

  if (/\.xlsx$/i.test(fileName)) {
    return (
      'That file is named .xlsx but is not a workbook this can open. It may be ' +
      'password protected, or saved in another format and renamed. Open it in ' +
      'Excel and use File \u2192 Save As to save a fresh .xlsx or CSV.'
    )
  }

  return (
    'That file could not be read. It should be a CSV or an .xlsx spreadsheet ' +
    '\u2014 the Download the template button gives you one in the right shape.'
  )
}
