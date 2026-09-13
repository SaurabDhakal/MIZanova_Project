import { useState } from 'react'
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
import { useModalDialog } from '../hooks/useModalDialog'
import ChipRow from './ChipRow'
import {
  ANTECEDENTS,
  SETTING_EVENTS,
  WHAT_HELPED,
  type Antecedent,
  type SettingEvent,
  type WhatHelped,
} from '../lib/behaviourContext'

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

  // db/122. Initialised from the stored row like everything else here, so a
  // correction that changes only the notes does not silently clear them.
  const [antecedent, setAntecedent] = useState<Antecedent | null>(
    log.antecedent ?? null,
  )
  const [whatHelped, setWhatHelped] = useState<WhatHelped | null>(
    log.what_helped ?? null,
  )
  const [settingEvents, setSettingEvents] = useState<SettingEvent[]>(
    log.setting_events ?? [],
  )
  // db/125. The escape hatch, and the only part of these fields that can carry
  // a name — so it is redacted before the model like any other prose.
  // Only meaningful alongside the matching 'other' code.
  const [antecedentNote, setAntecedentNote] = useState(
    log.antecedent_note ?? '',
  )
  const [whatHelpedNote, setWhatHelpedNote] = useState(
    log.what_helped_note ?? '',
  )
  const [settingEventsNote, setSettingEventsNote] = useState(
    log.setting_events_note ?? '',
  )

  const save = useMutation({
    mutationFn: () =>
      updateBehaviourLog(log.id, {
        behaviourType: behaviour,
        intensity,
        notes,
        antecedent,
        whatHelped,
        settingEvents,
        antecedentNote: antecedent === 'other' ? antecedentNote : '',
        whatHelpedNote: whatHelped === 'other' ? whatHelpedNote : '',
        settingEventsNote,
      }),
    onSuccess: async () => {
      // The same prefix StudentTimeline invalidates after a share, so every
      // page and kind-filter combination of the timeline is refreshed rather
      // than only the one that happens to be on screen.
      await queryClient.invalidateQueries({ queryKey: ['timeline', studentId] })
      // db/123. The panel counts these logs, so it is wrong the moment one
      // is written or corrected.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.studentPatterns(studentId),
      })
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
                className={`min-h-11 rounded-btn border px-3 py-1.5 text-sm font-semibold ${
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
                className={`min-h-11 rounded-btn border px-3 py-1.5 text-sm font-semibold ${
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

        {/* --- What was going on (db/122) --------------------------------
            THE PLACE THIS DATA WILL ACTUALLY COME FROM. A teacher in the
            middle of an incident is the worst-placed person in the building to
            answer what was happening just before it — they were dealing with
            it. The same teacher at lunchtime answers it in four seconds, and
            this dialog is where they already come to tidy the wording.

            Empty on every log written before db/122, which is what the
            sentence under the legend is for: it reads as an invitation rather
            than as three fields somebody forgot to fill in. */}
        <fieldset className="mt-5 rounded-card border border-border bg-background p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">
            What was going on
          </legend>
          <p className="-mt-1 mb-3 text-xs text-muted-foreground">
            Optional, and worth adding now if it was too busy at the time. It is
            what makes the AI&rsquo;s suggestions specific to this child rather
            than general advice.
          </p>

          {/* CHIPS HERE TOO, for the reason the log modal reverted: this
              dialog also carries a "What happened" textarea, so a dictated
              text field beside it would pose the same question twice. The two
              screens must ask in the same shape or the correction screen reads
              as a different thing from the logging screen. */}
          <ChipRow
            name="edit-antecedent"
            label="Just before"
            options={ANTECEDENTS}
            selected={antecedent}
            onSelect={setAntecedent}
            otherValue={antecedentNote}
            onOtherChange={setAntecedentNote}
            otherLabel="What happened?"
          />
          <ChipRow
            name="edit-helped"
            label="What helped"
            options={WHAT_HELPED}
            selected={whatHelped}
            onSelect={setWhatHelped}
            className="mt-4"
            otherValue={whatHelpedNote}
            onOtherChange={setWhatHelpedNote}
            otherLabel="What did you do?"
          />
          <ChipRow
            name="edit-events"
            label="Anything different that day"
            options={SETTING_EVENTS}
            selected={settingEvents}
            onSelect={setSettingEvents}
            multi
            className="mt-4"
            otherValue={settingEventsNote}
            onOtherChange={setSettingEventsNote}
            otherLabel="What was it?"
          />
        </fieldset>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="pressable min-h-11 rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="pressable min-h-11 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
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
  const dialogRef = useModalDialog(onClose)

  const log = useQuery({
    queryKey: queryKeys.behaviourLog(logId),
    queryFn: () => fetchBehaviourLog(logId),
  })

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
      /*
        m-auto IS LOAD-BEARING AND THIS DIALOG WAS MISSING IT.

        A browser centres a modal <dialog> with `margin: auto`, and Tailwind's
        preflight sets `margin: 0` on everything — so without m-auto the dialog
        opens pinned to the top-left corner of the viewport. Measured against
        the other two dialogs in a 1440x900 window: BehaviourLogModal lands at
        (376, 417); this one landed at (0, 0).

        BehaviourLogModal has carried a comment explaining exactly this since it
        was written. This dialog was written later and did not get it, which is
        how a documented trap catches somebody twice.

        shadow-lifted and the /50 backdrop are the same fix: the other two
        dialogs use both, and a modal that is flatter than its siblings and sits
        behind a paler scrim reads as a different kind of thing.
      */
      className="m-auto w-[min(34rem,92vw)] rounded-card border border-border bg-card p-0 text-foreground shadow-lifted backdrop:bg-black/50"
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
                    author can revise after somebody has formally read it proves
                    nothing. If something in it is wrong, tell an administrator
                    — they can still correct it, and the change is recorded.
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
                className="pressable min-h-11 rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground"
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
