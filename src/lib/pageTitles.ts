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
  '/': 'MiZanova — support every learner',
  '/pricing': 'Pricing',
  '/enquiry': 'Talk to us',
  '/for-specialists': 'Join the network',
  '/for-schools': 'For schools',
  '/for-parents': 'For families',
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
}

export function titleFor(pathname: string): string {
  const exact = PUBLIC_TITLES[pathname]
  if (exact) return exact

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
      if (pathname === full || pathname.startsWith(`${full}/`)) {
        return `${item.label} — ${config.label}`
      }
    }

    // A detail page under the section, e.g. /educator/students/<id>.
    return config.label
  }

  return 'Page not found'
}
