import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  RESOURCE_MAX_BYTES,
  acknowledgeResource,
  deleteResource,
  fetchResources,
  fetchStudents,
  formatBytes,
  queryKeys,
  resourceDownloadUrl,
  revokeResourceShare,
  shareResource,
  uploadResource,
  type ResourceCategory,
  type ResourceRow,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import FormField from '../../components/FormField'
import SignedFileLink from '../../components/SignedFileLink'
import ConfirmDestructive from '../../components/ConfirmDestructive'
import { showToast } from '../../lib/toast'

/**
 * Resource & Material Hub — docs/Full and final figma design/Resource Hub.png.
 *
 * The first screen in MiZanova that handles a file rather than a row, and the
 * header of db/030 lists what in the design is deliberately absent: the
 * "HIPAA & FERPA compliant" claim, Import from Drive, automatic 72-hour
 * reminders, "Awaiting Signature", and a curated Resource Spotlight that has
 * nothing in it.
 *
 * WHO SEES WHAT IS NOT DECIDED HERE. A specialist sees what they uploaded; a
 * teacher, a family and a school administrator see what has been shared with a
 * child they are entitled to. Same query, different rows — `can_view_resource()`
 * in db/030 answers it, and the storage policies ask the same function, so a
 * file is reachable exactly when its row is.
 */

const CATEGORIES: { value: ResourceCategory; label: string }[] = [
  { value: 'video', label: 'Video' },
  { value: 'handout', label: 'Handout' },
  { value: 'aac_board', label: 'AAC board' },
  { value: 'other', label: 'Other' },
]

const CATEGORY_LABEL: Record<ResourceCategory, string> = {
  video: 'Video',
  handout: 'Handout',
  aac_board: 'AAC board',
  other: 'Other',
}

