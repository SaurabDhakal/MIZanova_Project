import { describe, expect, test } from 'vitest'
import {
  checkRows,
  parseDelimited,
  parseSpreadsheet,
  readDate,
  toRows,
} from '../../src/lib/studentImport'

/**
 * Reading a roster out of a spreadsheet.
 *
 * PURE FUNCTIONS, SO THEY GET REAL TESTS. Everything here is text in and
 * verdicts out, with no network — which means the nasty inputs can actually be
 * exercised rather than hoped about. The nasty inputs are the point: this code
 * decides what gets written onto a child's record from a file somebody exported
 * out of a system nobody here controls.
 */

const noExisting = new Set<string>()

describe('delimited text', () => {
  test('a quoted field containing a comma stays one field', () => {
    // The failure this prevents: "L'Estrange, Sofia" splitting into two cells,
    // shifting every later column, and importing a surname as a year level.
    const grid = parseDelimited('first,last\nSofia,"L\'Estrange, of Year 4"')
    expect(grid[1]).toEqual(['Sofia', "L'Estrange, of Year 4"])
  })

  test('an escaped quote survives', () => {
    const grid = parseDelimited('a,b\n1,"He said ""hello"""')
    expect(grid[1][1]).toBe('He said "hello"')
  })

  test('a newline inside a quoted field does not split the row', () => {
    const grid = parseDelimited('a,b\n1,"line one\nline two"')
    expect(grid).toHaveLength(2)
    expect(grid[1][1]).toBe('line one\nline two')
  })

  test('tab-separated text pasted from Excel is recognised', () => {
    const grid = parseDelimited('Ada\tLovelace\t4\nAlan\tTuring\t3')
    expect(grid[0]).toEqual(['Ada', 'Lovelace', '4'])
  })

  test('a trailing newline does not invent an empty row', () => {
    expect(parseDelimited('Ada,Lovelace\n')).toHaveLength(1)
  })
})

describe('headings', () => {
  test('a header row is detected and aliases are understood', () => {
    const { rows, usedHeader } = toRows([
      ['Surname', 'Given Name', 'Grade', 'Student ID'],
      ['Lovelace', 'Ada', '4', '4001'],
    ])
    expect(usedHeader).toBe(true)
    expect(rows[0].first_name).toBe('Ada')
    expect(rows[0].last_name).toBe('Lovelace')
    expect(rows[0].year_level).toBe('4')
    expect(rows[0].external_ref).toBe('4001')
  })

  test('a pasted list with no header still works, in column order', () => {
    const { rows, usedHeader } = toRows([['Ada', 'Lovelace', '4', '4001']])
    expect(usedHeader).toBe(false)
    expect(rows[0].first_name).toBe('Ada')
    // Line 1, because with no header the first line IS the first student.
    expect(rows[0].line).toBe(1)
  })

  test('line numbers point at the spreadsheet, not the array', () => {
    const { rows } = toRows([
      ['first_name', 'last_name'],
      ['Ada', 'Lovelace'],
      ['Alan', 'Turing'],
    ])
    // Row 1 is the header, so the first student is on line 2.
    expect(rows.map((r) => r.line)).toEqual([2, 3])
  })

  test('columns nobody asked for are reported, not silently dropped', () => {
    const { unknownHeaders } = toRows([
      ['first_name', 'last_name', 'Medicare number'],
      ['Ada', 'Lovelace', '12345'],
    ])
    expect(unknownHeaders).toEqual(['Medicare number'])
  })
})

describe('dates', () => {
  test('ISO is taken as written', () => {
    expect(readDate('2015-12-10').value).toBe('2015-12-10')
  })

  test('an unambiguous Australian date is read as day first', () => {
    expect(readDate('25/12/2015').value).toBe('2015-12-25')
  })

  test('AN AMBIGUOUS DATE IS REFUSED RATHER THAN GUESSED', () => {
    // 03/04/2015 is 3 April here and 4 March in a file exported from a US
    // system, and nothing in the cell says which. Guessing puts a wrong
    // birthday on a child's record with nobody ever knowing.
    const result = readDate('03/04/2015')
    expect(result.value).toBeNull()
    expect(result.error).toMatch(/could be/i)
  })

  test('a month-first date is refused with a reason that names the problem', () => {
    const result = readDate('12/25/2015')
    expect(result.value).toBeNull()
    expect(result.error).toMatch(/month\/day/i)
  })

  test('empty is allowed, because date of birth is optional', () => {
    expect(readDate('')).toEqual({ value: null })
  })

  test('an impossible date is refused', () => {
    expect(readDate('2015-02-30').value).toBeNull()
  })

  test('a future birthday is refused', () => {
    expect(readDate('2099-01-01').value).toBeNull()
  })
})

