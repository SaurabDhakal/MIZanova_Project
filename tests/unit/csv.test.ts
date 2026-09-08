import { describe, expect, test } from 'vitest'
import { toCsv } from '../../src/lib/csv'

/**
 * The quoting half of this is ordinary. The formula half is the reason the
 * file exists: every export in this product carries free text somebody typed,
 * and a spreadsheet evaluates a cell that begins with the wrong character.
 */

const lines = (csv: string) => csv.replace(/^\ufeff/, '').split('\r\n')

describe('toCsv quotes what would otherwise break the file', () => {
  test('commas, quotes and newlines survive a round of Excel', () => {
    const csv = toCsv(
      ['Title', 'Note'],
      [['Bath time', 'He said "no", loudly.\nThen settled.']],
    )
    expect(lines(csv)[0]).toBe('"Title","Note"')
    // The newline stays inside the quoted cell rather than starting a row.
    expect(csv).toContain('"He said ""no"", loudly.\nThen settled."')
  })

  test('an empty cell is an empty cell, not the word undefined', () => {
    const csv = toCsv(['A', 'B'], [[null, undefined]])
    expect(lines(csv)[1]).toBe('"",""')
  })
})

describe('toCsv refuses to hand a spreadsheet a formula', () => {
  /*
   * The attack this stops: a parent, or anybody with a free-text field, writes
   * a formula into a record. The school exports the file, double-clicks it,
   * and the sheet runs it — reaching the network in the case of HYPERLINK or
   * WEBSERVICE, with the rest of the row available to concatenate.
   */
  test.each([
    ['=1+1', 'a plain formula'],
    ['=HYPERLINK("http://example.invalid","click")', 'the one that reaches the network'],
    ['+1', 'a leading plus'],
    ['-1+1', 'a leading minus'],
    ['@SUM(A1)', 'a leading at-sign'],
    ['\tstarts with a tab', 'a leading tab'],
  ])('neutralises %s (%s)', (payload) => {
    const csv = toCsv(['Note'], [[payload]])
    // Prefixed, so the spreadsheet stores it as text.
    expect(lines(csv)[1]).toBe(`"'${payload.replaceAll('"', '""')}"`)
  })

  test('and leaves ordinary writing alone, including a mid-cell equals', () => {
    // "-2 hours of sleep" and "progress = slow" are things people write. A
    // record that silently drops or mangles them is worse than the injection.
    const csv = toCsv(['Note'], [['Bedtime = 7pm, up 3 times']])
    expect(lines(csv)[1]).toBe('"Bedtime = 7pm, up 3 times"')
  })
})

describe('the file opens correctly on a Windows machine', () => {
  test('it starts with a BOM, so accented names are not mangled', () => {
    // Sofia L'Estrange and Maya Ferreira are both in this database.
    const csv = toCsv(['Name'], [["Sofia L'Estrange"]])
    expect(csv.startsWith('\ufeff')).toBe(true)
  })

  test('rows end CRLF, which is what the format actually says', () => {
    const csv = toCsv(['A'], [['1'], ['2']])
    expect(csv.replace(/^\ufeff/, '')).toBe('"A"\r\n"1"\r\n"2"')
  })
})
