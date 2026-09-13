import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys, updateStudentDetails, type StudentRow } from '../lib/api'
import FormField from './FormField'
import { showToast } from '../lib/toast'

/**
 * Correcting the five facts that identify a child.
 *
 * ---------------------------------------------------------------------------
 * THE SECOND HALF OF "WHAT IF ONE WRONG CAME UP"
 * ---------------------------------------------------------------------------
 * The review table catches it before the import. This is for the one that got
 * through — a surname misread off a form, a year level off by one, a date of
 * birth that was fine in the spreadsheet and wrong in real life.
 *
 * Until now there was no way to change any of it. RLS has allowed a school
 * admin to correct their own school's students since db/004; nothing ever
 * called it. With no delete either, the only escape was to mark the child as
 * having left and add them again — which leaves a ghost of a real child on the
 * record and moves their entire history onto a record nobody is looking at.
 *
 * ---------------------------------------------------------------------------
 * CLOSED BY DEFAULT, AND IT SAYS WHAT THE NAME IS FOR
 * ---------------------------------------------------------------------------
 * A record that is permanently a form invites accidental edits, and this is
 * the one form on the page where a slip renames a child. StudentProfileCard
 * makes the same argument about the profile.
 *
 * It stays available for a child who has left. db/136 refuses new activity on
 * a closed record and deliberately leaves UPDATE alone: a departure is not a
 * reason to freeze a misspelled name into the archive forever.
 */
export default function StudentDetailsEditor({
  student,
}: {
  student: StudentRow
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState(student.first_name)
  const [lastName, setLastName] = useState(student.last_name)
  const [yearLevel, setYearLevel] = useState(student.year_level ?? '')
  const [externalRef, setExternalRef] = useState(student.external_ref ?? '')
  const [dateOfBirth, setDateOfBirth] = useState(student.date_of_birth ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      updateStudentDetails(student.id, {
        firstName,
        lastName,
        yearLevel,
        externalRef,
        dateOfBirth,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.student(student.id),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.students }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.studentsIncludingPast,
        }),
      ])
      showToast('Details corrected.')
      setOpen(false)
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const reset = () => {
    setFirstName(student.first_name)
    setLastName(student.last_name)
    setYearLevel(student.year_level ?? '')
    setExternalRef(student.external_ref ?? '')
    setDateOfBirth(student.date_of_birth ?? '')
    setFormError(null)
    save.reset()
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 -ml-2 inline-flex items-center px-2 text-sm font-semibold text-primary hover:underline"
      >
        Correct these details
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (firstName.trim() === '' || lastName.trim() === '') {
          return setFormError('A first name and a surname are both needed.')
        }
        setFormError(null)
        save.mutate()
      }}
      noValidate
      className="mt-3 rounded-card border border-border bg-card p-4 shadow-raised"
    >
      <h3 className="text-sm font-semibold text-foreground">
        Correct these details
      </h3>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        The short name families see is built from these, so it follows
        automatically.
      </p>

      {formError && (
        <p
          role="alert"
          className="mt-3 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
        >
          {formError}
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FormField
          label="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <FormField
          label="Surname"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        <FormField
          label="Year level"
          value={yearLevel}
          onChange={(e) => setYearLevel(e.target.value)}
        />
        <FormField
          label="Student ID"
          value={externalRef}
          onChange={(e) => setExternalRef(e.target.value)}
        />
        <label className="block">
          <span className="text-sm font-semibold text-foreground">
            Date of birth
          </span>
          {/* A picker, for the same reason the import's fix row uses one: the
              commonest wrong date is an ambiguous one, and this cannot make
              one. */}
          <input
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={save.isPending}
          className="pressable min-h-11 rounded-btn bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : 'Save corrections'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="pressable min-h-11 rounded-btn border border-border px-4 py-2.5 text-sm font-semibold text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
