import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createEducatorStudent,
  fetchExistingStudentRefs,
  queryKeys,
  saveStudentProfile,
  EMPTY_PROFILE,
  type StudentProfile,
} from '../../lib/api'
import EducatorSchoolContext from '../../components/EducatorSchoolContext'
import { useAuth } from '../../lib/auth'
import AboutThisChild from '../../components/AboutThisChild'
import { showToast } from '../../lib/toast'

export default function AddStudent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [yearLevel, setYearLevel] = useState('')
  const [externalRef, setExternalRef] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')

  const existingRefs = useQuery({
    queryKey: queryKeys.existingStudentRefs,
    queryFn: fetchExistingStudentRefs,
  })

  /*
   * COLLAPSED, AND AFTER THE REQUIRED FIELDS — docs/19 §5.1.
   *
   * Adding a child stays two fields. This is here because an educator adding
   * ONE student usually does know what that child loves, and typing it now is
   * cheaper than coming back — but it must never look like part of the job, or
   * the roll becomes something people put off.
   */
  const [aboutChild, setAboutChild] = useState<StudentProfile>(EMPTY_PROFILE)
  const [aboutOpen, setAboutOpen] = useState(false)
  const hasProfile =
    Boolean(
      aboutChild.interests?.trim() ||
      aboutChild.strengths?.trim() ||
      aboutChild.finds_hard?.trim(),
    ) ||
    aboutChild.helps.length > 0 ||
    aboutChild.triggers.length > 0

  const normalisedRef = externalRef.trim().toLocaleLowerCase('en-AU')
  const duplicateRef =
    normalisedRef !== '' &&
    Array.from(existingRefs.data ?? []).some(
      (reference) =>
        reference.trim().toLocaleLowerCase('en-AU') === normalisedRef,
    )

  const create = useMutation({
    mutationFn: async () => {
      const studentId = await createEducatorStudent({
        firstName,
        lastName,
        yearLevel,
        externalRef,
        dateOfBirth,
      })

      /*
       * SECOND, AND NEVER ALLOWED TO UNDO THE FIRST — db/127.
       *
       * Adding a child to the roll is the thing that must succeed. If the
       * profile write fails — a dropped connection, a policy that changed —
       * the child is still on the roll and the teacher is told about the part
       * that did not land, rather than being shown one error that makes it look
       * as though nothing was created and inviting them to type it all again.
       */
      if (hasProfile) {
        try {
          await saveStudentProfile(studentId, aboutChild)
        } catch (error) {
          showToast(
            `${firstName} was added, but the notes about them were not saved. You can add them from their record. (${
              error instanceof Error ? error.message : 'Unknown error'
            })`,
            'error',
          )
        }
      }

      return studentId
    },
    onSuccess: async (studentId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.students })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.existingStudentRefs,
      })
      navigate(`/educator/students/${studentId}`)
    },
  })

  const valid =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    Boolean(profile?.school_id) &&
    !duplicateRef

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/educator/students"
        className="-ml-1 inline-flex min-h-11 items-center px-1 text-sm font-medium text-primary hover:underline"
      >
        ← All students
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="text-title text-foreground">Add a student</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Add a child you teach. They will be assigned to you automatically and
          will immediately appear in your classroom.
        </p>
        <EducatorSchoolContext />
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) create.mutate()
        }}
        className="rounded-card border border-border bg-card p-5 shadow-raised"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-foreground">
            First name <span className="text-danger-foreground">*</span>
            <input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="off"
              required
              maxLength={100}
              className="mt-1 block w-full rounded-btn border border-border bg-card px-3 py-2.5"
            />
          </label>

          <label className="text-sm font-medium text-foreground">
            Last name <span className="text-danger-foreground">*</span>
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="off"
              required
              maxLength={100}
              className="mt-1 block w-full rounded-btn border border-border bg-card px-3 py-2.5"
            />
          </label>

          <label className="text-sm font-medium text-foreground">
            Year level
            <input
              value={yearLevel}
              onChange={(event) => setYearLevel(event.target.value)}
              placeholder="For example, Year 4 or Prep"
              maxLength={50}
              className="mt-1 block w-full rounded-btn border border-border bg-card px-3 py-2.5"
            />
          </label>

          <label className="text-sm font-medium text-foreground">
            School student ID
            <input
              value={externalRef}
              onChange={(event) => setExternalRef(event.target.value)}
              placeholder="For example, 4021"
              maxLength={100}
              aria-invalid={duplicateRef}
              aria-describedby={duplicateRef ? 'student-id-error' : undefined}
              className="mt-1 block w-full rounded-btn border border-border bg-card px-3 py-2.5"
            />
            {duplicateRef && (
              <span
                id="student-id-error"
                role="alert"
                className="mt-1 block text-xs text-danger-foreground"
              >
                That student ID is already used in your current school.
              </span>
            )}
            {/* THIS CHECK FAILS OPEN, so it has to say when it did not run.
                `duplicateRef` is computed against `existingRefs.data ?? []`,
                and a failed query makes that an empty set — no warning, and
                the Add button stays enabled. Two children under one reference
                is far easier to prevent than to unpick, and silence looked
                exactly like "this one is free". */}
            {existingRefs.isError && !duplicateRef && (
              <span className="mt-1 block text-xs text-warning-foreground">
                Existing student IDs could not be checked, so this one has not
                been compared against them.
              </span>
            )}
          </label>

          <label className="text-sm font-medium text-foreground sm:col-span-2">
            Date of birth
            <input
              type="date"
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="mt-1 block w-full rounded-btn border border-border bg-card px-3 py-2.5 sm:max-w-xs"
            />
          </label>
        </div>

        <div className="mt-5 rounded-btn bg-background p-3 text-sm text-muted-foreground">
          Only add students currently assigned to you. A school administrator
          remains responsible for guardian links, consent and wider staff
          access.
        </div>

        {create.isError && (
          <p role="alert" className="mt-4 text-sm text-danger-foreground">
            {create.error.message}
          </p>
        )}

        {/* --- About this child (db/127) --------------------------------
            SHUT BY DEFAULT. docs/19 §5.1: adding a child stays two required
            fields, and a profile section that greets somebody adding their
            fourteenth student is how a roll stops getting kept up to date.
            Open, it is the same component the record uses — one place to
            change when the fields change. */}
        <div className="mt-5 rounded-card border border-border bg-background p-4">
          {!aboutOpen ? (
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="pressable w-full text-left"
            >
              <span className="text-sm font-semibold text-foreground">
                Anything about {firstName.trim() || 'them'} worth writing down?
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Optional. What they love, are good at, and find hard — it is
                what makes the suggestions specific rather than general, and it
                can be added later from their record.
              </span>
            </button>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  About {firstName.trim() || 'them'}
                </h2>
                <button
                  type="button"
                  onClick={() => setAboutOpen(false)}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Close
                </button>
              </div>
              <div className="mt-3">
                <AboutThisChild
                  idPrefix="add-student"
                  firstName={firstName.trim() || undefined}
                  value={aboutChild}
                  onChange={setAboutChild}
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Link
            to="/educator/students"
            className="pressable rounded-btn border border-border px-4 py-2.5 font-semibold"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!valid || create.isPending}
            className="pressable min-h-11 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {create.isPending ? 'Adding…' : 'Add student'}
          </button>
        </div>
      </form>
    </div>
  )
}
