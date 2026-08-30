import type { ConsentType } from './api'

/**
 * What each consent type means, in words a parent can act on.
 *
 * `enforced` is the honest bit. TWO of these change what the software does.
 * `ai_strategy_generation` is checked by `server/index.js` before any student
 * context is sent. `student_portal_access` is checked by db/074's
 * `my_student_id()` on every single query a student makes, so withdrawing it
 * closes their account the moment it is pressed — no job to run, nothing to
 * re-issue. The other four are records of an agreement the school keeps outside
 * this system.
 *
 * That distinction is shown on screen. A row of six switches where two work and
 * four are filing would be a lie told by omission, and the person it would
 * mislead is a parent making a decision about their child.
 */
export type ConsentCopy = {
  label: string
  /** What agreeing to this allows. */
  allows: string
  /** What actually changes if it is withdrawn. */
  ifWithdrawn: string
  /** Does the software itself act on this today? */
  enforced: boolean
}

export const CONSENT_COPY: Record<ConsentType, ConsentCopy> = {
  ai_strategy_generation: {
    label: 'AI-suggested classroom strategies',
    allows:
      'When a teacher logs an incident, an anonymised description of what happened may be sent to an AI service to suggest classroom strategies. Your child’s name, your family’s names, and any contact details are removed before it is sent.',
    ifWithdrawn:
      'Teachers stop receiving AI suggestions for your child immediately. They can still log behaviour and everything else works as normal.',
    enforced: true,
  },
  data_processing: {
    label: 'Storing your child’s records',
    allows:
      'The school may record behaviour observations, goals, and support notes about your child in MiZanova.',
    ifWithdrawn:
      'This records your request to the school. It does not delete existing records by itself — removal is something you arrange with the school directly.',
    enforced: false,
  },
  parent_portal_access: {
    label: 'Your access to this portal',
    allows:
      'You may sign in to see your child’s shared updates, goals and messages.',
    ifWithdrawn:
      'This records your request. Your sign-in is not switched off automatically — the school does that.',
    enforced: false,
  },
  specialist_referral: {
    label: 'Referral to a specialist',
    allows:
      'The school may refer your child to a learning or wellbeing specialist, who can then see your child’s records.',
    ifWithdrawn:
      'This records your position. It does not remove a specialist who is already assigned — ask the school to do that.',
    enforced: false,
  },
  student_portal_access: {
    label: 'Your child’s own sign-in',
    allows:
      'Your child may sign in to MiZanova themselves and see the goals they are working on at school. They cannot see behaviour notes written about them, anything from the safeguarding record, their plan documents, messages between adults, or anything about any other child.',
    ifWithdrawn:
      'Their sign-in stops working straight away. The account is not deleted and their goals are untouched — they simply see nothing until you agree again.',
    enforced: true,
  },
  photo_media: {
    label: 'Photos and media',
    allows: 'Images or recordings of your child may be stored against their record.',
    ifWithdrawn: 'This records your request to the school.',
    enforced: false,
  },
}

/** Display order: the one that actually does something goes first. */
export const CONSENT_ORDER: ConsentType[] = [
  'ai_strategy_generation',
  // Next to the parent's own portal access, because they are the same kind of
  // question asked about two different people, and a parent deciding about one
  // is the right moment to see the other.
  'student_portal_access',
  'data_processing',
  'specialist_referral',
  'parent_portal_access',
  'photo_media',
]
