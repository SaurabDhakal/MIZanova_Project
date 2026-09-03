import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAllHomeObservations,
  fetchRecentLogs,
  fetchStudents,
  queryKeys,
  type StudentRow,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { pathForRole } from '../../lib/roles'
import { EmptyState, ErrorState } from '../../components/QueryState'
import Avatar from '../../components/Avatar'
import Icon from '../../components/Icon'
import EducatorSchoolContext from '../../components/EducatorSchoolContext'

/**
 * Student roster — docs/Figma Pages Design/Student Roster Table.png.
 *
 * Unlike the dashboard cards, this table shows FULL names. Staff assigned to a
 * student are entitled to know who they are; the abbreviated form exists to
 * protect against a screen glanced at from across a room, and against parents
 * seeing other families' surnames. Using it here would just make a teacher's
 * own roster useless to them.
 *
 * The Figma frame shows only happy-path rows. Loading, error, empty and
 * no-search-results are added here because all four happen in a real classroom.
 */
export default function StudentRoster() {
  const [search, setSearch] = useState('')
  const [yearLevel, setYearLevel] = useState('')
  const [attention, setAttention] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'year' | 'activity' | 'attention'>(
    'name',
  )
  const { profile } = useAuth()

  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })

  /**
   * Shared with school admins, so the words have to follow whoever is reading.
   *
   * "Everyone currently assigned to you" is true for a teacher and false for
   * an administrator: `fetchStudents` is the same call, and RLS returns a
   * teacher their assignments and an admin their whole school. Same request,
   * different answers — and a page that describes the wrong one is lying about
   * scope on a screen full of children's names.
   */
  const isSchoolAdmin = profile?.role === 'school_admin'
  const basePath = profile ? pathForRole(profile.role) : '/educator'

  /**
   * The signal columns.
   *
   * BOUNDED BY THE FETCH, and the heading says "recent" because of it. 200 is
   * generous for a class and finite for a school; counting every log a child
   * has ever had needs a database aggregate, not a bigger page of rows. What it
   * must never do is print an absolute-sounding total it did not measure.
   */
  const logs = useQuery({
    queryKey: queryKeys.recentLogs,
    queryFn: () => fetchRecentLogs(200),
  })
  const homeNotes = useQuery({
    queryKey: queryKeys.allHomeObservations,
    queryFn: fetchAllHomeObservations,
  })

  const logsByStudent = new Map<string, number>()
  const flagsByStudent = new Map<string, number>()
  for (const log of logs.data ?? []) {
    logsByStudent.set(log.student_id, (logsByStudent.get(log.student_id) ?? 0) + 1)
    // OPEN flags only — a flag an administrator has already acknowledged is
    // history, not something waiting for this teacher.
    if (log.is_risk_flagged && log.safeguarding_acknowledged_at === null) {
      flagsByStudent.set(
        log.student_id,
        (flagsByStudent.get(log.student_id) ?? 0) + 1,
      )
    }
  }

  const homeByStudent = new Map<string, number>()
  for (const note of homeNotes.data ?? []) {
    homeByStudent.set(
      note.student_id,
      (homeByStudent.get(note.student_id) ?? 0) + 1,
    )
  }

  const term = search.trim().toLowerCase()
  const yearLevels = Array.from(
    new Set(
      (students.data ?? [])
        .map((student) => student.year_level)
        .filter((year): year is string => Boolean(year)),
    ),
  ).sort((a, b) => a.localeCompare(b, 'en-AU', { numeric: true }))

  const nameOf = (student: StudentRow) =>
    `${student.last_name} ${student.first_name}`

  const visible = (students.data ?? [])
    .filter((student) => {
      const matchesTerm =
        term === '' ||
        `${student.first_name} ${student.last_name} ${student.external_ref ?? ''}`
          .toLowerCase()
          .includes(term)
      const matchesYear = yearLevel === '' || student.year_level === yearLevel
      const matchesAttention =
        attention === '' ||
        (attention === 'flagged' && (flagsByStudent.get(student.id) ?? 0) > 0) ||
        (attention === 'home' && (homeByStudent.get(student.id) ?? 0) > 0)
      return matchesTerm && matchesYear && matchesAttention
    })
    .sort((a, b) => {
      const byName = nameOf(a).localeCompare(nameOf(b), 'en-AU')
      if (sortBy === 'year') {
        return (
          (a.year_level ?? '').localeCompare(b.year_level ?? '', 'en-AU', {
            numeric: true,
          }) || byName
        )
      }
      if (sortBy === 'activity') {
        return (
          (logsByStudent.get(b.id) ?? 0) - (logsByStudent.get(a.id) ?? 0) ||
          byName
        )
      }
      if (sortBy === 'attention') {
        return (
          (flagsByStudent.get(b.id) ?? 0) -
            (flagsByStudent.get(a.id) ?? 0) ||
          (homeByStudent.get(b.id) ?? 0) -
            (homeByStudent.get(a.id) ?? 0) ||
          byName
        )
      }
      return byName
    })

  const openFlagCount = Array.from(flagsByStudent.values()).reduce(
    (total, count) => total + count,
    0,
  )
  const homeNoteCount = Array.from(homeByStudent.values()).reduce(
    (total, count) => total + count,
    0,
  )

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-title text-foreground">Students</h1>
          <p className="mt-1 max-w-prose text-muted-foreground">
            {isSchoolAdmin
              ? 'Every active student at your school. Opening a record is logged and visible to Special Miles — including yours.'
              : 'Everyone currently assigned to you.'}
          </p>
          <EducatorSchoolContext />
        </div>
        {(isSchoolAdmin || profile?.role === 'educator') && (
          <Link
            to={
              isSchoolAdmin
                ? '/school-admin/students/add'
                : '/educator/students/add'
            }
            className="shrink-0 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:brightness-110"
          >
            Add student
          </Link>
        )}
      </header>

      {students.isError && (
        <ErrorState
          message={students.error.message}
          onRetry={() => void students.refetch()}
        />
      )}

      {students.isPending && (
        <div
          role="status"
          aria-label="Loading students"
          className="h-48 animate-pulse rounded-card border border-border bg-card shadow-raised"
        />
      )}

      {students.isSuccess && students.data.length === 0 && (
        <EmptyState
          title="No students assigned to you yet"
          detail="Add a student you currently teach, or ask a school administrator to assign an existing student to you."
        />
      )}

      {students.isSuccess && students.data.length > 0 && (
        <>
          <dl className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-card border border-border bg-card p-4 shadow-raised">
              <dt className="text-sm text-muted-foreground">Assigned students</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {students.data.length}
              </dd>
            </div>
            <div className="rounded-card border border-border bg-card p-4 shadow-raised">
              <dt className="text-sm text-muted-foreground">Year levels</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {yearLevels.length}
              </dd>
            </div>
            {/*
              AN EM-DASH WHEN THE QUERY FAILED, NOT A ZERO.

              Both figures are counted from a separate query, and this strip
              renders as soon as `students` succeeds — so either could fail on
              its own and reduce to nothing. "Open flags: 0" then tells a
              teacher that no child in their class has an unacknowledged
              safeguarding flag, which is the single worst thing on this screen
              to be wrong about. "Notes from home: 0" tells them no family has
              written anything, on the strip that exists precisely so a family's
              writing gets read rather than sitting unopened.

              StatTile already draws this distinction on the platform admin
              screens; this strip is hand-rolled and never got it.
            */}
            <div className="rounded-card border border-border bg-card p-4 shadow-raised">
              <dt className="text-sm text-muted-foreground">Open flags</dt>
              <dd
                className={`mt-1 text-2xl font-semibold ${logs.isError ? 'text-muted-foreground' : 'text-danger-foreground'}`}
                title={logs.isError ? 'Not known — this could not be loaded' : undefined}
              >
                {logs.isError ? '—' : openFlagCount}
              </dd>
            </div>
            <div className="rounded-card border border-border bg-card p-4 shadow-raised">
              <dt className="text-sm text-muted-foreground">Notes from home</dt>
              <dd
                className={`mt-1 text-2xl font-semibold ${homeNotes.isError ? 'text-muted-foreground' : 'text-success-foreground'}`}
                title={homeNotes.isError ? 'Not known — this could not be loaded' : undefined}
              >
                {homeNotes.isError ? '—' : homeNoteCount}
              </dd>
            </div>
          </dl>

          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label htmlFor="student-search" className="sr-only">
              Search students
            </label>
            <input
              id="student-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or student ID…"
              className="w-full max-w-sm rounded-btn border border-border bg-card px-3 py-2.5 text-foreground placeholder:text-muted-foreground"
            />

            <label className="text-sm font-medium text-muted-foreground">
              Year
              <select
                value={yearLevel}
                onChange={(event) => setYearLevel(event.target.value)}
                className="mt-1 block rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
              >
                <option value="">All years</option>
                {yearLevels.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-muted-foreground">
              Signal
              <select
                value={attention}
                onChange={(event) => setAttention(event.target.value)}
                className="mt-1 block rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
              >
                <option value="">All students</option>
                <option value="flagged">Open safeguarding flag</option>
                <option value="home">Shared from home</option>
              </select>
            </label>

            <label className="text-sm font-medium text-muted-foreground">
              Sort by
              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(
                    event.target.value as
                      | 'name'
                      | 'year'
                      | 'activity'
                      | 'attention',
                  )
                }
                className="mt-1 block rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
              >
                <option value="name">Student name</option>
                <option value="year">Year level</option>
                <option value="activity">Most activity</option>
                <option value="attention">Needs attention</option>
              </select>
            </label>

            {(search || yearLevel || attention || sortBy !== 'name') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setYearLevel('')
                  setAttention('')
                  setSortBy('name')
                }}
                className="rounded-btn border border-border px-3 py-2.5 text-sm font-semibold hover:bg-background"
              >
                Clear filters
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              title="No matches"
              detail="No assigned students match the current search and filters."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border bg-card shadow-raised">
              <table className="w-full text-left">
                <caption className="sr-only">
                  Students assigned to you, with year level and student ID
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="px-5 py-3 text-sm font-semibold">
                      Student
                    </th>
                    <th scope="col" className="px-5 py-3 text-sm font-semibold">
                      Year
                    </th>
                    <th scope="col" className="px-5 py-3 text-sm font-semibold">
                      Recent activity
                    </th>
                    <th scope="col" className="px-5 py-3 text-sm font-semibold">
                      Waiting
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((student) => {
                    const logCount = logsByStudent.get(student.id) ?? 0
                    const fromHome = homeByStudent.get(student.id) ?? 0
                    const flags = flagsByStudent.get(student.id) ?? 0
                    return (
                      <tr
                        key={student.id}
                        className="border-b border-border last:border-0 hover:bg-background"
                      >
                        {/* THE NAME AND WHAT A PARENT SEES ARE ONE CELL NOW.
                            "Shown to parents as" was a whole column carrying a
                            derived nickname at the same visual weight as the
                            child's actual name. It is still here, because a
                            teacher should be able to see exactly what a family
                            sees — just not as a peer of the name. */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar
                              id={student.id}
                              name={`${student.first_name} ${student.last_name}`}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <Link
                                to={`${basePath}/students/${student.id}`}
                                className="block truncate font-medium text-primary hover:underline"
                              >
                                {student.first_name} {student.last_name}
                              </Link>
                              <p className="truncate text-xs text-muted-foreground">
                                {student.display_name}
                                {student.external_ref &&
                                  ` · #${student.external_ref}`}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-3 text-muted-foreground">
                          {student.year_level ?? '—'}
                        </td>

                        <td className="px-5 py-3 text-sm text-muted-foreground">
                          {logCount === 0
                            ? 'No logs yet'
                            : `${logCount} log${logCount === 1 ? '' : 's'}`}
                        </td>

                        {/* THE COLUMN THAT MAKES THIS A WORKING SCREEN rather
                            than a directory. Four columns of reference data
                            told a teacher nothing about which child to open. */}
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {flags > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-btn bg-danger-subtle px-2 py-0.5 text-xs font-semibold text-danger-foreground">
                                <Icon name="safeguarding" className="h-3.5 w-3.5" />
                                {flags} flagged
                              </span>
                            )}
                            {fromHome > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-btn bg-success-subtle px-2 py-0.5 text-xs font-semibold text-success-foreground">
                                <Icon name="home" className="h-3.5 w-3.5" />
                                {fromHome} from home
                              </span>
                            )}
                            {flags === 0 && fromHome === 0 && (
                              <span className="text-sm text-muted-foreground">
                                —
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-sm text-muted-foreground">
            Showing {visible.length} of {students.data.length} students
          </p>
        </>
      )}
    </div>
  )
}
