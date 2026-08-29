import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BEHAVIOUR_LABEL,
  fetchBehaviourLog,
  INTENSITY_LABEL,
  queryKeys,
  updateBehaviourLog,
  type BehaviourIntensity,
  type BehaviourType,
  type EditableBehaviourLog,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { showToast } from '../lib/toast'
import { ErrorState } from './QueryState'

/**
 * Correcting an observation — db/010's update policy, which had no screen.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A MODE ON BehaviourLogModal
 * ---------------------------------------------------------------------------
 * That modal is built around writing a NEW log: a running timer, a
 * client-generated reference so a retry cannot save twice, dictation, a risk
 * flag, and a localStorage queue for when there is no network. None of it
 * applies to changing a sentence in a record that already exists, and half of
 * it would be actively wrong — an offline queue that re-sends an edit would
 * overwrite a later correction.
 *
 * ---------------------------------------------------------------------------
 * THE LOCK IS EXPLAINED, NOT JUST ENFORCED
 * ---------------------------------------------------------------------------
 * db/010 closes the author's window the moment an administrator acknowledges
 * the log, because "a safeguarding record the author can quietly revise after
 * an administrator has read it proves nothing". A teacher who meets that lock
 * has not hit a bug, so this says which rule stopped them rather than failing
 * with a policy error — and an administrator, who may still edit, is told the
 * log has been acknowledged so the edit is a deliberate correction rather than
 * a surprise.
 */

const TYPES = Object.keys(BEHAVIOUR_LABEL) as BehaviourType[]
const INTENSITIES = Object.keys(INTENSITY_LABEL) as BehaviourIntensity[]

/**
 * THE FORM IS A SEPARATE COMPONENT SO ITS STATE CAN START FROM THE RECORD.
 *
 * The first version seeded the fields in a `useEffect` that ran when the query
 * resolved, which `react-hooks/set-state-in-effect` rejects — and rightly: it
 * renders once with empty fields and then again with real ones, so a fast
 * typist can lose the first thing they type. Mounting this only once the log
 * has arrived means `useState` is initialised from the stored record, which is
 * both correct and simpler than reconciling the two.
 */
function CorrectionForm({
  log,
  studentId,
  acknowledged,
  onClose,
}: {
  log: EditableBehaviourLog
  studentId: string
  acknowledged: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [behaviour, setBehaviour] = useState<BehaviourType>(log.behaviour_type)
  const [intensity, setIntensity] = useState<BehaviourIntensity>(log.intensity)
  const [notes, setNotes] = useState(log.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      updateBehaviourLog(log.id, {
        behaviourType: behaviour,
        intensity,
        notes,
      }),
    onSuccess: async () => {
      // The same prefix StudentTimeline invalidates after a share, so every
      // page and kind-filter combination of the timeline is refreshed rather
      // than only the one that happens to be on screen.
      await queryClient.invalidateQueries({ queryKey: ['timeline', studentId] })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.behaviourLog(log.id),
      })
      showToast('Correction saved.')
      onClose()
    },
    onError: (e) => setError(e.message),
  })

  return (
    <>
      {acknowledged && (
        /* An admin editing an acknowledged log. Not blocked — db/010 keeps
           this open on purpose — but said plainly, because it is a different
           act from a teacher tidying their own wording. */
        <p className="mt-3 rounded-btn border border-warning bg-warning-subtle px-3 py-2 text-sm text-warning-foreground">
          This log has already been acknowledged. You can still correct it, and
          the correction is recorded against your name.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
        >
          {error}
        </p>
      )}

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          save.mutate()
        }}
      >
        <fieldset>
          <legend className="text-sm font-medium text-foreground">
            What kind of behaviour
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={behaviour === t}
                onClick={() => setBehaviour(t)}
                className={`rounded-btn border px-3 py-1.5 text-sm font-semibold ${
                  behaviour === t
                    ? 'border-primary bg-primary-subtle text-primary'
                    : 'border-border bg-card text-foreground'
                }`}
              >
                {BEHAVIOUR_LABEL[t]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-foreground">
            How intense
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTENSITIES.map((i) => (
              <button
                key={i}
                type="button"
                aria-pressed={intensity === i}
                onClick={() => setIntensity(i)}
                className={`rounded-btn border px-3 py-1.5 text-sm font-semibold ${
                  intensity === i
                    ? 'border-primary bg-primary-subtle text-primary'
                    : 'border-border bg-card text-foreground'
                }`}
              >
                {INTENSITY_LABEL[i]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <label
            htmlFor="edit-log-notes"
            className="block text-sm font-medium text-foreground"
          >
            What happened
          </label>
          <textarea
            id="edit-log-notes"
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {/* Said because a shared log is already in front of the family,
                and a correction changes what they read. */}
            If this observation has been shared, the family sees the corrected
            version.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {save.isPending ? 'Saving…' : 'Save the correction'}
          </button>
        </div>
      </form>
    </>
  )
}

export default function EditBehaviourLogDialog({
  logId,
  studentId,
  onClose,
}: {
  logId: string
  studentId: string
  onClose: () => void
}) {
  const { profile, session } = useAuth()
  const dialogRef = useRef<HTMLDialogElement>(null)

  const log = useQuery({
    queryKey: queryKeys.behaviourLog(logId),
    queryFn: () => fetchBehaviourLog(logId),
  })

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const isAdmin =
    profile?.role === 'school_admin' || profile?.role === 'platform_admin'
  const acknowledged = log.data?.safeguarding_acknowledged_at != null
  const isAuthor = log.data?.logged_by === session?.user?.id
  // Mirrors db/010 exactly. The database is still the authority — this only
  // decides what the screen offers, and `assertChanged` catches any drift.
  const mayEdit = isAdmin || (isAuthor && !acknowledged)

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-[min(34rem,92vw)] rounded-card border border-border bg-card p-0 text-foreground backdrop:bg-black/40"
    >
      <div className="p-5">
        <h2 className="text-section text-foreground">
          Correct this observation
        </h2>

        {log.isPending && (
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        )}

        {log.isError && (
          <div className="mt-3">
            <ErrorState message={log.error.message} />
          </div>
        )}

        {log.isSuccess && !mayEdit && (
          <>
            <div className="mt-3 rounded-card border border-warning bg-warning-subtle p-4 text-sm text-warning-foreground">
              {acknowledged ? (
                <>
                  <p className="font-semibold">
                    This observation has been acknowledged by an administrator.
                  </p>
                  <p className="mt-1">
                    It is locked from here on. That is deliberate: a record its
                    author can revise after somebody has formally read it
                    proves nothing. If something in it is wrong, tell an
                    administrator — they can still correct it, and the change
                    is recorded.
                  </p>
                </>
              ) : (
                <p>
                  Observations are corrected by the person who wrote them, or by
                  an administrator.
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground"
              >
                Close
              </button>
            </div>
          </>
        )}

        {log.isSuccess && mayEdit && (
          <CorrectionForm
            log={log.data}
            studentId={studentId}
            acknowledged={acknowledged}
            onClose={onClose}
          />
        )}
      </div>
    </dialog>
  )
}