export default function Resources() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isSpecialist = profile?.role === 'specialist'
  const isParent = profile?.role === 'parent'

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<ResourceCategory>('handout')
  const [file, setFile] = useState<File | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | ResourceCategory>('all')
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<ResourceRow | null>(null)

  const resources = useQuery({
    queryKey: queryKeys.resources,
    queryFn: fetchResources,
  })

  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
    enabled: isSpecialist,
  })

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.resources })

  const upload = useMutation({
    mutationFn: () =>
      uploadResource({
        schoolId: profile!.school_id!,
        ownerId: profile!.id,
        title,
        description: description.trim() || null,
        category,
        file: file!,
      }),
    onSuccess: () => {
      setOpen(false)
      setTitle('')
      setDescription('')
      setFile(null)
      refresh()
      showToast('Resource uploaded.')
    },
  })

  const share = useMutation({
    mutationFn: (input: { resourceId: string; studentId: string }) =>
      shareResource(input.resourceId, input.studentId, profile!.id),
    onSuccess: () => {
      refresh()
      showToast('Shared. The family and the assigned teacher can see it now.')
    },
  })

  const revoke = useMutation({
    mutationFn: (shareId: string) => revokeResourceShare(shareId),
    onSuccess: () => {
      refresh()
      showToast('Access revoked.')
    },
  })

  const confirmRead = useMutation({
    mutationFn: (shareId: string) => acknowledgeResource(shareId, profile!.id),
    onSuccess: () => {
      refresh()
      showToast('Thank you — recorded as read.')
    },
  })

  const remove = useMutation({
    mutationFn: (resource: ResourceRow) => deleteResource(resource),
    onSuccess: () => {
      refresh()
      setDeleting(null)
      showToast('Resource deleted.')
    },
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return setFormError('Choose a file to upload.')
    if (title.trim() === '') return setFormError('Give the resource a name.')
    if (!profile?.school_id) {
      return setFormError(
        'Your account is not linked to a school, so there is nowhere to file this. Ask an administrator.',
      )
    }
    setFormError(null)
    upload.mutate()
  }

  if (resources.isPending) return <LoadingCards count={3} />
  if (resources.isError) {
    return (
      <ErrorState
        message={resources.error.message}
        onRetry={() => void resources.refetch()}
      />
    )
  }

  const all = resources.data
  const visible = all.filter((r) => {
    if (filter !== 'all' && r.category !== filter) return false
    if (search.trim() === '') return true
    const needle = search.toLowerCase()
    return (
      r.title.toLowerCase().includes(needle) ||
      (r.description ?? '').toLowerCase().includes(needle) ||
      r.resource_shares.some((s) =>
        `${s.students?.first_name ?? ''} ${s.students?.last_name ?? ''}`
          .toLowerCase()
          .includes(needle),
      )
    )
  })

  // Only what this person can see, which for a specialist is their own library.
  const usedBytes = all.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0)

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-title text-foreground">Resources</h1>
          <p className="mt-1 max-w-prose text-muted-foreground">
            {isSpecialist
              ? 'Materials you have uploaded, and the children they have been shared with.'
              : isParent
                ? 'Practice materials your child’s specialist has shared with you. Open one at any time — there is no deadline and nothing expires.'
                : 'Materials a specialist has shared for children you are involved with.'}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-4">
          {/* Storage used is the uploader's concern. A family has no quota and
              no way to act on the number, so it is not shown to them. */}
          {isSpecialist && (
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">
                {formatBytes(usedBytes)}
              </p>
              <p className="text-xs text-muted-foreground">
                across {all.length} file{all.length === 1 ? '' : 's'}
              </p>
            </div>
          )}
          {isSpecialist && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-btn bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {open ? 'Cancel' : '+ Upload'}
            </button>
          )}
        </div>
      </header>

      {open && (
        <form
          onSubmit={submit}
          className="mb-6 rounded-card border border-border bg-card shadow-raised p-6"
          noValidate
        >
          {(formError || upload.isError) && (
            <p
              role="alert"
              className="mb-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
            >
              {formError ?? upload.error?.message}
            </p>
          )}

          <FormField
            label="Name"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Articulation practice — R sounds"
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="resource-category"
                className="block text-sm font-semibold text-foreground"
              >
                Type
              </label>
              <select
                id="resource-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ResourceCategory)}
                className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="resource-file"
                className="block text-sm font-semibold text-foreground"
              >
                File
              </label>
              <input
                id="resource-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.mp4,.mov,.mp3,.m4a"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                PDF, image, MP4 or audio, up to {formatBytes(RESOURCE_MAX_BYTES)}.
                {file && ` Selected: ${formatBytes(file.size)}.`}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label
              htmlFor="resource-description"
              className="block text-sm font-semibold text-foreground"
            >
              What it is for
            </label>
            <textarea
              id="resource-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5 w-full rounded-btn border border-border bg-card p-3 text-foreground"
              placeholder="Practise twice daily, five minutes."
            />
          </div>

          <p className="mt-4 max-w-prose text-xs text-muted-foreground">
            Nothing here is scanned, redacted or checked for identifying detail.
            What you upload is exactly what the people you share it with will
            see, so treat a video of a child as you would anywhere else.
          </p>

          <button
            type="submit"
            disabled={upload.isPending}
            className="mt-5 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </form>
      )}

      {/* --- filters ------------------------------------------------------- */}
      {all.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {(['all', ...CATEGORIES.map((c) => c.value)] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-btn border px-3 py-1.5 text-sm font-semibold ${
                  filter === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {value === 'all' ? 'All files' : CATEGORY_LABEL[value]}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search resources"
            placeholder="Search by name or child…"
            className="ml-auto w-full max-w-xs rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
          />
        </div>
      )}

      {all.length === 0 ? (
        <EmptyState
          title="No resources yet"
          detail={
            isSpecialist
              ? 'Upload a practice video, a handout or a communication board, then share it with the children it is for.'
              : isParent
                ? 'Your child’s specialist has not shared any materials yet. You will not be notified when they do, so it is worth checking back.'
                : 'Nothing has been shared for the children you are involved with.'
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          detail="No resource matches that filter or search."
        />
      ) : (
        <ul className="space-y-4">
          {visible.map((resource) => (
            <li
              key={resource.id}
              className="rounded-card border border-border bg-card shadow-raised p-5"
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-foreground">
                      {resource.title}
                    </h2>
                    <span className="rounded-btn bg-accent-subtle px-2 py-0.5 text-xs font-semibold text-accent-foreground uppercase">
                      {CATEGORY_LABEL[resource.category]}
                    </span>
                  </div>
                  {resource.description && (
                    <p className="mt-1 text-sm text-foreground">
                      {resource.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(resource.created_at).toLocaleDateString('en-AU', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    {resource.size_bytes !== null &&
                      ` · ${formatBytes(resource.size_bytes)}`}
                  </p>
                </div>

                <div className="ml-auto flex flex-wrap gap-2">
                  {resource.storage_path && (
                    <SignedFileLink
                      path={resource.storage_path}
                      getUrl={resourceDownloadUrl}
                    />
                  )}
                  {isSpecialist && resource.owner_id === profile?.id && (
                    <button
                      type="button"
                      onClick={() => {
                        remove.reset()
                        setDeleting(resource)
                      }}
                      disabled={remove.isPending}
                      className="rounded-btn border border-danger px-3 py-1.5 text-sm font-semibold text-danger-foreground disabled:opacity-60"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* --- who it is shared with ---------------------------------- */}
              <div className="mt-4 border-t border-border pt-3">
                {resource.resource_shares.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Not shared with anyone yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {resource.resource_shares.map((s) => {
                      const mine = s.resource_acknowledgements.some(
                        (a) => a.profile_id === profile?.id,
                      )
                      const readers = s.resource_acknowledgements.length
                      return (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-center gap-3 text-sm"
                        >
                          <span className="font-medium text-foreground">
                            {s.students
                              ? `${s.students.first_name} ${s.students.last_name}`
                              : 'A student you cannot see'}
                          </span>

                          {/* A COUNT IS THE WRONG WORD FOR A FAMILY. db/033
                              scopes acknowledgements to shares you may see, so
                              the number a parent sees is their own household —
                              "confirmed as read by 1" reads like a statistic
                              about other people when it means "by you". */}
                          <span
                            className={`rounded-btn px-2 py-0.5 text-xs font-semibold ${
                              (isParent ? mine : readers > 0)
                                ? 'bg-success-subtle text-success-foreground'
                                : 'bg-warning-subtle text-warning-foreground'
                            }`}
                          >
                            {isParent
                              ? mine
                                ? 'You have confirmed this'
                                : 'You have not confirmed this'
                              : readers > 0
                                ? `Confirmed as read by ${readers}`
                                : 'Not confirmed as read'}
                          </span>

                          {!isSpecialist && !mine && (
                            <button
                              type="button"
                              onClick={() => confirmRead.mutate(s.id)}
                              disabled={confirmRead.isPending}
                              className="rounded-btn bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                            >
                              I have read this
                            </button>
                          )}

                          {isSpecialist && resource.owner_id === profile?.id && (
                            <button
                              type="button"
                              onClick={() => revoke.mutate(s.id)}
                              disabled={revoke.isPending}
                              className="ml-auto text-xs font-semibold text-danger-foreground underline disabled:opacity-60"
                            >
                              Revoke access
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}

                {isSpecialist && resource.owner_id === profile?.id && (
                  <div className="mt-3">
                    <label
                      htmlFor={`share-${resource.id}`}
                      className="sr-only"
                    >
                      Share {resource.title} with a child
                    </label>
                    <select
                      id={`share-${resource.id}`}
                      value=""
                      disabled={share.isPending}
                      onChange={(e) => {
                        if (!e.target.value) return
                        share.mutate({
                          resourceId: resource.id,
                          studentId: e.target.value,
                        })
                      }}
                      className="rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
                    >
                      <option value="">Share with a child…</option>
                      {(students.data ?? [])
                        .filter(
                          (student) =>
                            !resource.resource_shares.some(
                              (s) => s.student_id === student.id,
                            ),
                        )
                        .map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.first_name} {student.last_name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* A delete that failed while the dialog is open reports itself there,
          beside the button that caused it. Showing it twice would read as two
          separate faults. */}
      {(share.isError ||
        revoke.isError ||
        (remove.isError && deleting === null) ||
        confirmRead.isError) && (
        <p role="alert" className="mt-4 text-sm text-danger-foreground">
          {(share.error ?? revoke.error ?? remove.error ?? confirmRead.error)?.message}
        </p>
      )}

      {deleting && (
        <ConfirmDestructive
          title={`Delete “${deleting.title}”?`}
          detail="The file itself is removed from storage, not just hidden from this list."
          consequences={[
            deleting.resource_shares.length === 0
              ? 'It is not shared with anybody.'
              : `${deleting.resource_shares.length} ${deleting.resource_shares.length === 1 ? 'family loses' : 'families lose'} access to it immediately.`,
            'This cannot be undone. You would have to upload the file again.',
          ]}
          confirmLabel="Delete resource"
          pending={remove.isPending}
          error={remove.error?.message ?? null}
          onConfirm={() => remove.mutate(deleting)}
          onCancel={() => {
            remove.reset()
            setDeleting(null)
          }}
        />
      )}

      <section className="mt-8 rounded-card border border-border bg-background p-6">
        <h2 className="font-semibold text-foreground">
          {isParent ? 'Two things to know' : 'Not built yet'}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {isParent ? (
            <>
              <strong>Nobody will remind you.</strong> MiZanova does not send
              email, so a new material will not reach your inbox — it appears
              here and nowhere else. And confirming you have read something is
              a note to your child’s specialist, not a signature or an
              agreement to anything.
            </>
          ) : (
            <>
              The design promises that shared materials are automatically
              sanitised of restricted health information, and that reminders go
              out every 72 hours to anyone who has not opened one. Neither
              exists: nothing is scanned or redacted, and there is no email in
              this product to send a reminder with. Both are stated here rather
              than implied on screen, because a clinician who believes the
              platform is handling it uploads something they would otherwise
              think twice about.
            </>
          )}
        </p>
      </section>
    </div>
  )
}
