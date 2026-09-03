import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createEducatorStudent,
  fetchExistingStudentRefs,
  queryKeys,
} from '../../lib/api'
import EducatorSchoolContext from '../../components/EducatorSchoolContext'
import { useAuth } from '../../lib/auth'

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

  const normalisedRef = externalRef.trim().toLocaleLowerCase('en-AU')
  const duplicateRef =
    normalisedRef !== '' &&
    Array.from(existingRefs.data ?? []).some(
      (reference) => reference.trim().toLocaleLowerCase('en-AU') === normalisedRef,
    )

  const create = useMutation({
    mutationFn: () =>
      createEducatorStudent({
        firstName,
        lastName,
        yearLevel,
        externalRef,
        dateOfBirth,
      }),
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
        className="text-sm font-medium text-primary hover:underline"
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
          remains responsible for guardian links, consent and wider staff access.
        </div>

        {create.isError && (
          <p role="alert" className="mt-4 text-sm text-danger-foreground">
            {create.error.message}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Link
            to="/educator/students"
            className="rounded-btn border border-border px-4 py-2.5 font-semibold"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!valid || create.isPending}
            className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {create.isPending ? 'Adding…' : 'Add student'}
          </button>
        </div>
      </form>
    </div>
  )
}
