import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createStudents,
  fetchExistingStudentRefs,
  queryKeys,
  findJustCreatedStudent,
  saveStudentProfile,
  EMPTY_PROFILE,
  type StudentProfile,
  type ImportOutcome,
} from '../../lib/api'
import {
  IMPORT_COLUMNS,
  checkRows,
  parseDelimited,
  parseSpreadsheet,
  readDate,
  readFailureMessage,
  templateCsv,
  templateWorkbook,
  toRows,
  type CheckedRow,
} from '../../lib/studentImport'
import { ErrorState } from '../../components/QueryState'
import Icon from '../../components/Icon'
import AboutThisChild from '../../components/AboutThisChild'
import { showToast } from '../../lib/toast'
import { useAuth } from '../../lib/auth'

/**
 * Putting children on the roll — one, a pasted list, or a spreadsheet.
 *
 * THE LARGEST GAP IN THE PRODUCT UNTIL NOW. There was no way to create a
 * student at all: every child in the database got there through a seed script.
 * A school of six hundred could not be onboarded (docs/14-Interface-Direction
 * ranks this first).
 *
 * ---------------------------------------------------------------------------
 * THREE WAYS IN, ONE WAY THROUGH
 * ---------------------------------------------------------------------------
 * Typing one child, pasting a column out of Excel, and choosing an .xlsx are
 * the three things an office actually does, and they are the same job at
 * different scales. Rather than three features that drift apart, all three
 * produce rows, every row gets a verdict, and the same preview and the same
 * button finish the work. A single student is an import of one.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IS WRITTEN BEFORE SOMEBODY HAS SEEN IT
 * ---------------------------------------------------------------------------
 * These are children's records. An import that runs on submit and reports
 * afterwards leaves no moment to notice a shifted column, an American date
 * order, or last term's file. So the button that reads a file never writes
 * anything, and the button that writes says exactly how many rows and skips
 * the rest.
 */

type Stage = 'choose' | 'preview' | 'done'

const VERDICT_STYLE = {
  ready: 'bg-success-subtle text-success-foreground',
  duplicate: 'bg-warning-subtle text-warning-foreground',
  error: 'bg-danger-subtle text-danger-foreground',
} as const

const VERDICT_LABEL = {
  ready: 'Will be added',
  duplicate: 'Already on the roll',
  error: 'Cannot be added',
} as const

/** Which of the three optional description columns this row filled in. */
function describedLabels(row: {
  interests: string
  strengths: string
  finds_hard: string
}): string[] {
  return [
    row.interests.trim() && 'Loves',
    row.strengths.trim() && 'Good at',
    row.finds_hard.trim() && 'Finds hard',
  ].filter((label): label is string => Boolean(label))
}

