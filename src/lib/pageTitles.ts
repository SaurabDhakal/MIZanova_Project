import { ROLES, ROLE_CONFIG } from './roles'

/**
 * What to call the screen at a given path.
 *
 * ITS OWN MODULE because two things need it and neither is the other's
 * child: <DocumentTitle> writes it to the tab, and <AppShell> puts it on the
 * <main> region so that focus landing there on a route change announces
 * where you are. Exporting it from the component tripped the fast-refresh
 * rule, which is right — a file that exports a component should export only
 * components.
 */
const PUBLIC_TITLES: Record<string, string> = {
  // NOT "MiZanova — support every learner": DocumentTitle appends " · MiZanova"
  // to every title, so carrying the name here too put it in the browser tab
  // twice — on the landing page, which is the first tab anybody opens.
  '/': 'Support every learner',
  '/pricing': 'Pricing',
  '/enquiry': 'Talk to us',
  '/for-specialists': 'Join the network',
  '/for-schools': 'For schools',
  '/for-parents': 'For families',
  '/for-individuals': 'For individuals',
  '/about': 'About',
  '/features': 'Features',
  '/security': 'Security',
  '/safeguarding': 'Safeguarding',
  '/privacy': 'How your data is handled',
  '/cookies': 'Cookies',
  '/help': 'Help',
  '/status': 'Service status',
  '/login': 'Sign in',
  '/signup': 'Join MiZanova',
  '/forgot-password': 'Reset your password',
  '/reset-password': 'Choose a new password',
  '/verify-2fa': 'Enter your code',
  '/recover-2fa': 'Use a recovery code',
  '/account/security': 'Security',
  '/account/profile': 'Your account',
  '/account/school': 'Your school',
  '/design-tokens': 'Design tokens',
  '/link': 'Connect to your child',
}

export function titleFor(pathname: string): string {
  const exact = PUBLIC_TITLES[pathname]
  if (exact) return exact

  /*
   * A ROUTE WHOSE NAME CARRIES A TOKEN. `/invite/:token` matched no exact key
   * and no role section, so it fell all the way through to "Page not found" —
   * on a working page, in the browser tab and in what a screen reader
   * announces on arrival. The first thing an invited person ever sees of this
   * product told them it did not exist.
   */
  if (pathname.startsWith('/invite/')) return 'Your invitation'

  // Role sections: match the sidebar label, so the tab says the same words the
  // person clicked. Longest path first, or '' would match everything.
  for (const role of ROLES) {
    const config = ROLE_CONFIG[role]
    if (
      pathname !== config.basePath &&
      !pathname.startsWith(`${config.basePath}/`)
    ) {
      continue
    }

    const items = [...config.nav].sort((a, b) => b.path.length - a.path.length)
    for (const item of items) {
      const full = item.path ? `${config.basePath}/${item.path}` : config.basePath

      /*
       * THE LANDING PAGE MATCHES ITS OWN URL AND NOTHING BELOW IT.
       *
       * Sorting longest-first puts the index item (path '') last, which looks
       * like it defers to everything else — but its `full` is the base path, so
       * `startsWith(base + '/')` swallowed every sub-path that no nav item
       * claimed, and it did so before the detail-page fallback underneath could
       * run.
       *
       * The educator never noticed because `students` is one of their nav
       * items. A specialist reaches a child through `caseload`, so every
       * `/specialist/students/<id>` — the record, its plans, the plan editor —
       * came back as "Command Centre". That is the browser tab, the history
       * entry, and the aria-label AppShell puts on <main>, so opening a child's
       * file announced the dashboard.
       */
      const matches = item.path
        ? pathname === full || pathname.startsWith(`${full}/`)
        : pathname === full

      if (matches) {
        return `${item.label} — ${config.label}`
      }
    }

    // A detail page under the section, e.g. /educator/students/<id>.
    return config.label
  }

  return 'Page not found'
}
