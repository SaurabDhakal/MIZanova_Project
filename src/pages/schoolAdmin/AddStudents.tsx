import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createStudents,
  fetchExistingStudentRefs,
  queryKeys,
  type ImportOutcome,
} from '../../lib/api'
import {
  IMPORT_COLUMNS,
  checkRows,
  parseDelimited,
  parseSpreadsheet,
  readDate,
  templateCsv,
  toRows,
  type CheckedRow,
} from '../../lib/studentImport'
import { ErrorState } from '../../components/QueryState'
import Icon from '../../components/Icon'
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

export default function AddStudents() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('choose')
  const [rows, setRows] = useState<CheckedRow[]>([])
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

  const existing = useQuery({
    queryKey: queryKeys.existingStudentRefs,
    queryFn: fetchExistingStudentRefs,
  })

  const build = (grid: string[][], describedAs: string) => {
    setReadError(null)
    const { rows: parsed, usedHeader, unknownHeaders } = toRows(grid)
    if (parsed.length === 0) {
      setReadError('There were no rows in that.')
      return
    }
    const messages: string[] = []
    messages.push(
      usedHeader
        ? 'The first row was read as column headings.'
        : `No headings found, so the columns were read in order: ${IMPORT_COLUMNS.join(', ')}.`,
    )
    if (unknownHeaders.length > 0)
      messages.push(`Ignored column${unknownHeaders.length === 1 ? '' : 's'}: ${unknownHeaders.join(', ')}.`)

    setRows(checkRows(parsed, existing.data ?? new Set()))
    setSource(describedAs)
    setNotes(messages)
    setStage('preview')
  }

  const onFile = async (file: File) => {
    setReadError(null)
    try {
      const grid = /\.xlsx?$/i.test(file.name)
        ? await parseSpreadsheet(file)
        : parseDelimited(await file.text())
      build(grid, file.name)
    } catch (err) {
      // A corrupt or password-protected workbook, or an .xls from 1997.
      setReadError(
        err instanceof Error
          ? `That file could not be read: ${err.message}`
          : 'That file could not be read.',
      )
    }
  }

  const importer = useMutation({
    mutationFn: () =>
      createStudents(
        rows
          .filter((r) => r.verdict.status === 'ready')
          .map((r) => ({
            line: r.line,
            first_name: r.first_name.trim(),
            last_name: r.last_name.trim(),
            year_level: r.year_level.trim() || null,
            external_ref: r.external_ref.trim() || null,
            date_of_birth: readDate(r.date_of_birth).value,
          })),
        // RLS re-checks this against my_school_id(), so it is the caller
        // stating which school, not the caller choosing.
        profile!.school_id!,
      ),
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

  const downloadTemplate = () => {
    const url = URL.createObjectURL(
      new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'mizanova-student-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

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
    setOne({ first_name: '', last_name: '', year_level: '', external_ref: '', date_of_birth: '' })
  }

  const field =
    'w-full rounded-btn border border-border bg-background px-3 py-2 text-sm text-foreground'

  return (
    <div className="max-w-4xl">
      <Link
        to="/school-admin/students"
        className="text-sm font-medium text-primary hover:underline"
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
                  onChange={(e) => setOne({ ...one, first_name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-foreground">
                  Last name
                </span>
                <input
                  className={`${field} mt-1`}
                  value={one.last_name}
                  onChange={(e) => setOne({ ...one, last_name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-foreground">
                  Year level
                </span>
                <input
                  className={`${field} mt-1`}
                  value={one.year_level}
                  onChange={(e) => setOne({ ...one, year_level: e.target.value })}
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
                  onChange={(e) => setOne({ ...one, external_ref: e.target.value })}
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
              className="mt-4 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
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
              rows={5}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={'Ada\tLovelace\t4\t4001\t2015-12-10\nAlan\tTuring\t3\t4002\t2016-06-23'}
              className={`${field} mt-3 font-mono`}
            />
            <button
              type="button"
              disabled={pasted.trim() === ''}
              onClick={() => build(parseDelimited(pasted), 'the pasted list')}
              className="mt-3 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
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
                className="inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
              >
                <Icon name="resources" className="h-4 w-4" />
                Choose a file
              </button>
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 rounded-btn border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-background"
              >
                <Icon name="audit" className="h-4 w-4" />
                Download the template
              </button>
            </div>

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
          <h2 className="text-section text-foreground">
            Check before adding
          </h2>
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
            <span className={`rounded-btn px-2.5 py-1 text-sm font-semibold ${VERDICT_STYLE.ready}`}>
              {counts.ready} will be added
            </span>
            {counts.duplicate > 0 && (
              <span className={`rounded-btn px-2.5 py-1 text-sm font-semibold ${VERDICT_STYLE.duplicate}`}>
                {counts.duplicate} already on the roll
              </span>
            )}
            {counts.error > 0 && (
              <span className={`rounded-btn px-2.5 py-1 text-sm font-semibold ${VERDICT_STYLE.error}`}>
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
                  <th scope="col" className="px-3 py-2 font-semibold">Line</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Year</th>
                  <th scope="col" className="px-3 py-2 font-semibold">ID</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Born</th>
                  <th scope="col" className="px-3 py-2 font-semibold">What happens</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{r.line}</td>
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
                      {readDate(r.date_of_birth).value ?? (r.date_of_birth || '—')}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-btn px-2 py-0.5 text-xs font-semibold ${VERDICT_STYLE[r.verdict.status]}`}>
                        {VERDICT_LABEL[r.verdict.status]}
                      </span>
                      {r.verdict.status !== 'ready' && (
                        <span className="ml-2 text-muted-foreground">
                          {r.verdict.reason}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={counts.ready === 0 || importer.isPending}
              onClick={() => importer.mutate()}
              className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {importer.isPending
                ? 'Adding…'
                : `Add ${counts.ready} student${counts.ready === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={startOver}
              className="rounded-btn border border-border px-4 py-2.5 font-semibold text-foreground hover:bg-background"
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

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/school-admin/students"
              className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
            >
              See the roll
            </Link>
            <button
              type="button"
              onClick={startOver}
              className="rounded-btn border border-border px-4 py-2.5 font-semibold text-foreground hover:bg-background"
            >
              Add more
            </button>
          </div>

          <p className="mt-4 max-w-prose text-xs text-muted-foreground">
            Adding a child creates the record. It does not assign a teacher or
            connect a family — those are separate on purpose, because an
            assignment is what actually grants access to a record. Use Directory
            &amp; Access for both.
          </p>
        </section>
      )}
    </div>
  )
}
