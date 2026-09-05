import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addCourseModule,
  createCourse,
  deleteCourseModule,
  updateCourseModule,
  fetchCourseEngagement,
  fetchCourses,
  queryKeys,
  setCoursePublished,
  type Course,
  type CourseEngagement,
} from '../../lib/api'
import { ROLE_CONFIG, ROLES, type Role } from '../../lib/roles'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import PageHeader, { PageNote } from '../../components/PageHeader'
import { showToast } from '../../lib/toast'

/**
 * Writing the Academy — db/075, the CMS half of the brief's requirement 4.
 *
 * ---------------------------------------------------------------------------
 * DRAFT UNTIL SOMEBODY SAYS OTHERWISE
 * ---------------------------------------------------------------------------
 * A course is invisible to its audience until it is published, and the button
 * that publishes it is the only irreversible-feeling thing on this screen —
 * withdrawing one afterwards is possible, but a family who already read it has
 * read it. That is the shape db/020 set for invoices and the same reasoning
 * applies: anything with an audience gets a state where mistakes are free.
 *
 * ---------------------------------------------------------------------------
 * THE AUDIENCE IS A ROLE, AND CHOOSING NONE IS REFUSED
 * ---------------------------------------------------------------------------
 * db/075 checks `array_length(audiences, 1) >= 1`, because a course for nobody
 * is a mistake rather than an intention. The form refuses it before the
 * database has to, so the message is about the course rather than about a
 * constraint.
 *
 * Platform admin is offered as an audience deliberately: Special Miles staff
 * onboarding is a real use, and leaving it out would mean the only way to write
 * a course for your own team is to pretend it is for somebody else.
 */

const AUDIENCE_CHOICES: Role[] = ROLES.filter((r) => r !== 'platform_admin')

function NewCourseForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [audiences, setAudiences] = useState<Role[]>([])
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => createCourse({ title, summary, audiences }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.courses })
      showToast('Created as a draft. Add its modules, then publish.')
      onDone()
    },
    onError: (e) => setError(e.message),
  })

  const toggle = (role: Role) =>
    setAudiences((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    )

  return (
    <form
      className="mb-6 rounded-card border border-border bg-card shadow-raised p-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim() === '') return setError('Give the course a title.')
        if (summary.trim() === '')
          return setError('Say what it is for — this is what people read first.')
        if (audiences.length === 0)
          return setError('Choose at least one audience, or nobody can see it.')
        setError(null)
        create.mutate()
      }}
    >
      <h2 className="font-semibold text-foreground">A new course</h2>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-btn border border-danger bg-danger-subtle p-2.5 text-sm text-danger-foreground"
        >
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-4">
        <div>
          <label htmlFor="course-title" className="block text-sm font-medium text-foreground">
            Title
          </label>
          <input
            id="course-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Empowered Parenting"
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          />
        </div>

        <div>
          <label htmlFor="course-summary" className="block text-sm font-medium text-foreground">
            What it is for
          </label>
          <textarea
            id="course-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder="Practical strategies for supporting regulation at home."
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Shown in the list, so it has to make sense to somebody deciding
            whether to spend an hour on it.
          </p>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-foreground">Who it is for</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {AUDIENCE_CHOICES.map((role) => (
              <label
                key={role}
                className={`cursor-pointer rounded-btn border px-3 py-1.5 text-sm font-medium ${
                  audiences.includes(role)
                    ? 'border-primary bg-primary-subtle text-primary'
                    : 'border-border bg-card text-muted-foreground'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={audiences.includes(role)}
                  onChange={() => toggle(role)}
                />
                {ROLE_CONFIG[role].label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {create.isPending ? 'Creating…' : 'Create as draft'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function ModuleEditor({ course }: { course: Course }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  /*
   * CORRECTING A MODULE, WHICH IS NOT THE SAME AS REPLACING ONE.
   *
   * Deletion cascades to `module_completions`, so the only previous way to fix
   * a typo took everybody's progress with it. Editing keeps the id, so it is
   * offered on a published course where deletion is not.
   */
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editVideo, setEditVideo] = useState('')

  const modules = course.course_modules ?? []

  const add = useMutation({
    mutationFn: () =>
      addCourseModule(
        course.id,
        title,
        body,
        videoUrl || null,
        // Appended. Reordering is a separate job with its own interface; a
        // number typed by hand is how two modules end up both called 3.
        (modules.at(-1)?.sort_order ?? 0) + 1,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.courses })
      setTitle('')
      setBody('')
      setVideoUrl('')
      setError(null)
    },
    onError: (e) => setError(e.message),
  })

  const save = useMutation({
    mutationFn: () =>
      updateCourseModule(editing!, {
        title: editTitle,
        body: editBody,
        videoUrl: editVideo || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.courses })
      setEditing(null)
      setError(null)
      showToast('Module updated.')
    },
    onError: (e) => setError(e.message),
  })

  const remove = useMutation({
    mutationFn: deleteCourseModule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.courses })
      showToast('Module removed.')
    },
    onError: (e) => showToast(e.message, 'error'),
  })

  return (
    <div className="mt-4 border-t border-border pt-4">
      {modules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No modules yet. A course with none cannot be started, so it stays
          unpublishable until it has at least one.
        </p>
      ) : (
        <ol className="space-y-2">
          {modules.map((m, i) => (
            <li
              key={m.id}
              className="flex flex-wrap items-baseline gap-2 rounded-btn border border-border px-3 py-2 text-sm"
            >
              <span className="text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <span className="font-medium text-foreground">{m.title}</span>
              {m.video_url && (
                <span className="text-xs text-muted-foreground">video</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditing(m.id)
                  setEditTitle(m.title)
                  setEditBody(m.body ?? '')
                  setEditVideo(m.video_url ?? '')
                  setError(null)
                }}
                className="ml-auto text-xs font-semibold text-primary"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={remove.isPending || course.is_published}
                onClick={() => remove.mutate(m.id)}
                title={
                  course.is_published
                    ? 'Withdraw the course first — somebody may be part-way through it.'
                    : undefined
                }
                className="text-xs font-semibold text-danger-foreground disabled:opacity-40"
              >
                Remove
              </button>

              {editing === m.id && (
                <form
                  className="mt-2 w-full space-y-2 border-t border-border pt-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (editTitle.trim() === '')
                      return setError('A module needs a title.')
                    save.mutate()
                  }}
                >
                  <input
                    aria-label="Module title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                  />
                  <textarea
                    aria-label="Module text"
                    rows={3}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                  />
                  <input
                    aria-label="Video link"
                    value={editVideo}
                    onChange={(e) => setEditVideo(e.target.value)}
                    placeholder="Video link (optional)"
                    className="w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    {/* Said because deletion right beside it is not. */}
                    Safe on a published course — the module keeps its identity,
                    so nobody&rsquo;s progress changes.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={save.isPending}
                      className="rounded-btn bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {save.isPending ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-btn border border-border px-3 py-1.5 text-xs font-semibold text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ol>
      )}

      {/*
        MODULES ARE ADDED WHILE IT IS A DRAFT. Adding one to a published course
        would silently un-finish everybody who had completed it — db/075's
        trigger compares completions against the module count, so a new module
        makes a finished enrolment incomplete again. Withdrawing first makes
        that a deliberate act.
      */}
      {course.is_published ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Withdraw the course to change its modules. Adding one now would
          un-finish everybody who has already completed it.
        </p>
      ) : (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim() === '') return setError('Give the module a title.')
            setError(null)
            add.mutate()
          }}
        >
          {error && (
            <p role="alert" className="text-sm text-danger-foreground">
              {error}
            </p>
          )}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Module title"
            aria-label="Module title"
            className="w-full rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="What this module covers. Plain text — no formatting."
            aria-label="Module text"
            className="w-full rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
          />
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://… (optional video)"
            aria-label="Video link"
            className="w-full rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
          />
          <button
            type="submit"
            disabled={add.isPending}
            className="justify-self-start rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
          >
            {add.isPending ? 'Adding…' : 'Add module'}
          </button>
        </form>
      )}
    </div>
  )
}

/**
 * Who is doing them — db/091, the brief's requirement 5.
 *
 * ---------------------------------------------------------------------------
 * ON THIS SCREEN RATHER THAN ITS OWN
 * ---------------------------------------------------------------------------
 * The question "is anybody doing this?" is only useful next to the thing that
 * answers it — the course, and the buttons that publish or change it. A
 * separate Analytics page is one more screen somebody has to remember to open,
 * and the decision it informs (write more of this, retire that) is made here.
 *
 * ---------------------------------------------------------------------------
 * NO NAMES, DELIBERATELY
 * ---------------------------------------------------------------------------
 * The view could name people — a platform admin may already read every
 * enrolment row. It does not, because most of the people counted here are
 * teachers doing professional development, and a company they do not work for
 * does not need to know which of them is behind. The reasoning is in db/091.
 */
function Engagement() {
  const rows = useQuery({
    queryKey: queryKeys.courseEngagement,
    queryFn: fetchCourseEngagement,
  })

  function exportCsv(data: CourseEngagement[]) {
    const esc = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`
    const csv = [
      ['Course', 'State', 'Audiences', 'Modules', 'Enrolled', 'Finished', 'Finished %'].join(','),
      ...data.map((r) =>
        [
          r.title,
          r.is_published ? 'Published' : 'Draft',
          r.audiences.map((a) => ROLE_CONFIG[a].label).join(' / '),
          r.modules,
          r.enrolments,
          r.completed,
          r.enrolments === 0 ? '' : Math.round((r.completed / r.enrolments) * 100),
        ]
          .map(esc)
          .join(','),
      ),
    ].join('\n')

    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `mizanova-course-engagement-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    /* Every course, every time — there is no filter and no cap on this screen,
       so unlike the audit export there is nothing to warn about. */
    showToast(`Exported all ${data.length} courses.`)
  }

  /* A FAILED COUNT IS NOT A ZERO. "Nobody has started this" and "we could not
     ask" look identical as a 0, and only one of them is a reason to rewrite a
     course. */
  if (rows.isError) {
    return (
      <div className="mb-6">
        <ErrorState
          message="The engagement figures could not be loaded, so they are unknown rather than zero. Nothing about the courses themselves has changed."
          onRetry={() => void rows.refetch()}
        />
      </div>
    )
  }

  if (rows.isPending || rows.data.length === 0) return null

  const anyEnrolments = rows.data.some((r) => r.enrolments > 0)
  const busiest = Math.max(...rows.data.map((r) => r.enrolments), 1)
  const totalEnrolled = rows.data.reduce((n, r) => n + r.enrolments, 0)
  const totalFinished = rows.data.reduce((n, r) => n + r.completed, 0)

  return (
    <section className="mb-7 rounded-card border border-border bg-card p-5 shadow-raised">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h2 className="font-semibold text-foreground">Who is doing them</h2>
        <p className="text-sm text-muted-foreground">
          {totalEnrolled} {totalEnrolled === 1 ? 'enrolment' : 'enrolments'} in
          total, {totalFinished} finished.
        </p>
        <button
          type="button"
          onClick={() => exportCsv(rows.data)}
          className="ml-auto rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-background"
        >
          Export as CSV
        </button>
      </div>

      {!anyEnrolments ? (
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          Nobody has started any course yet. That is a real answer rather than a
          missing one &mdash; the counting works, and there is nothing to count.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.data.map((r) => {
            const percent =
              r.enrolments === 0
                ? null
                : Math.round((r.completed / r.enrolments) * 100)
            return (
              <li key={r.course_id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {r.title}
                </span>

                {/* Width against the busiest course, so the bars compare with
                    each other rather than against a number nobody chose. */}
                <span
                  aria-hidden="true"
                  className="hidden h-2 w-40 overflow-hidden rounded-full bg-background sm:block"
                >
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${(r.enrolments / busiest) * 100}%` }}
                  />
                </span>

                <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                  {r.enrolments} enrolled
                  {r.enrolments > 0 && ` · ${r.completed} finished`}
                  {percent !== null && ` · ${percent}%`}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-4 max-w-prose text-xs text-muted-foreground">
        Counts only, never names. Most of the people here are staff doing
        professional development, and whether a course lands is a different
        question from who is behind on one. Note that &ldquo;finished&rdquo; is
        measured against a course&rsquo;s CURRENT modules &mdash; adding one to
        a published course makes finished enrolments unfinished again, so this
        number can fall without anybody dropping out.
      </p>
    </section>
  )
}

