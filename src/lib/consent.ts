import type { ConsentType } from './api'

/**
 * What each consent type means, in words a parent can act on.
 *
 * `enforced` is the honest bit. Only `ai_strategy_generation` currently changes
 * what the software does — `server/index.js` calls `has_active_consent()` before
 * any student context is sent, and refuses without it. The other four are
 * records of an agreement the school keeps outside this system.
 *
 * That distinction is shown on screen. A row of five switches where one works
 * and four are filing would be a lie told by omission, and the person it would
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
  'data_processing',
  'specialist_referral',
  'parent_portal_access',
  'photo_media',
]
