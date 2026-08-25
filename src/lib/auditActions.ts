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
}

export function auditAction(action: string): AuditActionStyle {
  return (
    ACTIONS[action] ?? {
      label: action,
      className: 'bg-background text-muted-foreground',
    }
  )
}
