import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IEP_MAX_BYTES,
  attachIepFile,
  createIepDocument,
  fetchIepDocuments,
  formatBytes,
  iepDownloadUrl,
  queryKeys,
} from '../lib/api'
import { EmptyState, ErrorState, LoadingCards } from './QueryState'
import FormField from './FormField'
import SignedFileLink from './SignedFileLink'
import { showToast } from '../lib/toast'

/**
 * Staff view of a student's IEP documents.
 *
 * Two things this screen is careful about:
 *
 * 1. The file is OPTIONAL. From db/008 until db/034 this table was a register
 *    with nowhere to put a document, and that was still useful — the family
 *    learns the plan exists and can confirm reading it. A school that has not
 *    got the PDF to hand should not be blocked from recording the plan, and
 *    one registered before storage existed can have its file attached later.
 *
 * 2. It shows who has confirmed reading, and when. A school needs to know
 *    whether a family has seen a plan, and the family's own screen is where
 *    that gets recorded. Neither side has to ask the other.
 */

/** For documents registered before there was anywhere to put the file. */
function AttachFile({
  documentId,
  onDone,
}: {
  documentId: string
  onDone: () => void
}) {
  const attach = useMutation({
    mutationFn: (file: File) => attachIepFile(documentId, file),
    onSuccess: () => {
      showToast('File attached.')
      onDone()
    },
    onError: (error) => showToast(error.message),
  })

  return (
    <label className="cursor-pointer rounded-btn border border-border px-3 py-1.5 text-sm font-semibold text-primary">
      {attach.isPending ? 'Attaching…' : 'Attach file'}
      <input
        type="file"
        className="sr-only"
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
        disabled={attach.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) attach.mutate(file)
          e.target.value = ''
        }}
      />
    </label>
  )
}

export default function IepDocumentsSection({
  studentId,
}: {
  studentId: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [documentDate, setDocumentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const documents = useQuery({
    queryKey: queryKeys.iepDocuments(studentId),
    queryFn: () => fetchIepDocuments(studentId),
  })

  const refresh = () =>
    void queryClient.invalidateQueries({
      queryKey: queryKeys.iepDocuments(studentId),
    })

  const create = useMutation({
    mutationFn: () =>
      createIepDocument({ studentId, name, documentDate, notes, file }),
    onSuccess: () => {
      setName('')
      setNotes('')
      setFile(null)
      setOpen(false)
      refresh()
    },
    // The row survives a failed upload, so the list must refresh either way —
    // otherwise the document appears to have vanished along with the file.
    onError: () => refresh(),
  })

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">IEP documents</h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110"
          >
            + Register a document
          </button>
        )}
      </div>

      <p className="mb-3 max-w-prose text-sm text-muted-foreground">
        Recording a document here tells the family it exists and lets them
        confirm they have read it. Attaching the file is optional — without one
        this is still a register, which is what it was before MiZanova could
        hold a document.
      </p>

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
          className="mb-5 space-y-4 rounded-card border border-border bg-card shadow-raised p-5"
        >
          {create.isError && (
            <p
              role="alert"
              className="rounded-btn border border-danger bg-danger-subtle p-3 text-sm font-medium text-danger-foreground"
            >
              {create.error.message}
            </p>
          )}

          <FormField
            label="Document name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Annual IEP Review 2026"
          />

          <FormField
            label="Document date"
            type="date"
            required
            value={documentDate}
            onChange={(e) => setDocumentDate(e.target.value)}
          />

          <div>
            <label
              htmlFor="iep-notes"
              className="block text-sm font-semibold text-foreground"
            >
              Note for the family{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <textarea
              id="iep-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Prepared by the learning support team. We will discuss it at the meeting on the 14th."
              className="mt-1.5 w-full rounded-btn border border-border bg-card p-3 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div>
            <label
              htmlFor="iep-file"
              className="block text-sm font-semibold text-foreground"
            >
              The document{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <input
              id="iep-file"
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, Word or an image, up to {formatBytes(IEP_MAX_BYTES)}. Only
              people already entitled to this student can open it, and the link
              expires two minutes after it is clicked.
              {file && ` Selected: ${formatBytes(file.size)}.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
            >
              {create.isPending
                ? file
                  ? 'Uploading…'
                  : 'Saving…'
                : 'Register document'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-btn border border-border px-4 py-2.5 font-semibold text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {documents.isPending && <LoadingCards count={1} />}
      {documents.isError && (
        <ErrorState
          message={documents.error.message}
          onRetry={() => void documents.refetch()}
        />
      )}

      {documents.isSuccess && documents.data.length === 0 && !open && (
        <EmptyState
          title="No documents registered"
          detail="Register the student's IEP or review document so the family can see it and confirm they have read it."
        />
      )}

      {documents.isSuccess && documents.data.length > 0 && (
        <ul className="space-y-3">
          {documents.data.map((document) => {
            const acks = document.iep_acknowledgements
            return (
              <li
                key={document.id}
                className="rounded-card border border-border bg-card shadow-raised p-4"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {document.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(document.document_date).toLocaleDateString(
                        'en-AU',
                        { day: 'numeric', month: 'long', year: 'numeric' },
                      )}
                    </p>
                    {document.notes && (
                      <p className="mt-1 text-sm text-foreground">
                        {document.notes}
                      </p>
                    )}
                  </div>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {document.storage_path ? (
                      <SignedFileLink
                        path={document.storage_path}
                        getUrl={iepDownloadUrl}
                      />
                    ) : (
                      <AttachFile documentId={document.id} onDone={refresh} />
                    )}

                    <span
                      className={`rounded-btn px-2.5 py-1 text-sm font-semibold ${
                        acks.length > 0
                          ? 'bg-success-subtle text-success-foreground'
                          : 'bg-warning-subtle text-warning-foreground'
                      }`}
                    >
                      {acks.length > 0
                        ? `Read by ${acks.length} guardian${acks.length === 1 ? '' : 's'}`
                        : 'Not yet read'}
                    </span>
                  </div>
                </div>

                {acks.length > 0 && (
                  <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                    Confirmed{' '}
                    {acks
                      .map((a) =>
                        new Date(a.acknowledged_at).toLocaleDateString(
                          'en-AU',
                          { day: 'numeric', month: 'short', year: 'numeric' },
                        ),
                      )
                      .join(', ')}
                    . This is a record of reading, not a signature.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