describe('spreadsheets', () => {
  /**
   * A REAL WORKBOOK, BUILT AND READ BACK. The .xlsx path is the one a school
   * will actually use and the one a browser click tests least — a single manual
   * upload proves one file opened, not that a date cell, a formula or rich text
   * survive. exceljs runs in node, so the awkward cells can be constructed on
   * purpose.
   */
  async function workbookFile(rows: unknown[][]): Promise<File> {
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet('Students')
    for (const r of rows) sheet.addRow(r)
    const buffer = await wb.xlsx.writeBuffer()
    // parseSpreadsheet only needs arrayBuffer(); File is not a node global.
    return {
      name: 'roll.xlsx',
      arrayBuffer: async () => buffer,
    } as unknown as File
  }

  test('a date-formatted cell comes back as ISO, not a locale string', async () => {
    // exceljs hands back a real Date for a date-typed cell, and String(date)
    // gives "Wed Apr 03 2015 …" — which the date reader would then reject for a
    // value that was perfectly good in the file.
    const file = await workbookFile([
      ['first_name', 'last_name', 'year_level', 'external_ref', 'date_of_birth'],
      ['Ada', 'Lovelace', 4, '8001', new Date(Date.UTC(2015, 11, 10))],
    ])
    const grid = await parseSpreadsheet(file)
    const { rows } = toRows(grid)
    expect(rows[0].date_of_birth).toBe('2015-12-10')
    expect(checkRows(rows, noExisting)[0].verdict.status).toBe('ready')
  })

  test('a number cell becomes text, so a numeric student ID still matches', async () => {
    const file = await workbookFile([
      ['first_name', 'last_name', 'year_level', 'external_ref'],
      ['Alan', 'Turing', 3, 8002],
    ])
    const { rows } = toRows(await parseSpreadsheet(file))
    expect(rows[0].external_ref).toBe('8002')
    expect(rows[0].year_level).toBe('3')
  })

  test('blank rows in the middle of a sheet are not imported as empty children', async () => {
    const file = await workbookFile([
      ['first_name', 'last_name'],
      ['Grace', 'Hopper'],
      [],
      ['Katherine', 'Johnson'],
    ])
    const { rows } = toRows(await parseSpreadsheet(file))
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.first_name)).toEqual(['Grace', 'Katherine'])
  })
})

describe('verdicts', () => {
  const row = (over: Partial<Record<string, string>> = {}) => ({
    line: 1,
    first_name: 'Ada',
    last_name: 'Lovelace',
    year_level: '4',
    external_ref: '',
    date_of_birth: '',
    ...over,
  })

  test('a complete row is ready', () => {
    expect(checkRows([row()], noExisting)[0].verdict.status).toBe('ready')
  })

  test('a missing last name is refused, and says which name', () => {
    const v = checkRows([row({ last_name: '' })], noExisting)[0].verdict
    expect(v.status).toBe('error')
    expect(v.status === 'error' && v.reason).toMatch(/last name/i)
  })

  test('a student already on the roll is a duplicate, not an error', () => {
    // Re-importing an overlapping file is ordinary, not a mistake, and the two
    // are coloured differently on screen for that reason.
    const v = checkRows([row({ external_ref: '4001' })], new Set(['4001']))[0].verdict
    expect(v.status).toBe('duplicate')
  })

  test('the same ID twice in one file names the line it clashes with', () => {
    const checked = checkRows(
      [row({ external_ref: '4001' }), { ...row({ external_ref: '4001' }), line: 7 }],
      noExisting,
    )
    expect(checked[0].verdict.status).toBe('ready')
    const second = checked[1].verdict
    expect(second.status).toBe('error')
    expect(second.status === 'error' && second.reason).toMatch(/line 1/)
  })

  test('a clash is reported even when the earlier row is itself rejected', () => {
    // Found by running a real file through the screen. The earlier version
    // recorded an id only after a row passed every other check, so a clash
    // hid behind an unrelated fault: line 4 rejected for an ambiguous date
    // meant line 7 with the same id was waved through, and the office never
    // learnt their export has two children sharing one id.
    const checked = checkRows(
      [
        { ...row({ external_ref: '7003', date_of_birth: '03/04/2015' }), line: 4 },
        { ...row({ external_ref: '7003' }), line: 7 },
      ],
      noExisting,
    )
    expect(checked[0].verdict.status).toBe('error') // the date
    const second = checked[1].verdict
    expect(second.status).toBe('error')
    expect(second.status === 'error' && second.reason).toMatch(/line 4/)
  })

  test('a blank student ID never counts as a duplicate of another blank', () => {
    // Most schools import without IDs. Treating "" as a value would make every
    // row after the first a duplicate of the one before it.
    const checked = checkRows([row(), { ...row(), line: 2 }], noExisting)
    expect(checked.every((r) => r.verdict.status === 'ready')).toBe(true)
  })

  test('a bad date stops the row rather than importing a null birthday', () => {
    const v = checkRows([row({ date_of_birth: '03/04/2015' })], noExisting)[0].verdict
    expect(v.status).toBe('error')
  })

  test('every input row comes back, including the refused ones', () => {
    const checked = checkRows(
      [row(), { ...row({ first_name: '' }), line: 2 }, { ...row(), line: 3 }],
      noExisting,
    )
    // "42 imported" out of 47 with no way to see the other five is the report
    // this guarantees cannot happen.
    expect(checked).toHaveLength(3)
    expect(checked.map((r) => r.line)).toEqual([1, 2, 3])
  })
})
