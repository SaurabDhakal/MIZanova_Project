import { Link } from 'react-router-dom'
import Logo from './Logo'

/**
 * The public footer, in the five columns the Figma asks for.
 *
 * ONE FOOTER, TWO PLACES. Landing.tsx and PublicLayout.tsx each had their own,
 * which had already drifted — different links, different wording for the same
 * disclaimer. A footer is the one component on a site that must be identical
 * everywhere, so it is a component.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------
 * The design lists twenty links. Every one below goes to a page that describes
 * something the software actually does. Five from the design are absent, and
 * each is absent for the same reason rather than by oversight:
 *
 *   Careers    Special Miles has published no roles. A careers page with no
 *              jobs is a dead end wearing a company's name.
 *   Blog       No posts exist.
 *   Community  There is no community — no forum, no group, nothing to join.
 *   Training   No training material has been written.
 *   Changelog  Nothing has been released publicly yet, so there is no history
 *              to publish. The db/ scripts are an internal record.
 *
 * Twitter, LinkedIn and YouTube are absent too: nobody has told me whether
 * Special Miles holds those accounts, and a social icon linking to a guessed
 * URL — or to somebody else's handle — is worse than no icon at all.
 *
 * The ABN is absent for the reason Landing.tsx has always given: the design
 * prints 12 345 678 901, which is placeholder digits, and a fabricated company
 * number on a public page is a false statement about a real business.
 *
 * All of these become one line each the moment Joe supplies the content.
 */

const COLUMNS: { heading: string; links: { label: string; to: string }[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', to: '/features' },
      { label: 'Security', to: '/security' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'Status', to: '/status' },
    ],
  },
  {
    heading: 'Who it is for',
    links: [
      { label: 'For schools', to: '/for-schools' },
      { label: 'For families', to: '/for-parents' },
      { label: 'For individuals', to: '/for-individuals' },
      { label: 'For specialists', to: '/for-specialists' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Contact', to: '/enquiry' },
      { label: 'Help', to: '/help' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Cookies', to: '/cookies' },
      { label: 'Safeguarding', to: '/safeguarding' },
    ],
  },
]

export default function SiteFooter() {
  return (
    <footer className="bg-sidebar px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo tone="dark-background" />
            <p className="mt-3 max-w-xs text-sm text-sidebar-muted">
              Classroom strategies for neurodiverse learners, built with
              educators and checked by specialists.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-sm font-semibold text-sidebar-foreground">
                {column.heading}
              </h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-sidebar-muted hover:text-sidebar-foreground hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6">
          <p className="text-sm text-sidebar-muted">
            © 2026 Special Miles Pty Ltd
          </p>
          {/* The design prints an ABN. Its digits are 12 345 678 901, which is
              placeholder, and a made-up company number on a public page is a
              false statement about a real business. */}
          <p className="text-sm text-sidebar-muted">Data hosted in Australia</p>
          <div className="ml-auto flex flex-wrap gap-5">
            <Link
              to="/login"
              className="text-sm text-sidebar-muted hover:text-sidebar-foreground hover:underline"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="text-sm text-sidebar-muted hover:text-sidebar-foreground hover:underline"
            >
              How to join
            </Link>
          </div>
        </div>

        <p className="mt-6 max-w-prose text-xs text-sidebar-muted">
          MiZanova supports educators and families. It suggests classroom
          strategies; it does not diagnose, and it is not a clinical tool.
        </p>
      </div>
    </footer>
  )
}
