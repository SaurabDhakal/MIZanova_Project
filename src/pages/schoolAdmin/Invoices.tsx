import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createInvoice,
  deleteInvoiceDraft,
  fetchInvoices,
  fetchSchoolSummary,
  fetchStudents,
  formatMoney,
  queryKeys,
  setInvoiceStatus,
  updateInvoiceDraft,
  type InvoiceRow,
  type StudentRow,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import FormField from '../../components/FormField'
import { showToast } from '../../lib/toast'

/**
 * Issuing invoices to families.
 *
 * TWO STEPS ON PURPOSE. An invoice is created as a draft and issued
 * separately. A family cannot see a draft (db/020), so a wrong amount typed
 * here is a private mistake rather than a bill somebody has already read. The
 * design has no such step; it is worth the extra click.
 *
 * Amounts are typed in dollars because that is what a person has in front of
 * them, and converted to whole cents immediately. Everything downstream — this
 * database, Stripe, the parent's screen — speaks cents.
 *
 * ---------------------------------------------------------------------------
 * A DRAFT CAN BE CORRECTED AND DISCARDED; NOTHING ELSE CAN
 * ---------------------------------------------------------------------------
 * The two-step design only pays for itself if the private half is genuinely
 * fixable. Before db/060 a mistyped draft could only be cleared by issuing the
 * bill to the family and then cancelling it — which put a charge and a
 * cancellation in front of somebody for a typo they were never meant to see.
 *
 * So Edit and Discard appear on drafts and on nothing else. An issued invoice
 * is still cancelled rather than deleted, and a paid one is untouchable: those
 * are records of something that happened to a family, and db/060 refuses them
 * at the database rather than trusting this file to keep hiding the buttons.
 */

const STATUS_STYLE: Record<InvoiceRow['status'], { label: string; className: string }> =
  {
    draft: { label: 'Draft', className: 'bg-background text-muted-foreground' },
    open: { label: 'Issued', className: 'bg-warning-subtle text-warning-foreground' },
    paid: { label: 'Paid', className: 'bg-success-subtle text-success-foreground' },
    void: { label: 'Cancelled', className: 'bg-background text-muted-foreground' },
  }

type Draft = {
  studentId: string
  description: string
  amountCents: number
  dueDate: string | null
}

/**
 * The fields of an invoice, for raising a new one or correcting a draft.
 *
 * It owns its own field state rather than taking it from the page, so opening
 * the editor on a draft is `invoice={row}` and nothing else — no effect
 * copying four values into four setters, and no chance of the form showing one
 * invoice's amount beside another's description. Remounting it per invoice
 * (see the `key` at the call site) is what makes that true.
 */
