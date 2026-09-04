import type { IconName } from './icons'

/**
 * The five MiZanova roles, their URLs, and the navigation each one sees.
 *
 * This file is the single source of truth for role-based navigation. When we
 * add real authentication (build order step 8) the logged-in user's role comes
 * out of Supabase and is looked up here — nothing else needs to change.
 *
 * Do not add a sixth role without agreeing it first (see 01-Project-Guidebook).
 */

/**
 * Role identifiers, stored exactly like this in the database.
 * These strings get compiled into Row-Level Security policies, so renaming one
 * later means rewriting every policy at once. See docs/03-Decisions-Log.md D2.
 *
 * `super_admin` is retired — Super Admin was merged into Platform Admin.
 */
export const ROLES = [
  'educator',
  'parent',
  'specialist',
  'school_admin',
  'platform_admin',
  // db/074. Last, because it is the newest and because order here decides the
  // order things are listed in wherever roles are enumerated.
  'student',
] as const

/** A union type: 'educator' | 'parent' | … TypeScript will now reject typos. */
export type Role = (typeof ROLES)[number]

/**
 * The only roles a person may choose for themselves when signing up.
 *
 * This list must stay identical to the one in the `handle_new_user` trigger in
 * db/001_foundation.sql. The database is the real gate — anything else claimed
 * at signup silently becomes 'parent'. This constant only stops the UI from
 * offering a choice that would be quietly overridden.
 *
 * School Admin and Platform Admin are granted by running SQL deliberately.
 * There is no admin signup flow and there must not be one.
 */
/**
 * ONE role can be chosen by the person signing up: parent.
 *
 * Staff arrive by invitation — a school says "this person works here", and
 * `redeem_invitation` sets the role with the school attached and verification
 * granted in the same transaction. Self-signup let somebody make that claim
 * about themselves, and produced accounts nobody recognised that could never
 * go anywhere.
 *
 * This list only decides what the signup page offers. The enforcement is
 * `handle_new_user` in db/044, because the role arrives in metadata written by
 * the browser and a shorter list here changes nothing about what can be sent.
 */
export const SELF_SIGNUP_ROLES = ['parent'] as const
export type SelfSignupRole = (typeof SELF_SIGNUP_ROLES)[number]

/**
 * Roles that must have two-factor authentication.
 *
 * Everyone here can open records about identifiable children — a stolen
 * password should not be enough on its own. Parents are excluded: they see
 * their own child and nobody else's, and locking a family out of the daily
 * summary because they changed phones does more harm than the risk it removes.
 * They can still turn it on voluntarily.
 */
export const MFA_REQUIRED_ROLES: Role[] = [
  'educator',
  'specialist',
  'school_admin',
  'platform_admin',
]

/**
 * "a" or "an", for a role label read aloud.
 *
 * The first screen an invited person ever sees said "You have been invited to
 * join Parramatta West Primary School as a Educator." Educator is the only
 * label here that begins with a vowel, which is exactly why it survived: five
 * of the six roles read correctly and the sixth was never the one anybody
 * tested with.
 *
 * On the letter, not a dictionary. Every label this is used with is an
 * ordinary word, and no role is ever going to be a "unicorn" or an "hour".
 */
export function article(label: string): string {
  return /^[aeiou]/i.test(label) ? 'an' : 'a'
}

/** Where someone with this role lands after signing in. */
export function pathForRole(role: Role): string {
  return ROLE_CONFIG[role].basePath
}

/**
 * What the ⌘K palette searches for this role, or null for no palette.
 *
 * THIS IS ABOUT DESTINATIONS, NOT PERMISSIONS. Educators, specialists and
 * school admins have a `students/:id` route; a platform admin has
 * `tenants/:schoolId` and no student record to open; a parent has neither, and
 * one to three children already in front of them.
 *
 * Who may SEE which child is decided by `can_view_student` in the database.
 * Nothing here filters results and nothing here should ever start to — the
 * same search returns an educator their assigned children and a platform admin
 * everybody, because the policy answers differently, not because this does.
 *
 * It lives beside the routes rather than in the palette because it is role
 * configuration, and because a component file that also exports a helper
 * breaks fast refresh.
 */
