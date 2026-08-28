import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteLibraryFile,
  fetchLibraryFiles,
  libraryFileUrl,
  LIBRARY_MAX_BYTES,
  queryKeys,
  uploadLibraryFile,
} from '../lib/api'
import { ErrorState, LoadingCards } from './QueryState'
import { showToast } from '../lib/toast'

/**
 * Special Miles' own downloads — db/080.
 *
 * ---------------------------------------------------------------------------
 * A SEPARATE BUCKET FROM A SCHOOL'S FILES, AND THE COMMENT IS THE FEATURE
 * ---------------------------------------------------------------------------
 * db/080's bucket is readable by EVERY signed-in account, because it holds
 * material written for publication — course toolkits, article images,
 * downloads. db/030's bucket holds practice videos of identifiable children and
 * is scoped to one school.
 *
 * Those are opposite audiences behind similar-looking upload boxes, so the one
 * thing this screen must do is make it obvious which one somebody is filling.
 * The warning below is not decoration: a practice video filed here by mistake
 * is a video shown to every parent at every school, and nothing in the database
 * can catch that.
 */

function bytes(n: number | null) {
  if (n === null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function LibraryFilesSection() {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const files = useQuery({
    queryKey: queryKeys.libraryFiles,
    queryFn: fetchLibraryFiles,
  })

  const upload = useMutation({
    mutationFn: () =>
      uploadLibraryFile({
        title,
        description: description || null,
        file: file!,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.libraryFiles })
      setTitle('')
      setDescription('')
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      setError(null)
      showToast('Uploaded.')
    },
    onError: (e) => setError(e.message),
  })

  const remove = useMutation({
    mutationFn: ({ id, path }: { id: string; path: string | null }) =>
      deleteLibraryFile(id, path),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.libraryFiles })
      showToast('Deleted.')
    },
    onError: (e) => showToast(e.message, 'error'),
  })

  const open = async (path: string) => {
    try {
      const url = await libraryFileUrl(path)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not open it.', 'error')
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">Downloads</h2>
      <p className="mt-1 mb-4 max-w-prose text-sm text-muted-foreground">
        Toolkits, handouts and images that go with what Special Miles publishes.
      </p>

      {/*
        SAID BEFORE THE UPLOAD BOX, NOT AFTER IT. This bucket is readable by
        every signed-in account, and the one beside it holds children's records.
        Nothing in the database can tell a toolkit from a practice video.
      */}
      <p className="mb-4 rounded-card border border-warning bg-warning-subtle px-4 py-3 text-sm text-warning-foreground">
        <strong className="font-semibold">
          Everything here is visible to every account on the platform
        </strong>{' '}
        — every parent, teacher and student at every school. Nothing about a
        child belongs here. A school&rsquo;s own material goes in its Resources
        instead.
      </p>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
        >
          {error}
        </p>
      )}

      <form
        className="mb-6 rounded-card border border-border bg-card shadow-raised p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!file) return setError('Choose a file.')
          if (title.trim() === '')
            return setError('Give it a title — the filename is not a description.')
          setError(null)
          upload.mutate()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="library-title" className="block text-sm font-medium text-foreground">
              Title
            </label>
            <input
              id="library-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Transition planning toolkit"
              className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
            />
          </div>
          <div>
            <label htmlFor="library-desc" className="block text-sm font-medium text-foreground">
              What it is
            </label>
            <input
              id="library-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A one-page handout for families"
              className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
            />
            {/* Read out in place of the file by a screen reader, and printed
                beside the download. "toolkit-v3-FINAL.pdf" is a filename. */}
            <p className="mt-1 text-xs text-muted-foreground">
              Shown to whoever downloads it, and read out instead of the
              filename.
            </p>
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="library-file" className="block text-sm font-medium text-foreground">
            The file
          </label>
          <input
            id="library-file"
            ref={fileInput}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Up to {Math.round(LIBRARY_MAX_BYTES / (1024 * 1024))} MB. PDF,
            image, MP4 or MP3 — the limit and the list are enforced by the
            server, not by this page.
          </p>
        </div>

        <button
          type="submit"
          disabled={upload.isPending}
          className="mt-4 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {upload.isPending ? 'Uploading…' : 'Upload'}
        </button>
      </form>

      {files.isPending ? (
        <LoadingCards count={2} />
      ) : files.isError ? (
        <ErrorState
          message={files.error.message}
          onRetry={() => void files.refetch()}
        />
      ) : files.data.length === 0 ? (
        <p className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">
          Nothing uploaded yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {files.data.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{f.title}</p>
                <p className="text-xs text-muted-foreground">
                  {f.description ? `${f.description} · ` : ''}
                  {f.mime_type ?? 'unknown type'}
                  {f.size_bytes !== null ? ` · ${bytes(f.size_bytes)}` : ''}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                {f.storage_path ? (
                  <button
                    type="button"
                    onClick={() => void open(f.storage_path!)}
                    className="rounded-btn border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground"
                  >
                    Open
                  </button>
                ) : (
                  /* A row with no file. uploadLibraryFile deletes the row when
                     the object fails, so this should not happen — said rather
                     than rendered as a working button that 404s. */
                  <span className="text-xs text-warning-foreground">
                    File missing
                  </span>
                )}
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate({ id: f.id, path: f.storage_path })
                  }
                  className="rounded-btn border border-danger px-3 py-1.5 text-xs font-semibold text-danger-foreground disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
