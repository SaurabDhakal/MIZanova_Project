import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createGuardianCode, fetchStudents, queryKeys } from '../lib/api'
import { EmptyState, ErrorState } from './QueryState'
import FormField from './FormField'
import { showToast } from '../lib/toast'

/**
 * Inviting a family, from the staff directory — db/037.
 *
 * The same code the student record issues, reached from where an administrator
 * is already working. Setting up a new class means sitting on one screen with
 * a list of families, not opening thirty student records in turn.
 *
 * THE CHILD IS CHOSEN FIRST, and that ordering is deliberate. A guardian code
 * is access to ONE child's record; picking the address first and the child
 * second invites the mistake of sending the wrong family's letter, which here
 * means giving a stranger a child's behaviour history.
 *
 * `createGuardianCode` is reused rather than reimplemented — same endpoint,
 * same email, same rules about who may call it. This screen is a different way
 * in, not a second implementation.
 */

const RELATIONSHIPS = ['mother', 'father', 'guardian', 'carer', 'other']

export default function InviteFamilySection() {
  const queryClient = useQueryClient()
  const [studentId, setStudentId] = useState('')
  const [email, setEmail] = useState('')
  const [relationship, setRelationship] = useState('guardian')
  const [formError, setFormError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{
    code: string
    childName: string
    link: string
    emailSent: boolean
    emailError: string | null
    to: string
  } | null>(null)

  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })

  const create = useMutation({
    mutationFn: () =>
      createGuardianCode({ studentId, email: email.trim(), relationship }),
    onSuccess: (result) => {
      const link =
        `${window.location.origin}/link` +
        `?code=${encodeURIComponent(result.code)}` +
        `&email=${encodeURIComponent(email.trim())}`

      setIssued({ ...result, link, to: email.trim() })
      setEmail('')
      setFormError(null)
      void queryClient.invalidateQueries({
        queryKey: queryKeys.guardianCodes(studentId),
      })
    },
    onError: (error) => setFormError(error.message),
  })

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">Invite a family</h2>
      <p className="mt-1 mb-4 max-w-prose text-sm text-muted-foreground">
        Give a parent or carer their own account for one child. They get a code
        that works once, and only from the address you enter here.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!studentId) return setFormError('Choose the child first.')
          if (email.trim() === '') return setFormError('Enter their email address.')
          setIssued(null)
          create.mutate()
        }}
        className="mb-5 rounded-card border border-border bg-card shadow-raised p-5"
        noValidate
      >
        {formError && (
          <p
            role="alert"
            className="mb-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
          >
            {formError}
          </p>
        )}

        {students.isError && <ErrorState message={students.error.message} />}

        {students.isSuccess && students.data.length === 0 ? (
          <EmptyState
            title="No students yet"
            detail="A family account is access to a particular child, so there has to be a child first."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="family-student"
                className="block text-sm font-semibold text-foreground"
              >
                Which child
              </label>
              <select
                id="family-student"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
              >
                <option value="">Choose a child…</option>
                {(students.data ?? []).map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.first_name} {student.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="family-relationship"
                className="block text-sm font-semibold text-foreground"
              >
                Relationship
              </label>
              <select
                id="family-relationship"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground capitalize"
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r} className="capitalize">
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <FormField
                label="Their email address"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parent@example.com"
                hint="Check it against your enrolment records. This is the step that decides who can read this child's history."
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={create.isPending}
                className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
              >
                {create.isPending ? 'Creating…' : 'Create code'}
              </button>
            </div>
          </div>
        )}
      </form>

      {issued && (
        <div
          role="status"
          className="mb-5 rounded-card border border-success bg-success-subtle p-5"
        >
          <p className="font-semibold text-success-foreground">
            Code for {issued.childName}. Copy it now — it is not shown again.
          </p>
          <p className="mt-1 text-sm text-success-foreground">
            {issued.emailSent
              ? `Emailed to ${issued.to}.`
              : 'No email was sent — pass this on the way you normally contact this family.'}{' '}
            It expires in 30 days and works once.
          </p>

          {!issued.emailSent && issued.emailError && (
            <p className="mt-2 text-xs text-success-foreground opacity-90">
              Reason: {issued.emailError}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="rounded-btn border border-border bg-card px-4 py-3 font-mono text-xl tracking-widest text-foreground">
              {issued.code}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(issued.link)
                  .then(() => showToast('Link copied.'))
                  .catch(() => showToast('Could not copy.'))
              }}
              className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Copy sign-up link
            </button>
          </div>

          <p className="mt-3 text-xs text-success-foreground">
            Every code issued for a child, and whether it has been used, is on
            that child&rsquo;s record under Family access.
          </p>
        </div>
      )}
    </section>
  )
}
