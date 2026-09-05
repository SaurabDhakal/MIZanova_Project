/**
 * The public site's navigation, in one place.
 *
 * ---------------------------------------------------------------------------
 * ITS OWN MODULE, FOR THE REASON pageTitles.ts GIVES
 * ---------------------------------------------------------------------------
 * Exporting this from PublicHeader.tsx trips the fast-refresh rule, which is
 * right: a file that exports a component should export only components.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS SHARED AT ALL
 * ---------------------------------------------------------------------------
 * Landing.tsx and PublicLayout.tsx each carried their own copy of this list,
 * and they drifted. "For individuals" shipped with db/088, was added to
 * PublicLayout and the footer, and never reached the homepage — so the role
 * had a public page that could not be reached from the front door.
 *
 * Adding an audience is now one line here. SiteFooter keeps its own grouped
 * columns because it is a different shape — five headed columns, twenty links
 * — but the four "who it is for" pages must appear in both, and that is worth
 * a glance whenever this list changes.
 */
export const PUBLIC_LINKS = [
  { label: 'For schools', to: '/for-schools' },
  { label: 'For families', to: '/for-parents' },
  { label: 'For specialists', to: '/for-specialists' },
  { label: 'For individuals', to: '/for-individuals' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Features', to: '/features' },
  { label: 'About', to: '/about' },
] as const
