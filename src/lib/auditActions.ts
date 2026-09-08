/**
 * What an audit action is called when a person reads it.
 *
 * WHY THIS IS SHARED. The Audit Log had this map and Global Overview did not,
 * so the same event read "Staff verified" on one screen and
 * `staff.verification_withdrawn` on the other. The overview is the screen a
 * platform admin lands on, so the raw one was the one they saw first.
 *
 * THE MAP WAS ALSO HALF EMPTY. It listed two of the four actions the database
 * actually writes, and the fallback prints whatever it was given — which is how
 * `staff_moved_school` ended up on screen six times in a row, in a product that
 * shows a child's name as "Ethan M." out of care for what appears on screens.
 *
 * ON THE NAMING. Three actions use a dot and one uses an underscore, because
 * db/015, db/018 and db/036 were written months apart. Those files are applied
 * and applied files are never edited, so the inconsistency is absorbed here
 * rather than papered over with a rename that would break the audit trail.
 *
 * THE FALLBACK STILL PRINTS THE RAW ACTION, deliberately. A new action added in
 * SQL should look wrong on screen — that is how anyone notices it needs a name,
 * and it is better than an audit trail quietly labelling something "Unknown".
 */
export type AuditActionStyle = { label: string; className: string }

const ACTIONS: Record<string, AuditActionStyle> = {
  'staff.verified': {
    label: 'Staff verified',
    className: 'bg-success-subtle text-success-foreground',
  },
  'staff.verification_withdrawn': {
    label: 'Verification withdrawn',
    className: 'bg-danger-subtle text-danger-foreground',
  },
  'staff.mfa_reset': {
    label: 'Two-factor reset',
    className: 'bg-warning-subtle text-warning-foreground',
  },
  staff_moved_school: {
    label: 'Moved school',
    className: 'bg-background text-muted-foreground',
  },

  // db/064. Everything a platform admin does to a school, an invoice, an
  // application or an enquiry. Added here at the same time as the triggers:
  // the fallback below renders an unmapped action as its raw enum, which is
  // exactly the fault that had Global Overview showing 'staff_moved_school'
  // while the audit log two clicks away said 'Moved school'.
  'school.created': {
    label: 'School created',
    className: 'bg-primary-subtle text-primary',
  },
  // Not styled as a failure. Suspending is a commercial state, not an
  // incident, and one colour has to cover a school going onto trial as well.
  'school.status_changed': {
    label: 'School status changed',
    className: 'bg-warning-subtle text-warning-foreground',
  },
  'invoice.voided': {
    label: 'Invoice voided',
    className: 'bg-danger-subtle text-danger-foreground',
  },
  // Whether somebody may work with children. The one on this list that is
  // about a person rather than an account or a sum of money.
  'application.decided': {
    label: 'Application decided',
    className: 'bg-success-subtle text-success-foreground',
  },
  'enquiry.triaged': {
    label: 'Enquiry triaged',
    className: 'bg-background text-muted-foreground',
  },

  // db/065. Corrections to a child's record, rather than its creation. These
  // are the entries a parent, an auditor or a court asks about.
  'behaviour_log.edited': {
    label: 'Behaviour log edited',
    className: 'bg-warning-subtle text-warning-foreground',
  },
  'behaviour_log.deleted': {
    label: 'Behaviour log deleted',
    className: 'bg-danger-subtle text-danger-foreground',
  },
  'goal.edited': {
    label: 'Goal edited',
    className: 'bg-background text-muted-foreground',
  },
  'goal.status_changed': {
    label: 'Goal status changed',
    className: 'bg-warning-subtle text-warning-foreground',
  },
  'goal.deleted': {
    label: 'Goal deleted',
    className: 'bg-danger-subtle text-danger-foreground',
  },

  // db/068. These three were built in the Audit Log's own render by comparing
  // was_enabled with now_enabled, which read fine and could not be filtered on:
  // the server had no such column, so the Action filter only ever worked over
  // rows already downloaded. The view derives them now, so they get the same
  // server-side treatment as everything above.
  'ai.enabled': {
    label: 'AI turned ON',
    className: 'bg-primary-subtle text-primary',
  },
  // The one AI event styled as a loss. Turning the assistant off is a decision
  // somebody will be asked to account for.
  'ai.disabled': {
    label: 'AI turned OFF',
    className: 'bg-danger-subtle text-danger-foreground',
  },
  'ai.threshold_changed': {
    label: 'Routing threshold changed',
    className: 'bg-primary-subtle text-primary',
  },
  /*
   * db/078. Named separately from the threshold because it is a different kind
   * of decision: the threshold trades caution against review work, this one
   * decides how much money can be spent in a day. Before db/078 a limit change
   * was not recorded at all, and would have appeared here as a threshold
   * change — a true-looking entry describing something that did not happen.
   */
  'ai.limit_changed': {
    label: 'AI daily limit changed',
    className: 'bg-warning-subtle text-warning-foreground',
  },

  // db/066. A school correcting its own name, suburb, state, timezone or ABN.
  'school.details_changed': {
    label: 'School details changed',
    className: 'bg-background text-muted-foreground',
  },
}

/**
 * Every action this product knows how to name, newest last.
 *
 * THE FILTER USED TO BE BUILT FROM WHATEVER WAS ON SCREEN. That is fine while
 * the screen holds everything and wrong the moment it is paginated: an action
 * with no rows in the current page simply vanished from the dropdown, so the
 * filter could not be used to find out that nothing had happened — which is a
 * real and common question to ask an audit log.
 *
 * Offering an action with no matches is the honest version. "No entry matches
 * that" is an answer; an absent option is not.
 */
export const AUDIT_ACTION_CODES = Object.keys(ACTIONS)

export function auditAction(action: string): AuditActionStyle {
  return (
    ACTIONS[action] ?? {
      label: action,
      className: 'bg-background text-muted-foreground',
    }
  )
}
