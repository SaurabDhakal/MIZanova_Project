import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchStudentProfile,
  queryKeys,
  saveStudentProfile,
  EMPTY_PROFILE,
  type StudentProfile,
} from '../lib/api'
import { ANTECEDENTS, WHAT_HELPED, labelFor } from '../lib/behaviourContext'
import AboutThisChild from './AboutThisChild'
import Icon from './Icon'
import { showToast } from '../lib/toast'

/**
 * The recipe the whole right-hand column uses.
 *
 * There were three of these — this card white with no shadow, Patterns the
 * exact colour of the page, Education plan white with `p-5` and a shadow —
 * so the column read as three unrelated things rather than one record. Same
 * card, same heading shape, same weight. The differences between them should
 * come from what they say, not from how they are drawn.
 */
const CARD = 'rounded-card border border-border bg-card p-5 shadow-raised'

function CardHeading({ firstName }: { firstName: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex shrink-0 rounded-btn bg-brand-navy/10 p-2.5 text-brand-navy">
        <Icon name="user" className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-section text-foreground">About {firstName}</h2>
        <p className="text-xs text-muted-foreground">
          What staff have come to know
        </p>
      </div>
    </div>
  )
}

/**
 * The profile, on the record where it is actually maintained — db/127.
 *
 * The intake form can collect this, but almost nobody will: docs/19 §5.1 is
 * blunt that the office typing six hundred names knows none of it. It is
 * learned in the second week by the person in the room, which is here.
 *
 * READ-ONLY UNTIL SOMEBODY PRESSES EDIT. A record that is permanently a form
 * invites accidental edits and reads as unfinished; a guardian can open this
 * and must see a description of their child rather than a page of inputs they
 * cannot use.
 *
 * EMPTY IS SAID, NOT HIDDEN. A missing profile is the reason suggestions stay
 * general, and hiding the card until it fills up means the one person who could
 * fix that never learns it exists — the same argument BehaviourPatterns makes
 * about the context prompt.
 */
export default function StudentProfileCard({
  studentId,
  firstName,
  canEdit,
}: {
  studentId: string
  firstName: string
  /** Staff only. db/127 lets a guardian read this and not write it. */
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<StudentProfile>(EMPTY_PROFILE)

  const profile = useQuery({
    queryKey: queryKeys.studentProfile(studentId),
    queryFn: () => fetchStudentProfile(studentId),
  })

  const save = useMutation({
    mutationFn: () => saveStudentProfile(studentId, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.studentProfile(studentId),
      })
      // The Patterns panel compares this against the logs, so it is now stale.
      await queryClient.invalidateQueries({
        queryKey: queryKeys.studentPatterns(studentId),
      })
      /* Named, not bare. This was the only toast on the page that did not say
         WHAT it saved, on a page where four different things can be saved. */
      showToast(`About ${firstName} saved.`)
      setEditing(false)
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  // Silent while loading and on failure: this is a supporting card, and an
  // error box above a child's history implies something was lost when it
  // was not.
  if (profile.isLoading || profile.isError) return null

  const p = profile.data
  const helps = (p?.helps ?? [])
    .map((h) => labelFor(WHAT_HELPED, h))
    .filter((h): h is string => Boolean(h))
  const triggers = (p?.triggers ?? [])
    .map((t) => labelFor(ANTECEDENTS, t))
    .filter((t): t is string => Boolean(t))

  const anything =
    Boolean(p?.interests || p?.strengths || p?.finds_hard) ||
    helps.length > 0 ||
    triggers.length > 0

  const startEditing = () => {
    setDraft(p ?? EMPTY_PROFILE)
    setEditing(true)
  }

  if (editing) {
    return (
      <section className={CARD}>
        <CardHeading firstName={firstName} />
        <div className="mt-4">
          <AboutThisChild
            idPrefix={`profile-${studentId}`}
            firstName={firstName}
            value={draft}
            onChange={setDraft}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="pressable min-h-11 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="pressable min-h-11 rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-background"
          >
            Cancel
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <CardHeading firstName={firstName} />
        {canEdit && (
          <button
            type="button"
            onClick={startEditing}
            className="min-h-11 -mr-2 inline-flex min-w-11 items-center justify-center px-3 text-xs font-semibold text-primary hover:underline"
          >
            {anything ? 'Edit' : 'Add'}
          </button>
        )}
      </div>

      {!anything ? (
        <p className="mt-4 max-w-prose text-sm text-muted-foreground">
          {canEdit
            ? `Nothing recorded yet. What ${firstName} loves, is good at, and finds hard is what turns general advice into advice about ${firstName} — and it is the part the AI cannot work out from an incident.`
            : `The school has not recorded anything here yet.`}
        </p>
      ) : (
        <dl className="mt-4 space-y-3">
          {p?.interests && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Loves
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground">
                {p.interests}
              </dd>
            </div>
          )}
          {p?.strengths && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Good at
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground">
                {p.strengths}
              </dd>
            </div>
          )}
          {p?.finds_hard && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Finds hard
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground">
                {p.finds_hard}
              </dd>
            </div>
          )}
          {helps.length > 0 && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Usually helps
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground">
                {helps.join(', ').toLowerCase()}
              </dd>
            </div>
          )}
          {triggers.length > 0 && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Usually sets it off
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground">
                {triggers.join(', ').toLowerCase()}
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  )
}