function InvoiceForm({
  heading,
  students,
  invoice,
  submitLabel,
  footnote,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: {
  heading: string
  students: StudentRow[]
  /** The draft being corrected, or undefined when raising a new one. */
  invoice?: InvoiceRow
  submitLabel: string
  footnote: string
  pending: boolean
  serverError?: string
  onSubmit: (draft: Draft) => void
  onCancel: () => void
}) {
  const [studentId, setStudentId] = useState(invoice?.student_id ?? '')
  const [description, setDescription] = useState(invoice?.description ?? '')
  // Cents back to the dollars a person typed. toFixed(2) so 125000 reads as
  // "1250.00" and not "1250", which looks like a field somebody left half done.
  const [amount, setAmount] = useState(
    invoice ? (invoice.amount_cents / 100).toFixed(2) : '',
  )
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  // Same reasoning as FormField: this component can be on screen twice, and a
  // repeated id points both labels at whichever input rendered first.
  const studentFieldId = useId()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const dollars = Number(amount)

    if (!studentId) return setFormError('Choose a student.')
    if (description.trim() === '') {
      return setFormError('Describe what this is for.')
    }
    if (!Number.isFinite(dollars) || dollars <= 0) {
      return setFormError('Enter an amount greater than zero.')
    }

    setFormError(null)
    onSubmit({
      studentId,
      description,
      // Rounded, not truncated: 12.345 typed by accident becomes 1235 cents,
      // and Math.round on a value already multiplied by 100 avoids the
      // floating-point surprise where 12.30 * 100 is 1229.9999999999998.
      amountCents: Math.round(dollars * 100),
      dueDate: dueDate === '' ? null : dueDate,
    })
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-border bg-card shadow-raised p-6"
      noValidate
    >
      <h2 className="text-lg font-bold text-foreground">{heading}</h2>

      {(formError || serverError) && (
        <p
          role="alert"
          className="mt-3 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
        >
          {formError ?? serverError}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor={studentFieldId}
            className="block text-sm font-semibold text-foreground"
          >
            Student
          </label>
          <select
            id={studentFieldId}
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
          >
            <option value="">Choose…</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.first_name} {student.last_name}
              </option>
            ))}
          </select>
        </div>

        <FormField
          label="Amount (AUD)"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          required
          placeholder="1250.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FormField
          label="Description"
          required
          hint="The family reads this. Make it make sense on its own."
          placeholder="Speech therapy, 12 sessions, term 3"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <FormField
          label="Due date"
          type="date"
          hint="Optional."
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-btn border border-border px-4 py-2.5 font-semibold text-foreground"
        >
          Cancel
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{footnote}</p>
    </form>
  )
}

