import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  createSchool,
  queryKeys,
  type OrganisationKind,
  type OrganisationStatus,
  type SchoolRow,
} from '../lib/api'
import FormField from './FormField'
import Icon from './Icon'
import { showToast } from '../lib/toast'

/**
 * Adding a school — the first step of onboarding a customer.
 *
 * WHAT WAS MISSING. Schools were created by hand in SQL, and the Schools page
 * said so in its own empty state. That made the whole of onboarding a job for
 * somebody with database access, and it made the SECOND step impossible: a
 * school administrator is invited by a school administrator, and a brand new
 * school has none. Saurab hit exactly that — a principal to invite and nowhere
 * to do it.
 *
 * The database was always ready. `schools_write_platform_admin` in db/004 has
 * allowed this since the beginning and survived the rename to `organisations`;
 * only the screen was absent.
 *
 * ---------------------------------------------------------------------------
 * IT OPENS ON TRIAL, NOT ACTIVE
 * ---------------------------------------------------------------------------
 * A school being typed in has not agreed to anything yet. If every tenant read
 * "Active" from the moment it was created, the status column would tell Special
 * Miles nothing — which is the state db/053 just finished getting out of.
 */
export default function AddSchoolSection() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [suburb, setSuburb] = useState('')
  const [state, setState] = useState('NSW')
  const [kind, setKind] = useState<OrganisationKind>('school')
  const [status, setStatus] = useState<OrganisationStatus>('trial')
  const [created, setCreated] = useState<SchoolRow | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: () => createSchool({ name, suburb, state, kind, status }),
    onSuccess: (school) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.schools })
      setCreated(school)
      setName('')
      setSuburb('')
      setFormError(null)
      showToast(`${school.name} added.`)
    },
    onError: (error) => setFormError(error.message),
  })

  /*
   * THE JOB IS NOT DONE WHEN THE SCHOOL EXISTS. A school with no administrator
   * is a row nobody can use — the next step is inviting one, and this says so
   * and links straight there rather than leaving somebody to work out that a
   * second step exists.
   */
  if (created) {
    return (
      <section className="mt-8 rounded-card border border-success bg-success-subtle p-5">
        <h2 className="font-bold text-success-foreground">
          {created.name} added
        </h2>
        <p className="mt-1 max-w-prose text-sm text-success-foreground">
          It has no administrator yet, so nobody can do anything with it. Invite
          the principal or business manager next — their account arrives already
          attached and already verified, and from then on they invite their own
          staff.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to={`/platform-admin/tenants/${created.id}`}
            className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
          >
            Invite its first administrator
          </Link>
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="rounded-btn border border-border bg-card px-4 py-2.5 font-semibold text-foreground"
          >
            Add another school
          </button>
        </div>
      </section>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
      >
        <Icon name="schools" className="h-5 w-5" />
        Add a school
      </button>
    )
  }

  return (
    <section className="mt-6 rounded-card border border-border bg-card shadow-raised p-5">
      <h2 className="text-lg font-semibold text-foreground">Add a school</h2>
      <p className="mt-1 mb-4 max-w-prose text-sm text-muted-foreground">
        Only Special Miles can create one. A school cannot set itself up,
        because creating it means creating the thing every account at that
        school hangs off.
      </p>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim() === '') return setFormError('Give the school a name.')
          add.mutate()
        }}
      >
        {formError && (
          <p
            role="alert"
            className="mb-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
          >
            {formError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Parramatta West Primary School"
          />
          <FormField
            label="Suburb"
            value={suburb}
            onChange={(e) => setSuburb(e.target.value)}
          />

          <div>
            <label
              htmlFor="school-state"
              className="block text-sm font-semibold text-foreground"
            >
              State
            </label>
            <select
              id="school-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
            >
              {['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="school-kind"
              className="block text-sm font-semibold text-foreground"
            >
              Kind
            </label>
            {/* Not every customer is a school — the client sells to Montessori
                centres and NDIS providers too, and calling one a school in its
                own tenant list is a small insult that is easy to avoid. */}
            <select
              id="school-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as OrganisationKind)}
              className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
            >
              <option value="school">School</option>
              <option value="ecec">Early childhood</option>
              <option value="montessori">Montessori</option>
              <option value="ndis_provider">NDIS provider</option>
              <option value="corporate">Corporate</option>
              <option value="practice">Practice</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="school-status"
              className="block text-sm font-semibold text-foreground"
            >
              Status
            </label>
            <select
              id="school-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as OrganisationStatus)}
              className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
            >
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            {/* This claimed suspended changed nothing but the label. db/063
                made it real — `educator_create_student` admits only 'active'
                and 'trial' — so the hint was telling somebody a suspended
                school works normally while its teachers were being refused. */}
            <p className="mt-1 text-xs text-muted-foreground">
              Trial and active both work normally. Suspended stops educators
              adding students; everything already recorded stays readable. You
              can change this later from the Schools table.
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={add.isPending}
            className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {add.isPending ? 'Adding…' : 'Add school'}
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
    </section>
  )
}