export default function Courses() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const courses = useQuery({ queryKey: queryKeys.courses, queryFn: fetchCourses })

  const publish = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      setCoursePublished(id, next),
    onSuccess: async (_d, vars) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.courses })
      showToast(
        vars.next
          ? 'Published. Its audience can see it now.'
          : 'Withdrawn. Nobody new can start it.',
      )
    },
    onError: (e) => showToast(e.message, 'error'),
  })

  if (courses.isPending) return <LoadingCards count={3} />
  if (courses.isError) return <ErrorState message={courses.error.message} />

  return (
    <div>
      <PageHeader
        title="Courses"
        lead="The Academy — what Special Miles publishes, and who it is for."
        actions={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-btn bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            New course
          </button>
        }
      />

      {creating && <NewCourseForm onDone={() => setCreating(false)} />}

      <Engagement />

      {courses.data.length === 0 ? (
        <EmptyState
          title="No courses yet"
          detail="A course is created as a draft, gets its modules, and is published to the audiences you choose."
        />
      ) : (
        <ul className="space-y-4">
          {courses.data.map((course) => (
            <li
              key={course.id}
              className="rounded-card border border-border bg-card shadow-raised p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-foreground">{course.title}</h2>
                    <span
                      className={`rounded-btn px-2 py-0.5 text-xs font-semibold ${
                        course.is_published
                          ? 'bg-success-subtle text-success-foreground'
                          : 'bg-background text-muted-foreground'
                      }`}
                    >
                      {course.is_published ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                    {course.summary}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    For{' '}
                    {course.audiences
                      .map((r) => ROLE_CONFIG[r]?.label ?? r)
                      .join(', ')}{' '}
                    · {(course.course_modules ?? []).length} module
                    {(course.course_modules ?? []).length === 1 ? '' : 's'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(open === course.id ? null : course.id)}
                    className="rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
                  >
                    {open === course.id ? 'Hide modules' : 'Modules'}
                  </button>
                  <button
                    type="button"
                    disabled={
                      publish.isPending ||
                      (!course.is_published &&
                        (course.course_modules ?? []).length === 0)
                    }
                    onClick={() =>
                      publish.mutate({
                        id: course.id,
                        next: !course.is_published,
                      })
                    }
                    title={
                      !course.is_published &&
                      (course.course_modules ?? []).length === 0
                        ? 'Add a module first — there would be nothing to do.'
                        : undefined
                    }
                    className={`rounded-btn px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
                      course.is_published
                        ? 'border border-border bg-card text-foreground'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    {course.is_published ? 'Withdraw' : 'Publish'}
                  </button>
                </div>
              </div>

              {open === course.id && <ModuleEditor course={course} />}
            </li>
          ))}
        </ul>
      )}

      <PageNote>
        A course is a draft until you publish it, and its audience sees nothing
        before then — the same shape invoices use, because anything with an
        audience needs a state where mistakes are free. Modules can only be
        changed while it is a draft: adding one to a published course would
        un-finish everybody who had already completed it, since finishing is
        counted against the number of modules. There are no quizzes, scores or
        certificates. Assessment is a different product decision — a failed
        score attached to an educator is an employment record — and this builds
        nothing that would imply one.
      </PageNote>
    </div>
  )
}
