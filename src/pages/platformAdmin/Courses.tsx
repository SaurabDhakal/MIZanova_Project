import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addCourseModule,
  createCourse,
  deleteCourseModule,
  fetchCourses,
  queryKeys,
  setCoursePublished,
  type Course,
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
                disabled={remove.isPending || course.is_published}
                onClick={() => remove.mutate(m.id)}
                title={
                  course.is_published
                    ? 'Withdraw the course first — somebody may be part-way through it.'
                    : undefined
                }
                className="ml-auto text-xs font-semibold text-danger-foreground disabled:opacity-40"
              >
                Remove
              </button>
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