export default function AddStudents() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('choose')
  const [rows, setRows] = useState<CheckedRow[]>([])
  /**
   * The row being corrected in the review table, and the values being typed.
   *
   * ---------------------------------------------------------------------------
   * WHY A ROW CAN BE FIXED HERE AT ALL
   * ---------------------------------------------------------------------------
   * Saurab: "what if while importing the list one wrong came up".
   *
   * Until now: nothing. A file of thirty children with one bad date of birth
   * left two options, and both were bad. Import the twenty-nine and lose the
   * thirtieth — the row is gone when the page resets, so somebody has to
   * remember which child it was and type them in again. Or press Start again,
   * go back to the spreadsheet, find the row, fix it, save, and re-paste all
   * thirty.
   *
   * The correction is almost always a keystroke: a date typed 05/03/2015, a
   * missing surname, a student ID that repeats. Sending somebody back to Excel
   * for a keystroke, on a screen that is already showing them exactly what is
   * wrong and on which line, is the kind of thing that makes people import a
   * file with errors in it rather than fix them.
   *
   * EVERY ROW IS EDITABLE, not only the failing ones. A row can be perfectly
   * valid and still wrong — "Jhon" passes every check there is.
   */
  const [editingLine, setEditingLine] = useState<number | null>(null)
  const [rowDraft, setRowDraft] = useState<CheckedRow | null>(null)
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const [readError, setReadError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)

  // One student, typed.
  const [one, setOne] = useState({
    first_name: '',
    last_name: '',
    year_level: '',
    external_ref: '',
    date_of_birth: '',
  })
  const [pasted, setPasted] = useState('')
  /**
   * What the office knows about this one child — db/127.
   *
   * ONLY ON THE SINGLE-STUDENT FORM, and deliberately not on the paste or file
   * paths. docs/19 §5.1 is blunt that the office typing six hundred names knows
   * none of this; it is learned in the second week by the person in the room.
   * Five more columns in the import would be five more empty columns.
   *
   * Typing ONE child is a different act. Somebody doing that is usually looking
   * at a form a family filled in, and the educator's own add-student screen has
   * asked this since db/127. There was no reason for the same question to be
   * absent here except that nobody had put it in.
   */
  const [about, setAbout] = useState<StudentProfile>(EMPTY_PROFILE)
  const [aboutOpen, setAboutOpen] = useState(false)

  const existing = useQuery({
    queryKey: queryKeys.existingStudentRefs,
    queryFn: fetchExistingStudentRefs,
  })

  const build = (grid: string[][], describedAs: string) => {
    setReadError(null)
    const { rows: parsed, usedHeader, unknownHeaders } = toRows(grid)
    if (parsed.length === 0) {
      setReadError(
        usedHeader
          ? 'The column headings were read, but there are no students under ' +
              'them yet. If this is the template, fill in a row and try again.'
          : 'There were no rows in that.',
      )
      return
    }
    const messages: string[] = []
    messages.push(
      usedHeader
        ? 'The first row was read as column headings.'
        : `No headings found, so the columns were read in order: ${IMPORT_COLUMNS.join(', ')}.`,
    )
    if (unknownHeaders.length > 0)
      messages.push(
        `Ignored column${unknownHeaders.length === 1 ? '' : 's'}: ${unknownHeaders.join(', ')}.`,
      )

    setRows(checkRows(parsed, existing.data ?? new Set()))
    setSource(describedAs)
    setNotes(messages)
    setStage('preview')
  }

  /**
   * Put a corrected row back and judge the whole list again.
   *
   * RE-CHECKS EVERYTHING, not just the row that changed. The verdicts are not
   * independent of each other: duplicate student IDs are decided by comparing
   * rows, so fixing line 12's ID can clear the error that was showing on line
   * 30. Re-running the one row would leave the other still marked as a
   * duplicate of something that no longer exists.
   */
  const saveRow = () => {
    if (!rowDraft) return
    const next = rows.map((r) =>
      r.line === rowDraft.line ? { ...rowDraft } : r,
    )
    setRows(checkRows(next, existing.data ?? new Set()))
    setEditingLine(null)
    setRowDraft(null)
  }

  const onFile = async (file: File) => {
    setReadError(null)

    /* Answered before the reader is even called. An .xls goes into the zip
       parser and comes out as "Can't find end of central directory", which is
       true and useless; the office needs to be told it is the old format and
       what to do about it. `accept` still lists .xls on purpose — a file greyed
       out in the picker for no stated reason is worse than one that explains
       itself when chosen. */
    if (/\.xls$/i.test(file.name)) {
      setReadError(readFailureMessage(file.name, null))
      return
    }

    try {
      const grid = /\.xlsx$/i.test(file.name)
        ? await parseSpreadsheet(file)
        : parseDelimited(await file.text())
      build(grid, file.name)
    } catch (err) {
      setReadError(readFailureMessage(file.name, err))
    }
  }

  /** Anything at all typed into the About section. */
  const hasAbout =
    Boolean(about.interests || about.strengths || about.finds_hard) ||
    about.helps.length > 0 ||
    about.triggers.length > 0

  const importer = useMutation({
    mutationFn: async () => {
      const result = await createStudents(
        rows
          .filter((r) => r.verdict.status === 'ready')
          .map((r) => ({
            line: r.line,
            first_name: r.first_name.trim(),
            last_name: r.last_name.trim(),
            year_level: r.year_level.trim() || null,
            external_ref: r.external_ref.trim() || null,
            date_of_birth: readDate(r.date_of_birth).value,
            // db/127. Empty on the single-student path, where the About form
            // below writes the profile instead — and on every file that simply
            // does not have these columns, which is most of them.
            interests: r.interests.trim() || null,
            strengths: r.strengths.trim() || null,
            finds_hard: r.finds_hard.trim() || null,
          })),
        // RLS re-checks this against my_school_id(), so it is the caller
        // stating which school, not the caller choosing.
        profile!.school_id!,
      )

      /*
       * SECOND, AND NEVER ALLOWED TO UNDO THE FIRST — db/127.
       *
       * Getting the child onto the roll is the thing that must succeed. If the
       * profile write fails, the child is still there and the office is told
       * about the part that did not land — rather than being shown one error
       * that makes it look as though nothing was created and inviting them to
       * type it all again. The educator's add-student screen says the same.
       *
       * Only when exactly one child was created. That is the single-student
       * form by definition; a pasted list has no About section to have filled
       * in, so there is nothing to attach and no row to attach it to.
       */
      if (hasAbout && result.created === 1) {
        try {
          const id = await findJustCreatedStudent({
            firstName: one.first_name.trim(),
            lastName: one.last_name.trim(),
            externalRef: one.external_ref.trim() || null,
          })
          if (!id) throw new Error('The new record could not be found.')
          await saveStudentProfile(id, about)
        } catch (error) {
          showToast(
            `${one.first_name.trim() || 'The student'} was added, but the notes about them were not saved. You can add them from their record. (${
              error instanceof Error ? error.message : 'Unknown error'
            })`,
            'error',
          )
        }
      }

      return result
    },
    onSuccess: (result) => {
      setOutcome(result)
      setStage('done')
      void queryClient.invalidateQueries({ queryKey: queryKeys.students })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.existingStudentRefs,
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.classroomStats })
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  /**
   * Hand the file over.
   *
   * The revoke is deferred by a tick rather than called on the next line. The
   * click starts the save, but the browser has not necessarily finished
   * reading the blob when the statement after it runs, and revoking a URL out
   * from under a download in progress can cancel it. Nothing here is large
   * enough for it to have bitten yet, and the workbook is bigger than the CSV.
   */
  const handOver = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const downloadTemplate = async () => {
    setReadError(null)
    try {
      handOver(await templateWorkbook(), 'mizanova-students.xlsx')
    } catch {
      // exceljs is loaded on demand, so this is a failed chunk fetch — offline,
      // or a deploy mid-session. The CSV needs nothing but this file.
      setReadError(
        'The Excel template could not be built just now. Use the CSV instead — ' +
          'it has the same columns.',
      )
    }
  }

  const downloadCsvTemplate = () =>
    handOver(
      new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }),
      'mizanova-students.csv',
    )

  /** Did this file carry any of the three description columns at all? */
  const anyDescribed = rows.some((r) => describedLabels(r).length > 0)

  const counts = {
    ready: rows.filter((r) => r.verdict.status === 'ready').length,
    duplicate: rows.filter((r) => r.verdict.status === 'duplicate').length,
    error: rows.filter((r) => r.verdict.status === 'error').length,
  }

  const startOver = () => {
    setStage('choose')
    setRows([])
    setOutcome(null)
    setPasted('')
    setAbout(EMPTY_PROFILE)
    setAboutOpen(false)
    setOne({
      first_name: '',
      last_name: '',
      year_level: '',
      external_ref: '',
      date_of_birth: '',
    })
  }

  const field =
    'w-full rounded-btn border border-border bg-background px-3 py-2 text-sm text-foreground'

  return (
    <div className="max-w-4xl">
      {/* 17px, and the only way out of this page. Same fault and same fix as
          the IEP back link in shared/IepPlans. */}
      <Link
        to="/school-admin/students"
        className="-ml-1 inline-flex min-h-11 items-center px-1 text-sm font-medium text-primary hover:underline"
      >
        ← All students
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="text-title text-foreground">Add students</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          One child, a list pasted from a spreadsheet, or a file. Whichever you
          use, you will see exactly what is going to be created before anything
          is written.
        </p>
      </header>

      {existing.isError && (
        <ErrorState
          message={existing.error.message}
          onRetry={() => void existing.refetch()}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {stage === 'choose' && (
        <div className="space-y-5">
          {/* --- One ------------------------------------------------------ */}
          <section className="rounded-card border border-border bg-card p-5 shadow-raised">
            <h2 className="text-section text-foreground">Add one student</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Only a first and last name are required. A student ID is what your
              office searches by, and stops the same child being added twice.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-foreground">
                  First name
                </span>
                <input
                  className={`${field} mt-1`}
                  value={one.first_name}
                  onChange={(e) =>
                    setOne({ ...one, first_name: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-foreground">
                  Last name
                </span>
                <input
                  className={`${field} mt-1`}
                  value={one.last_name}
                  onChange={(e) =>
                    setOne({ ...one, last_name: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-foreground">
                  Year level
                </span>
                <input
                  className={`${field} mt-1`}
                  value={one.year_level}
                  onChange={(e) =>
                    setOne({ ...one, year_level: e.target.value })
                  }
                  placeholder="4"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-foreground">
                  Student ID
                </span>
                <input
                  className={`${field} mt-1`}
                  value={one.external_ref}
                  onChange={(e) =>
                    setOne({ ...one, external_ref: e.target.value })
                  }
                  placeholder="4021"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-foreground">
                  Date of birth
                </span>
                <input
                  type="date"
                  className={`${field} mt-1`}
                  value={one.date_of_birth}
                  onChange={(e) =>
                    setOne({ ...one, date_of_birth: e.target.value })
                  }
                />
              </label>
            </div>

            {/* Optional, and closed until asked for. A page whose first section
                is five required fields plus five open-ended ones reads as a
                long form; this is one line until somebody wants it. */}
            {!aboutOpen ? (
              <button
                type="button"
                onClick={() => setAboutOpen(true)}
                className="pressable mt-4 min-h-11 w-full rounded-btn border border-dashed border-border px-4 text-left"
              >
                <span className="text-sm font-semibold text-foreground">
                  Anything about {one.first_name.trim() || 'this child'} worth
                  writing down?
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Optional. What they love, are good at and find hard &mdash;
                  the part that makes suggestions about this child rather than
                  about children. It can be added later from their record.
                </span>
              </button>
            ) : (
              <div className="mt-4 rounded-btn border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    About {one.first_name.trim() || 'this child'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setAboutOpen(false)}
                    className="min-h-11 px-2 text-xs text-muted-foreground hover:underline"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3">
                  <AboutThisChild
                    idPrefix="admin-add-one"
                    firstName={one.first_name.trim() || undefined}
                    value={about}
                    onChange={setAbout}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={!one.first_name.trim() || !one.last_name.trim()}
              onClick={() =>
                build(
                  [
                    [
                      one.first_name,
                      one.last_name,
                      one.year_level,
                      one.external_ref,
                      one.date_of_birth,
                    ],
                  ],
                  'the form above',
                )
              }
              className="pressable min-h-11 mt-4 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
            >
              Review this student
            </button>
          </section>

          {/* --- Many, pasted --------------------------------------------- */}
          <section className="rounded-card border border-border bg-card p-5 shadow-raised">
            <h2 className="text-section text-foreground">Paste a list</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Select the rows in your spreadsheet and paste them here. Headings
              are recognised if you include them; without them the columns are
              read in this order: {IMPORT_COLUMNS.join(', ')}.
            </p>
            <textarea
              aria-label="Paste student rows, one per line"
              rows={5}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={
                'Ada\tLovelace\t4\t4001\t2015-12-10\nAlan\tTuring\t3\t4002\t2016-06-23'
              }
              className={`${field} mt-3 font-mono`}
            />
            <button
              type="button"
              disabled={pasted.trim() === ''}
              onClick={() => build(parseDelimited(pasted), 'the pasted list')}
              className="pressable min-h-11 mt-3 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
            >
              Review these students
            </button>
          </section>

          {/* --- A file ---------------------------------------------------- */}
          <section className="rounded-card border border-border bg-card p-5 shadow-raised">
            <h2 className="text-section text-foreground">Import a file</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Excel (.xlsx) or CSV. The first sheet is used. Nothing is created
              until you have seen the rows.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                aria-label="Choose a spreadsheet of students"
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void onFile(file)
                  // Cleared so choosing the same file twice fires again.
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="pressable min-h-11 inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
              >
                <Icon name="resources" className="h-4 w-4" />
                Choose a file
              </button>
              <button
                type="button"
                onClick={() => void downloadTemplate()}
                className="pressable min-h-11 inline-flex items-center gap-2 rounded-btn border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-background"
              >
                <Icon name="audit" className="h-4 w-4" />
                Download the template
              </button>
              {/* Second, and quieter. The workbook is the one to use — its
                  birth-date column is formatted as a date, which is what stops
                  a DD/MM column half-importing. The CSV is here for whoever
                  does not have Excel. */}
              <button
                type="button"
                onClick={downloadCsvTemplate}
                className="min-h-11 inline-flex items-center px-1 text-sm font-medium text-primary hover:underline"
              >
                or as CSV
              </button>
            </div>

            {/* On the page, not in the file. A line of guidance inside a CSV is
                parsed as a student, and the old template's three sample rows —
                Ada Lovelace, Alan Turing, Grace Hopper — would have been
                enrolled by anybody who typed underneath them. */}
            <dl className="mt-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="font-semibold text-foreground">Needed</dt>
              <dd className="text-muted-foreground">
                First name and surname. Nothing else is required.
              </dd>
              <dt className="font-semibold text-foreground">Optional</dt>
              <dd className="text-muted-foreground">
                Year level, Student ID, date of birth. A Student ID is what
                stops the same child being added twice.
              </dd>
              <dt className="font-semibold text-foreground">Dates</dt>
              <dd className="text-muted-foreground">
                Write{' '}
                <span className="font-medium text-foreground">2015-03-05</span>{' '}
                for the 5th of March. In the Excel template the column is
                already formatted as a date, so 5/3/2015 is fine there.{' '}
                <span className="font-medium text-foreground">
                  05/03/2015 in a CSV is refused
                </span>{' '}
                &mdash; it could be the 5th of March or the 3rd of May, and
                guessing would put a wrong birthday on a child.
              </dd>
            </dl>

            {readError && (
              <p role="alert" className="mt-3 text-sm text-danger-foreground">
                {readError}
              </p>
            )}
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {stage === 'preview' && (
        <section className="rounded-card border border-border bg-card p-5 shadow-raised">
          <h2 className="text-section text-foreground">Check before adding</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} row{rows.length === 1 ? '' : 's'} read from {source}.
            Nothing has been created yet.
          </p>

          {notes.length > 0 && (
            <ul className="mt-3 space-y-1">
              {notes.map((n) => (
                <li key={n} className="text-sm text-muted-foreground">
                  {n}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={`rounded-btn px-2.5 py-1 text-sm font-semibold ${VERDICT_STYLE.ready}`}
            >
              {counts.ready} will be added
            </span>
            {counts.duplicate > 0 && (
              <span
                className={`rounded-btn px-2.5 py-1 text-sm font-semibold ${VERDICT_STYLE.duplicate}`}
              >
                {counts.duplicate} already on the roll
              </span>
            )}
            {counts.error > 0 && (
              <span
                className={`rounded-btn px-2.5 py-1 text-sm font-semibold ${VERDICT_STYLE.error}`}
              >
                {counts.error} cannot be added
              </span>
            )}
          </div>

          {/* EVERY ROW APPEARS, including the ones being skipped. A report of
              "42 added" against a file of 47 is what costs somebody an
              afternoon working out which five. */}
          <div className="mt-4 max-h-96 overflow-auto rounded-card border border-border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Every row read, with what will happen to it
              </caption>
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Line
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Year
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    ID
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Born
                  </th>
                  {/* Only when the file actually carried them. A column of
                      dashes on every ordinary import would be six hundred rows
                      of nothing, on the one screen that has to stay readable. */}
                  {anyDescribed && (
                    <th scope="col" className="px-3 py-2 font-semibold">
                      About them
                    </th>
                  )}
                  <th scope="col" className="px-3 py-2 font-semibold">
                    What happens
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) =>
                  editingLine === r.line && rowDraft ? (
                    /* THE SAME ROW, IN PLACE. An edit form somewhere else on a
                       long table is a correction somebody makes to the wrong
                       child — the whole value here is that line 12 is being
                       fixed where line 12 is. */
                    <tr
                      key={r.line}
                      className="border-b border-border bg-background last:border-0"
                    >
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.line}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <input
                            aria-label={`First name, line ${r.line}`}
                            value={rowDraft.first_name}
                            onChange={(e) =>
                              setRowDraft({
                                ...rowDraft,
                                first_name: e.target.value,
                              })
                            }
                            className="min-h-11 w-28 rounded-btn border border-border bg-card px-2 text-foreground"
                          />
                          <input
                            aria-label={`Surname, line ${r.line}`}
                            value={rowDraft.last_name}
                            onChange={(e) =>
                              setRowDraft({
                                ...rowDraft,
                                last_name: e.target.value,
                              })
                            }
                            className="min-h-11 w-28 rounded-btn border border-border bg-card px-2 text-foreground"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          aria-label={`Year level, line ${r.line}`}
                          value={rowDraft.year_level}
                          onChange={(e) =>
                            setRowDraft({
                              ...rowDraft,
                              year_level: e.target.value,
                            })
                          }
                          className="min-h-11 w-16 rounded-btn border border-border bg-card px-2 text-foreground"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          aria-label={`Student ID, line ${r.line}`}
                          value={rowDraft.external_ref}
                          onChange={(e) =>
                            setRowDraft({
                              ...rowDraft,
                              external_ref: e.target.value,
                            })
                          }
                          className="min-h-11 w-24 rounded-btn border border-border bg-card px-2 text-foreground"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {/* A DATE FIELD, WHICH IS THE POINT. The commonest
                            failure here is an ambiguous 05/03/2015, and a
                            picker cannot produce one. */}
                        <input
                          type="date"
                          aria-label={`Date of birth, line ${r.line}`}
                          value={readDate(rowDraft.date_of_birth).value ?? ''}
                          onChange={(e) =>
                            setRowDraft({
                              ...rowDraft,
                              date_of_birth: e.target.value,
                            })
                          }
                          className="min-h-11 rounded-btn border border-border bg-card px-2 text-foreground"
                        />
                      </td>
                      {anyDescribed && (
                        <td className="px-3 py-2 text-muted-foreground">
                          {describedLabels(r).join(' · ') || '—'}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={saveRow}
                            className="pressable min-h-11 rounded-btn bg-primary px-3 text-sm font-semibold text-primary-foreground"
                          >
                            Save row
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLine(null)
                              setRowDraft(null)
                            }}
                            className="pressable min-h-11 rounded-btn border border-border px-3 text-sm font-semibold text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={r.line}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.line}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {`${r.first_name} ${r.last_name}`.trim() || '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.year_level || '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.external_ref || '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {readDate(r.date_of_birth).value ??
                          (r.date_of_birth || '—')}
                      </td>
                      {anyDescribed && (
                        /* WHICH of the three arrived, not the text itself. The
                         sentences are long enough to make every row three
                         lines tall, and what somebody is checking here is
                         whether the notes landed on the right child. */
                        <td className="px-3 py-2 text-muted-foreground">
                          {describedLabels(r).join(' · ') || '—'}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-btn px-2 py-0.5 text-xs font-semibold ${VERDICT_STYLE[r.verdict.status]}`}
                          >
                            {VERDICT_LABEL[r.verdict.status]}
                          </span>
                          {r.verdict.status !== 'ready' && (
                            <span className="text-muted-foreground">
                              {r.verdict.reason}
                            </span>
                          )}
                          {/* Offered on every row. A row can pass every check
                            there is and still be wrong — "Jhon" does. */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLine(r.line)
                              setRowDraft({ ...r })
                            }}
                            className="min-h-11 ml-auto inline-flex items-center px-2 text-sm font-semibold text-primary hover:underline"
                          >
                            Fix
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={counts.ready === 0 || importer.isPending}
              onClick={() => importer.mutate()}
              className="pressable min-h-11 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {importer.isPending
                ? 'Adding…'
                : `Add ${counts.ready} student${counts.ready === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={startOver}
              className="pressable min-h-11 rounded-btn border border-border px-4 py-2.5 font-semibold text-foreground hover:bg-background"
            >
              Start again
            </button>
          </div>

          {counts.ready === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing here can be added. Fix the rows above and paste or upload
              again.
            </p>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {stage === 'done' && outcome && (
        <section className="rounded-card border border-border bg-card p-5 shadow-raised">
          <h2 className="text-section text-foreground">
            {outcome.created} student{outcome.created === 1 ? '' : 's'} added
          </h2>

          {/* SKIPPED ROWS ARE NAMED, not counted. The whole point of the
              preview was that nobody has to guess which ones. */}
          {outcome.failed.length > 0 ? (
            <>
              <p className="mt-1 text-sm text-danger-foreground">
                {outcome.failed.length} could not be added:
              </p>
              <ul className="mt-2 space-y-1">
                {outcome.failed.map((f) => (
                  <li key={f.line} className="text-sm text-foreground">
                    Line {f.line} — {f.name}:{' '}
                    <span className="text-muted-foreground">{f.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Every row that was ready went in.
            </p>
          )}

          {/* SEPARATE FROM THE FAILURES ABOVE, because these children ARE on
              the roll. Listing them as failures would send somebody to import
              them again and the school would end up with two of each. */}
          {outcome.profilesNotSaved.length > 0 && (
            <div className="mt-3 rounded-card border border-warning bg-warning-subtle p-3">
              <p className="text-sm font-semibold text-warning-foreground">
                Added, but their notes could not be attached:
              </p>
              <ul className="mt-1 space-y-0.5">
                {outcome.profilesNotSaved.map((p) => (
                  <li key={p.name} className="text-sm text-warning-foreground">
                    {p.name} &mdash; {p.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-sm text-warning-foreground">
                Open their record and add it under &ldquo;About&rdquo;.
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/school-admin/students"
              className="pressable rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
            >
              See the roll
            </Link>
            <button
              type="button"
              onClick={startOver}
              className="pressable min-h-11 rounded-btn border border-border px-4 py-2.5 font-semibold text-foreground hover:bg-background"
            >
              Add more
            </button>
          </div>

          {/* WHAT IS STILL MISSING, NAMED. The first two were already here.
              The third was not, and it is the one nobody would guess: the AI
              cannot tell a child's interests from an incident report, so a
              school that never fills this in gets general advice forever and
              has no way to learn why. */}
          <div className="mt-4 max-w-prose space-y-2 text-xs text-muted-foreground">
            <p>
              Adding a child creates the record. It does not assign a teacher or
              connect a family &mdash; those are separate on purpose, because an
              assignment is what actually grants access to a record. Use
              Directory &amp; Access for both.
            </p>
            <p>
              It also does not say anything about who they are. What a child
              loves, is good at and finds hard lives on their record under
              &ldquo;About&rdquo;, and it is what turns general advice into
              advice about them. Whoever teaches them is usually the one who
              knows it, a fortnight from now.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
