import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Spinner from './Spinner'
import { ROLE_CONFIG, type Role } from '../lib/roles'
import { useAuth } from '../lib/auth'
import { titleFor } from '../lib/pageTitles'
import Icon from './Icon'
import Logo from './Logo'
import ContextSwitcher from './ContextSwitcher'
import AccountMenu from './AccountMenu'
import TrialNotice from './TrialNotice'
import PendingLogsBanner from './PendingLogsBanner'
import Toasts from './Toasts'
import UpdatePrompt from './UpdatePrompt'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import GlobalSearch from './GlobalSearch'
import NotificationBell from './NotificationBell'

/**
 * The frame every signed-in screen sits inside: navy sidebar on the left,
 * thin top bar, and the page itself rendered by <Outlet />.
 *
 * The sidebar is hidden on phones and opened with a button, because parents
 * are mobile-first (NFR3) while educators and admins are on laptops.
 */
export default function AppShell({ role }: { role: Role }) {
  const { pathname } = useLocation()
  const config = ROLE_CONFIG[role]
  const { profile } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  /*
   * REMEMBERED, because a preference that resets on every navigation is not a
   * preference. A teacher on a 13-inch school laptop collapses this once and
   * means it; asking again on the next page would be the app forgetting.
   */
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('mizanova.sidebar') === 'collapsed',
  )
  useEffect(() => {
    localStorage.setItem('mizanova.sidebar', collapsed ? 'collapsed' : 'open')
  }, [collapsed])
  const online = useOnlineStatus()

  // FR18: educators and specialists must be verified by an administrator
  // before they are trusted with student records. Saying so plainly beats a
  // screen that is mysteriously empty.
  // Now genuinely load-bearing: db/013 makes can_staff_view_student require
  // verification, so an unverified staff member really does see nothing. The
  // banner explains an empty screen rather than leaving them to guess.
  const awaitingVerification =
    profile !== null &&
    !profile.is_verified &&
    (role === 'educator' || role === 'specialist' || role === 'school_admin')

  /*
   * Collapsed, the icon is the whole control, so it is centred in the rail
   * rather than sitting where a label used to start. Left-aligned icons in an
   * 80px rail read as a list that lost its text, which is exactly what it is
   * and exactly what it should not look like.
   */
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-3 rounded-btn py-2.5',
      collapsed ? 'justify-center px-0' : 'px-3',
      isActive
        ? 'bg-primary font-medium text-primary-foreground'
        : 'text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground',
    ].join(' ')

  /*
   * THE NAV, GROUPED — one pass over the list rather than a hand-written tree.
   * Items with no `group` come first and carry no heading; that is the
   * dashboard, and giving a lone item a heading is worse than giving it none.
   * Groups then appear in the order they first occur in ROLE_CONFIG, so the
   * order is decided where the nav is decided rather than twice.
   */
  const ungrouped = config.nav.filter((item) => !item.group)
  const grouped = config.nav.reduce<{ heading: string; items: typeof config.nav }[]>(
    (acc, item) => {
      if (!item.group) return acc
      const existing = acc.find((g) => g.heading === item.group)
      if (existing) existing.items.push(item)
      else acc.push({ heading: item.group, items: [item] })
      return acc
    },
    [],
  )

  const navItem = (item: (typeof config.nav)[number]) => (
    <li key={item.path}>
      <NavLink
        to={item.path ? `${config.basePath}/${item.path}` : config.basePath}
        end={item.path === ''}
        className={navLinkClass}
        onClick={() => setMenuOpen(false)}
        title={collapsed ? item.label : undefined}
      >
        {/* No label passed, so it is aria-hidden — the link text says
            "Students" already and a screen reader announcing a picture of two
            people first is noise, not help. `shrink-0` because a long label
            must wrap around the icon, not squash it. */}
        <Icon name={item.icon} className="h-5 w-5 shrink-0" />
        {/* Collapsed, the label is still in the accessibility tree — it is
            hidden from sight, not removed. A screen reader user gains nothing
            from a narrower sidebar and would lose the whole nav. */}
        <span className={collapsed ? 'sr-only' : undefined}>{item.label}</span>
      </NavLink>
    </li>
  )

  const sidebar = (
    <div className="flex h-full flex-col">
      {/*
        THE LOGO COLLAPSES THE SIDEBAR. It used to link to "/".

        Nothing became unreachable: "/" goes to RoleRedirect, which sends you
        to your own role's home — and that is already the first item in the nav
        directly below. The link was a second door to the same room.

        The collapse BUTTON at the bottom stays, and that is deliberate rather
        than redundant. A logo you can click is not discoverable: nobody finds
        it without being told. The button is the affordance; this is the
        shortcut for the people who have learned it.
      */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className={`block w-full py-4 ${collapsed ? 'flex justify-center px-0' : 'px-3'}`}
        aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {/* The crop is transparent, so it sits on the navy without the white
            rectangle the supplied file would have put there. */}
        <Logo variant={collapsed ? 'mark' : 'full'} tone="dark-background" />
      </button>

      {/* WHERE YOU ARE WORKING, AT THE TOP. It used to sit in the page header
          beside Sign out, which is where somebody looks to leave rather than
          to check which school they are in. Somebody who holds memberships at
          three schools needs that answer before they read anything else on
          the screen. */}
      {!collapsed && (
        <div className="mb-3 px-3">
          <ContextSwitcher />
        </div>
      )}

      <nav aria-label="Main" className="flex-1 overflow-y-auto">
        {ungrouped.length > 0 && (
          <ul className="space-y-1">{ungrouped.map(navItem)}</ul>
        )}

        {grouped.map((group) => (
          <div key={group.heading} className="mt-5 first:mt-0">
            {/* The heading is decoration for the eye and structure for a
                screen reader, so the <ul> is labelled by it rather than the
                text being read as a stray line. */}
            {!collapsed && (
              <h2
                id={`nav-${group.heading.replace(/\s+/g, '-')}`}
                className="px-3 pb-1.5 text-xs font-semibold tracking-wider text-sidebar-muted uppercase"
              >
                {group.heading}
              </h2>
            )}
            <ul
              className="space-y-1"
              aria-labelledby={
                collapsed ? undefined : `nav-${group.heading.replace(/\s+/g, '-')}`
              }
            >
              {group.items.map(navItem)}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom of the sidebar: what this school is paying, and the collapse.
          Both are things you check occasionally and never hunt for. */}
      <div className="mt-4 border-t border-white/10 pt-3">
        <TrialNotice />
        {/* SAURAB ASKED FOR A SETTINGS BUTTON HERE, and this is the honest
            version of it. There is no Settings section: `/account/security` is
            the only account-level page that exists, so a button labelled
            "Settings" would be a promise the destination does not keep. It is
            called what it opens. A real Settings mode — account, school and
            notification preferences under one roof, with its own sidebar — is
            ranked 9th in docs/14-Interface-Direction.md §4 and is its own job.

            It duplicates the account menu on purpose: with the rail collapsed
            to icons this is the nearer target, which is exactly when he asked
            for it. */}
        {/* Settings, not "Account" pointing at Security. The label said one
            thing and the destination was another, so somebody looking for
            their own details landed on two-factor and concluded there was no
            settings screen. Points at the section's first tab now. */}
        <NavLink
          to="/account/profile"
          title={collapsed ? 'Settings' : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-btn py-2 text-sm hover:bg-white/10 hover:text-sidebar-foreground ${
              collapsed ? 'justify-center px-0' : 'px-3'
            } ${isActive ? 'text-sidebar-foreground' : 'text-sidebar-muted'}`
          }
        >
          <Icon name="user" className="h-4 w-4 shrink-0" />
          <span className={collapsed ? 'sr-only' : undefined}>Settings</span>
        </NavLink>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className={`hidden w-full items-center gap-3 rounded-btn py-2 text-sm text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground md:flex ${collapsed ? 'justify-center px-0' : 'px-3'}`}
        >
          <Icon
            name="collapse"
            className={`h-4 w-4 shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`}
          />
          <span className={collapsed ? 'sr-only' : undefined}>
            Collapse menu
          </span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen">
      {/* WCAG 2.4.1, Bypass Blocks. The sidebar repeats on every screen, so a
          keyboard user was tabbing through every nav item before reaching the
          page — on a roster of thirty students, on every single navigation.
          Hidden until focused, then it appears as the first thing you reach. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-btn focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/*
        Desktop sidebar — always visible from `md` up, and it STAYS PUT.

        It used to scroll away with the page: measured on Global Overview, the
        sidebar top went from -1 to -126 on a 126px scroll, and so did the
        header. On a long screen — Screening, or a roster — you scrolled to the
        bottom and the navigation was somewhere above you, so getting anywhere
        else meant scrolling back up first. Every role, every long page.

        `self-start` matters and is easy to leave out. A flex child stretches to
        the row's height by default, and an item already as tall as its
        container has nothing to stick within — `sticky` silently does nothing.
        `h-screen` then makes it exactly one viewport, and `overflow-y-auto`
        lets a long nav scroll inside itself rather than pushing the collapse
        control off the bottom.
      */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 self-start overflow-y-auto bg-sidebar p-4 transition-[width] md:block ${collapsed ? 'w-20' : 'w-60'}`}
      >
        {sidebar}
      </aside>

      {/* Mobile drawer — same markup, slid in over the page. */}
      {menuOpen && (
        <div className="fixed inset-0 z-20 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative h-full w-64 bg-sidebar p-4">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky too, and for the same reason: search, the account menu and
            the page title are all things you reach for mid-page. `z-10` so the
            page scrolls underneath rather than through it — the search results
            panel inside carries its own z-index within this context. */}
        <header className="print-hide sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-3 md:px-8">
          <button
            type="button"
            className="rounded-btn border border-border px-3 py-2 text-sm font-medium md:hidden"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            Menu
          </button>
          {/* CENTRED IN THE BAR, not in what is left of it.
              A flex-1 wrapper looks centred and is not: the account menu is
              ~250px and the sidebar is not, so the box lands about half the
              account menu's width to the left — measured at 129px off on a
              903px viewport. Absolute positioning from the header's own centre
              is the only version that is actually centred.

              XL AND ABOVE ONLY, and the number is measured rather than picked.
              A centred 448px box has to clear the account menu on the right:
              at 1280 it does, with 68px to spare, and at 903 it overlapped by
              178px. Below xl it goes back into flow, which centres it in the
              space that is left and can never collide.

              The account menu used to carry a full email address at 246px —
              wide enough that a fallback nobody chose was setting this
              breakpoint. It is 189px now, avatar and role only, which is why
              1280 has room at all. See the note in AccountMenu.tsx.

              Renders nothing at all for a parent: one to three children,
              already on the screen in front of them. */}
          <div className="flex flex-1 justify-center px-2 xl:absolute xl:left-1/2 xl:w-full xl:max-w-md xl:-translate-x-1/2 xl:px-0">
            <GlobalSearch role={role} basePath={config.basePath} />
          </div>

          {/* ONE CONTROL, NOT THREE. This was a name, a `Security` button and a
              `Sign out` button, all three flat and all three the same weight.
              Saurab: "security on top seems so lame", "signout seems so pale".
              They were never peers — opening a security page is routine, and
              signing out ends the session on a shared school laptop — so they
              now sit behind the avatar with sign out separated and coloured. */}
          <div className="ml-auto flex items-center gap-1 md:gap-2">
            {/* Left of the account menu, as the Figma has it. Every role gets
                one, and every role's lines are counted from work that is really
                waiting — see NotificationBell. */}
            <NotificationBell role={role} basePath={config.basePath} />
            <AccountMenu roleLabel={config.label} />
          </div>
        </header>

        {/* tabIndex={-1} so the skip link can actually move focus here. A
            plain anchor jump scrolls but leaves focus behind, and the next Tab
            carries on from the sidebar as if nothing happened.

            aria-label NAMES THE REGION AFTER THE PAGE. Focus lands here on
            every route change (see DocumentTitle), and an unnamed <main>
            announces itself as "main" — true, and no use to somebody who has
            just navigated and wants to know where they are. */}
        <main
          id="main-content"
          tabIndex={-1}
          aria-label={titleFor(pathname)}
          className="flex-1 p-4 md:p-8"
        >
          <UpdatePrompt />

          {/* The app opens offline because the shell is cached; student
              records are NOT cached, on purpose (see vite.config.ts). So the
              screens below will fail to load, and that needs saying — an
              unexplained "could not load this data" reads as a broken app
              rather than a missing connection. */}
          {!online && (
            <div
              role="status"
              className="mb-6 rounded-card border border-warning bg-warning-subtle p-4"
            >
              <p className="font-semibold text-warning-foreground">
                You are offline
              </p>
              <p className="mt-1 max-w-prose text-sm text-warning-foreground">
                You can still record what you are seeing now — new behaviour
                logs are kept on this device and upload by themselves. Existing
                records will not load: they are never stored on the device,
                because these laptops are shared.
              </p>
            </div>
          )}

          {awaitingVerification && (
            <div
              role="status"
              className="mb-6 rounded-card border border-warning bg-warning-subtle p-4"
            >
              <p className="font-semibold text-warning-foreground">
                Your account is awaiting verification
              </p>
              <p className="mt-1 max-w-prose text-sm text-warning-foreground">
                You cannot see any student records until Special Miles has
                verified your identity. Screens below will be empty — that is
                not a fault.
                {!profile?.school_id &&
                  ' Your account also has no school assigned yet.'}
              </p>
            </div>
          )}
          {/* Only educators and specialists write behaviour logs, so only they
              can have a queue. Rendering it for everyone would mean a parent
              seeing a banner about records they cannot create. */}
          {(role === 'educator' || role === 'specialist') && (
            <PendingLogsBanner />
          )}
          {/* Inside the shell, not around the whole router. A boundary higher
              up would blank the sidebar and header every time a lazy screen
              loaded, so moving between pages would flash the entire layout.
              Here, only the page area waits. */}
          <Suspense fallback={<Spinner label="Loading this screen" />}>
            <Outlet />
          </Suspense>
        </main>

        {/* Always mounted, for everyone. A live region has to be in the
            document BEFORE its content arrives or screen readers routinely
            skip the announcement. */}
        <Toasts />
      </div>
    </div>
  )
}