export default function Invoices() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  /** The draft whose editor is open, by id. One at a time. */
  const [editingId, setEditingId] = useState<string | null>(null)

  const invoices = useQuery({ queryKey: queryKeys.invoices, queryFn: fetchInvoices })
  const students = useQuery({ queryKey: queryKeys.students, queryFn: fetchStudents })
  const school = useQuery({
    queryKey: queryKeys.schoolSummary,
    queryFn: fetchSchoolSummary,
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices })

  const create = useMutation({
    mutationFn: (draft: Draft) => {
      if (!school.data?.school_id) {
        throw new Error('Your account has no school assigned.')
      }
      return createInvoice({
        schoolId: school.data.school_id,
        studentId: draft.studentId,
        description: draft.description,
        amountCents: draft.amountCents,
        dueDate: draft.dueDate,
      })
    },
    onSuccess: () => {
      setCreating(false)
      void refresh()
      showToast('Draft invoice created. Issue it when you are ready.')
    },
  })

  const edit = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: Draft }) =>
      updateInvoiceDraft({
        invoiceId: id,
        studentId: draft.studentId,
        description: draft.description,
        amountCents: draft.amountCents,
        dueDate: draft.dueDate,
      }),
    onSuccess: () => {
      setEditingId(null)
      void refresh()
      showToast('Draft updated. The family still cannot see it.')
    },
  })

  const discard = useMutation({
    mutationFn: (id: string) => deleteInvoiceDraft(id),
    onSuccess: () => {
      setEditingId(null)
      void refresh()
      showToast('Draft discarded.')
    },
  })

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'open' | 'void' }) =>
      setInvoiceStatus(id, status),
    onSuccess: (_data, variables) => {
      void refresh()
      showToast(
        variables.status === 'open'
          ? 'Invoice issued. The family can see it now.'
          : 'Invoice cancelled.',
      )
    },
  })

  if (invoices.isPending || students.isPending) return <LoadingCards count={2} />
  if (invoices.isError) return <ErrorState message={invoices.error.message} />

  const nameFor = (id: string) => {
    const student = students.data?.find((s) => s.id === id)
    return student ? `${student.first_name} ${student.last_name}` : 'Unknown student'
  }

  const outstanding = invoices.data
    .filter((i) => i.status === 'open')
    .reduce((sum, i) => sum + i.amount_cents, 0)
  const collected = invoices.data
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + i.amount_cents, 0)

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-title text-foreground">Invoices</h1>
          <p className="mt-1 text-muted-foreground">
            What your school has billed families, and what has been paid.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating((v) => !v)
            setEditingId(null)
          }}
          className="ml-auto rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
        >
          {creating ? 'Cancel' : '+ New invoice'}
        </button>
      </header>

      <div className="mb-6 grid gap-5 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Outstanding
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {formatMoney(outstanding)}
          </p>
        </div>
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Collected
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {formatMoney(collected)}
          </p>
        </div>
      </div>

      {creating && (
        <div className="mb-6">
          <InvoiceForm
            heading="New invoice"
            students={students.data ?? []}
            submitLabel="Save as draft"
            footnote="Saved as a draft. The family sees nothing until you issue it."
            pending={create.isPending}
            serverError={create.error?.message}
            onSubmit={(draft) => create.mutate(draft)}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {changeStatus.isError && (
        <p role="alert" className="mb-4 text-sm font-medium text-danger-foreground">
          {changeStatus.error.message}
        </p>
      )}

      {discard.isError && (
        <p role="alert" className="mb-4 text-sm font-medium text-danger-foreground">
          {discard.error.message}
        </p>
      )}

      {invoices.data.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          detail="Use New invoice to bill a family. It is saved as a draft first, so nothing reaches them until you choose to issue it."
        />
      ) : (
        <ul className="space-y-3">
          {invoices.data.map((invoice) => {
            const style = STATUS_STYLE[invoice.status]

            // The editor replaces the row it belongs to, rather than opening at
            // the top of the page. A form somewhere else on a long list is a
            // button that appears to do nothing.
            if (editingId === invoice.id) {
              return (
                <li key={invoice.id}>
                  <InvoiceForm
                    // Remount when a different draft is opened, so the fields
                    // are re-initialised from that invoice rather than kept.
                    key={invoice.id}
                    heading="Edit draft"
                    students={students.data ?? []}
                    invoice={invoice}
                    submitLabel="Save changes"
                    footnote="Still a draft. The family sees nothing until you issue it."
                    pending={edit.isPending}
                    serverError={edit.error?.message}
                    onSubmit={(draft) =>
                      edit.mutate({ id: invoice.id, draft })
                    }
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              )
            }

            return (
              <li
                key={invoice.id}
                className="rounded-card border border-border bg-card shadow-raised p-4 sm:flex sm:items-center sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {invoice.description}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {nameFor(invoice.student_id)}
                    {invoice.due_date &&
                      ` · due ${new Date(invoice.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}`}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 sm:mt-0 sm:ml-auto">
                  <span
                    className={`rounded-btn px-2.5 py-1 text-sm font-semibold ${style.className}`}
                  >
                    {style.label}
                  </span>
                  <span className="font-bold text-foreground">
                    {formatMoney(invoice.amount_cents, invoice.currency)}
                  </span>

                  {invoice.status === 'draft' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(invoice.id)
                          setCreating(false)
                        }}
                        className="rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          changeStatus.mutate({ id: invoice.id, status: 'open' })
                        }
                        disabled={changeStatus.isPending}
                        className="rounded-btn bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        Issue to family
                      </button>
                      {/* Says what is being thrown away and what it is worth,
                          because "Are you sure?" is a question nobody can
                          answer without the numbers in front of them. */}
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Discard this draft for ${nameFor(invoice.student_id)} — ${invoice.description}, ${formatMoney(invoice.amount_cents, invoice.currency)}? It has never been visible to the family and cannot be recovered.`,
                            )
                          ) {
                            discard.mutate(invoice.id)
                          }
                        }}
                        disabled={discard.isPending}
                        className="rounded-btn border border-danger px-3 py-2 text-sm font-semibold text-danger-foreground disabled:opacity-60"
                      >
                        Discard
                      </button>
                    </>
                  )}
                  {invoice.status === 'open' && (
                    <button
                      type="button"
                      onClick={() =>
                        changeStatus.mutate({ id: invoice.id, status: 'void' })
                      }
                      disabled={changeStatus.isPending}
                      className="rounded-btn border border-danger px-3 py-2 text-sm font-semibold text-danger-foreground disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