export function paletteKindFor(role: Role): 'students' | 'schools' | null {
  if (role === 'educator' || role === 'specialist' || role === 'school_admin') {
    return 'students'
  }
  if (role === 'platform_admin') return 'schools'
  return null
}

export type NavItem = {
  /** URL segment after the role's base path. Empty string = the landing page. */
  path: string
  label: string
  /**
   * Which drawing sits beside the label — see `components/Icon.tsx`.
   *
   * REQUIRED, not optional. The sidebar is generated from this list, so an
   * optional icon would mean a nav where some items have one and some do not,
   * and nobody would notice until a screenshot. Typed against the icon set, so
   * a name that does not exist fails the build rather than rendering nothing.
   */
  icon: IconName
  /**
   * The heading this item sits under, or absent for the one or two items that
   * belong above every group — a dashboard, a home.
   *
   * OPTIONAL, UNLIKE `icon`, and deliberately. Educator has four items and
   * grouping four things is fussier than leaving them alone. Platform admin
   * has ten, which is where a flat list quietly stops being scannable — it
   * never breaks, it just grows one item at a time until nobody reads it.
   */
  group?: string
  /** Roadmap milestone that builds this, so the placeholder can say so. */
  milestone: string
}

export type RoleConfig = {
  /** Human-readable name shown in the sidebar and role picker. */
  label: string
  /** One-line description of what this role does. */
  summary: string
  /**
   * URL prefix. Note the hyphen: the database says `school_admin` but the URL
   * says `/school-admin`, because underscores in URLs are a readability trap
   * (they disappear under a link's underline).
   */
  basePath: string
  nav: NavItem[]
}

