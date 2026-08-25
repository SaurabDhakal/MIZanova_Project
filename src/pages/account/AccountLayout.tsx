import { NavLink, Outlet } from 'react-router-dom'
import { ROLE_CONFIG, type Role } from '../../lib/roles'
import { useAuth } from '../../lib/auth'

/**
 * The Settings shell — one header, one row of tabs, and whichever tab is open.
 *
 * ---------------------------------------------------------------------------
 * TAKEN FROM THE FIGMA, "Account & Professional Profile"
 * ---------------------------------------------------------------------------
 * That design is a SECTION, not a page: a "Settings" heading with a subtitle,
 * a row of tabs beneath it — Account, Security & 2FA, Clinical preferences,
 * Notifications, Caseload settings, Audit log — and the content below. The
 * first build here was one long scroll with a heading per card, which is what
 * you get when a section is treated as a page.
 *
 * ONLY TWO TABS ARE HERE, and the missing four are the point. Clinical
 * preferences, caseload settings and a per-user audit log have no tables behind
 * them. Rendering six tabs where two work would put four dead ends in a
 * navigation bar. They arrive when they mean something.
 *
 * NOTIFICATIONS STAYS OUT EVEN NOW THERE IS A BELL, and for a different reason
 * than the other three. The bell counts work that is genuinely waiting — see
 * NotificationBell — so there is no delivery to switch off and no digest to
 * schedule. A settings tab whose only honest content is "these cannot be turned
 * off" is worse than no tab. It earns its place the day the product actually
 * sends something.
 *
 * ---------------------------------------------------------------------------
 * EVERY ROLE, and the subtitle says which one
 * ---------------------------------------------------------------------------
 * The design says "Specialist account & professional profile" because it was
 * drawn for a specialist. The same screen serves all five here, so the role
 * comes from the profile rather than the mock.
 */

/*
 * The School tab is a school admin's and nobody else's.
 *
 * A platform admin already manages every school from Schools, with controls a
 * school must not have — status, kind, closing it. Showing them a second,
 * weaker version of the same screen would be two doors to one room where one
 * of them is worse. Everyone else has no school-level authority at all, so for
 * them the tab would be a read-only curiosity about their employer.
 */
const TABS: { to: string; label: string; roles?: Role[] }[] = [
  { to: '/account/profile', label: 'Account' },
  { to: '/account/security', label: 'Security & 2FA' },
  { to: '/account/school', label: 'School', roles: ['school_admin'] },
]

export default function AccountLayout() {
  const { profile } = useAuth()
  const roleLabel = profile ? ROLE_CONFIG[profile.role].label : ''

  return (
    <div>
      <header className="mb-1">
        <h1 className="text-title text-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          {roleLabel ? `${roleLabel} account` : 'Your account'} and how you sign
          in.
        </p>
      </header>

      {/*
        A real tablist. `aria-current="page"` comes from NavLink and is what a
        screen reader announces; the underline is for everybody else. Both are
        needed — colour alone would fail 1.4.1, and this is the only thing on
        screen saying which of two similar pages you are on.
      */}
      <nav
        aria-label="Settings sections"
        className="mt-5 flex gap-1 border-b border-border"
      >
        {TABS.filter(
          (tab) => !tab.roles || (profile && tab.roles.includes(profile.role)),
        ).map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-semibold ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  )
}
