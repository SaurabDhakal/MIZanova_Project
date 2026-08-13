import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createInvoice,
  fetchInvoices,
  fetchSchoolSummary,
  fetchStudents,
  formatMoney,
  queryKeys,
  setInvoiceStatus,
  type InvoiceRow,
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
 */

const STATUS_STYLE: Record<InvoiceRow['status'], { label: string; className: string }> =
  {
    draft: { label: 'Draft', className: 'bg-background text-muted-foreground' },
    open: { label: 'Issued', className: 'bg-warning-subtle text-warning-foreground' },
    paid: { label: 'Paid', className: 'bg-success-subtle text-success-foreground' },
    void: { label: 'Cancelled', className: 'bg-background text-muted-foreground' },
  }

export default function Invoices() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [studentId, setStudentId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const invoices = useQuery({ queryKey: queryKeys.invoices, queryFn: fetchInvoices })
  const students = useQuery({ queryKey: queryKeys.students, queryFn: fetchStudents })
  const school = useQuery({
    queryKey: queryKeys.schoolSummary,
    queryFn: fetchSchoolSummary,
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices })

  const create = useMutation({
    mutationFn: () =>
      createInvoice({
        schoolId: school.data!.school_id,
        studentId,
        description,
        // Rounded, not truncated: 12.345 typed by accident becomes 1235 cents,
        // and Math.round on a value already multiplied by 100 avoids the
        // floating-point surprise where 12.30 * 100 is 1229.9999999999998.
        amountCents: Math.round(Number(amount) * 100),
        dueDate: dueDate === '' ? null : dueDate,
      }),
    onSuccess: () => {
      setShowForm(false)
      setStudentId('')
      setDescription('')
      setAmount('')
      setDueDate('')
      void refresh()
      showToast('Draft invoice created. Issue it when you are ready.')
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

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const dollars = Number(amount)

    if (!studentId) return setFormError('Choose a student.')
    if (description.trim() === '') return setFormError('Describe what this is for.')
    if (!Number.isFinite(dollars) || dollars <= 0) {
      return setFormError('Enter an amount greater than zero.')
    }
    if (!school.data?.school_id) {
      return setFormError('Your account has no school assigned.')
    }

    setFormError(null)
    create.mutate()
  }

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
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
        >
          {showForm ? 'Cancel' : '+ New invoice'}
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

      {showForm && (
        <form
          onSubmit={submit}
          className="mb-6 rounded-card border border-border bg-card shadow-raised p-6"
          noValidate
        >
          <h2 className="text-lg font-bold text-foreground">New invoice</h2>

          {(formError || create.isError) && (
            <p
              role="alert"
              className="mt-3 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
            >
              {formError ?? create.error?.message}
            </p>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="invoice-student"
                className="block text-sm font-semibold text-foreground"
              >
                Student
              </label>
              <select
                id="invoice-student"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
              >
                <option value="">Choose…</option>
                {students.data?.map((student) => (
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

          <button
            type="submit"
            disabled={create.isPending}
            className="mt-5 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {create.isPending ? 'Saving…' : 'Save as draft'}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            Saved as a draft. The family sees nothing until you issue it.
          </p>
        </form>
      )}

      {changeStatus.isError && (
        <p role="alert" className="mb-4 text-sm font-medium text-danger-foreground">
          {changeStatus.error.message}
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