export const ROLE_CONFIG: Record<Role, RoleConfig> = {
  educator: {
    label: 'Educator',
    summary: 'Logs behaviour in under 20 seconds and receives AI strategies.',
    basePath: '/educator',
    nav: [
      { path: '', label: 'Dashboard', icon: 'dashboard', milestone: 'M4' },
      { path: 'students', label: 'Students', icon: 'students', group: 'Your school', milestone: 'M4' },
      { path: 'messages', label: 'Messages', icon: 'messages', group: 'Keeping in touch', milestone: 'M9' },
      { path: 'resources', label: 'Shared Resources', icon: 'resources', group: 'Keeping in touch', milestone: 'M12' },
      { path: 'schedule', label: 'Schedule', icon: 'schedule', milestone: 'M10' },
      // db/075. Professional development for school staff.
      { path: 'academy', label: 'Academy', icon: 'resources', group: 'Keeping in touch', milestone: 'M15' },
      // db/079. Reading, as opposed to the Academy's doing.
      { path: 'library', label: 'Library', icon: 'resources', group: 'Keeping in touch', milestone: 'M15' },
    ],
  },

  parent: {
    label: 'Parent',
    summary:
      'Sees the daily summary (first name only), logs home observations, tracks goals.',
    basePath: '/parent',
    nav: [
      { path: '', label: 'Home', icon: 'home', milestone: 'M7' },
      // First in the group on purpose: it answers who your child IS and who can
      // see them, which is the frame for everything under it.
      { path: 'about', label: 'About your child', icon: 'students', group: 'Your child', milestone: 'M7' },
      { path: 'progress', label: 'Progress Highlights', icon: 'progress', group: 'Your child', milestone: 'M7' },
      { path: 'goals', label: 'Goals & IEP', icon: 'goals', group: 'Your child', milestone: 'M8' },
      { path: 'observations', label: 'Home Observations', icon: 'observations', group: 'Your child', milestone: 'M7' },
      // db/073. A family could not see a booking at all — db/059 gave the
      // read to the assigned specialist and to nobody at home.
      { path: 'appointments', label: 'Appointments', icon: 'schedule', group: 'Your child', milestone: 'M13' },
      { path: 'messages', label: 'Messages', icon: 'messages', group: 'Keeping in touch', milestone: 'M9' },
      { path: 'resources', label: 'Resources', icon: 'resources', group: 'Keeping in touch', milestone: 'M12' },
      // db/075. The Academy carries Empowered Parenting for this audience.
      { path: 'academy', label: 'Academy', icon: 'resources', group: 'Keeping in touch', milestone: 'M15' },
      { path: 'link-child', label: 'Link a child', icon: 'link', group: 'Your account', milestone: 'M7' },
      { path: 'privacy', label: 'Privacy & Consent', icon: 'privacy', group: 'Your account', milestone: 'M7' },
      { path: 'finance', label: 'Collab & Finance', icon: 'finance', group: 'Your account', milestone: 'M11' },
      // db/079. Reading, as opposed to the Academy's doing.
      { path: 'library', label: 'Library', icon: 'resources', group: 'Keeping in touch', milestone: 'M15' },
    ],
  },

  specialist: {
    label: 'Specialist',
    summary:
      'Reviews AI suggestions flagged for a human, runs sessions, manages a caseload.',
    basePath: '/specialist',
    nav: [
      { path: '', label: 'Command Centre', icon: 'dashboard', milestone: 'M10' },
      { path: 'caseload', label: 'Caseload', icon: 'caseload', group: 'Your work', milestone: 'M10' },
      { path: 'review-queue', label: 'Review Queue', icon: 'review', group: 'Your work', milestone: 'M6' },
      { path: 'schedule', label: 'Schedule', icon: 'schedule', group: 'Your work', milestone: 'M10' },
      // A specialist could always be MESSAGED — start_message_thread puts any
      // two of a child's care team in a thread — and until now had no screen to
      // read it on. See pages/specialist/Messages.tsx.
      { path: 'messages', label: 'Messages', icon: 'messages', group: 'Keeping in touch', milestone: 'M9' },
      { path: 'resources', label: 'Resources', icon: 'resources', group: 'Library', milestone: 'M12' },
      { path: 'academy', label: 'Academy', icon: 'resources', group: 'Keeping in touch', milestone: 'M15' },
      // db/079. Reading, as opposed to the Academy's doing.
      { path: 'library', label: 'Library', icon: 'resources', group: 'Keeping in touch', milestone: 'M15' },
    ],
  },

  school_admin: {
    label: 'School Admin',
    summary:
      'Anonymised KPIs, the safeguarding queue, staff access and compliance.',
    basePath: '/school-admin',
    nav: [
      { path: '', label: 'Command Centre', icon: 'dashboard', milestone: 'M13' },
      { path: 'students', label: 'Students', icon: 'students', group: 'Your school', milestone: 'M13' },
      { path: 'people', label: 'People', icon: 'people', group: 'Your school', milestone: 'M13' },
      { path: 'directory', label: 'Directory & Access', icon: 'directory', group: 'Your school', milestone: 'M13' },
      { path: 'safeguarding', label: 'Safeguarding', icon: 'safeguarding', group: 'Oversight', milestone: 'M13' },
      { path: 'kpis', label: 'Performance KPIs', icon: 'kpis', group: 'Oversight', milestone: 'M13' },
      { path: 'compliance', label: 'Compliance', icon: 'compliance', group: 'Oversight', milestone: 'M15' },
      { path: 'access-log', label: 'Record Access', icon: 'recordAccess', group: 'Oversight', milestone: 'M15' },
      // Outward only: db/009 lets an administrator open a conversation with a
      // family or teacher at their school, and nobody can open one with them.
      // See pages/schoolAdmin/Messages.tsx.
      { path: 'messages', label: 'Messages', icon: 'messages', group: 'Keeping in touch', milestone: 'M9' },
      { path: 'invoices', label: 'Invoices', icon: 'invoices', group: 'Billing', milestone: 'M11' },
      { path: 'academy', label: 'Academy', icon: 'resources', group: 'Keeping in touch', milestone: 'M15' },
      // db/079. Reading, as opposed to the Academy's doing.
      { path: 'library', label: 'Library', icon: 'resources', group: 'Keeping in touch', milestone: 'M15' },
    ],
  },

  platform_admin: {
    label: 'Platform Admin',
    summary:
      'Special Miles staff: schools, teacher verification, billing, AI controls, audit.',
    basePath: '/platform-admin',
    nav: [
      { path: '', label: 'Global Overview', icon: 'dashboard', milestone: 'M14' },
      { path: 'tenants', label: 'Schools', icon: 'schools', group: 'Customers', milestone: 'M14' },
      { path: 'enquiries', label: 'Enquiries', icon: 'enquiries', group: 'Customers', milestone: 'M14' },
      { path: 'billing', label: 'Billing & Revenue', icon: 'finance', group: 'Customers', milestone: 'M14' },
      // db/072. A SEPARATE ENTRY FROM BILLING, not a tab on it. Billing is a
      // school invoicing a family for a named child; this is Special Miles
      // invoicing the school. Two piles of money with different payers, and a
      // combined total would mean nothing — Saurab read the Billing screen and
      // asked how Special Miles bills a school, which is the confusion one
      // shared screen would make permanent.
      { path: 'subscriptions', label: 'Subscriptions', icon: 'invoices', group: 'Customers', milestone: 'M14' },
      { path: 'applications', label: 'Specialist Applications', icon: 'applications', group: 'The network', milestone: 'M14' },
      { path: 'screening', label: 'Screening', icon: 'screening', group: 'The network', milestone: 'M14' },
      // "Staff", not "Teacher": educators, specialists AND school admins all
      // appear on that screen and all three need verifying before they can see
      // a child's record. The old label described a third of the list.
      { path: 'verification', label: 'Staff Verification', icon: 'verification', group: 'The network', milestone: 'M14' },
      // db/075. The CMS half of the brief's requirement 4.
      { path: 'courses', label: 'Courses', icon: 'resources', group: 'The network', milestone: 'M15' },
      { path: 'articles', label: 'Articles', icon: 'resources', group: 'The network', milestone: 'M15' },
      { path: 'ai-governance', label: 'AI Governance', icon: 'ai', group: 'Oversight', milestone: 'M14' },
      { path: 'audit', label: 'Audit Log', icon: 'audit', group: 'Oversight', milestone: 'M14' },
      { path: 'record-access', label: 'Record Access', icon: 'recordAccess', group: 'Oversight', milestone: 'M14' },
    ],
  },
  /*
   * ONE ITEM, BECAUSE THERE IS ONE THING A STUDENT MAY SEE. db/074 gives a
   * student their own goals and deliberately nothing else — no behaviour logs,
   * no IEP, no messages, no safeguarding. A second nav entry would have to lead
   * somewhere empty, which reads as "not built yet" rather than "not yours".
   */
  student: {
    label: 'Student',
    summary: 'A young person seeing the goals they are working on at school.',
    basePath: '/student',
    nav: [
      { path: '', label: 'My goals', icon: 'goals', milestone: 'M15' },
      // db/075. Executive functioning and self-advocacy courses are written
      // for this audience by name in the brief, so this is content FOR them
      // rather than another window onto records ABOUT them.
      { path: 'academy', label: 'Academy', icon: 'resources', milestone: 'M15' },
      { path: 'library', label: 'Library', icon: 'resources', milestone: 'M15' },
    ],
  },
}

/** Look up a role from a URL like '/parent/goals'. Returns undefined if none. */
export function roleFromPath(pathname: string): Role | undefined {
  return ROLES.find(
    (role) =>
      pathname === ROLE_CONFIG[role].basePath ||
      pathname.startsWith(`${ROLE_CONFIG[role].basePath}/`),
  )
}
