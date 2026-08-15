/**
 * Every icon in MiZanova, drawn inline.
 *
 * THE DATA LIVES HERE, AWAY FROM THE COMPONENT. `roles.ts` types its nav
 * against `IconName` and /design-tokens renders `ICON_NAMES`, so both need
 * the set without needing the component — and a file that exports a
 * component should export only components, which is what the fast-refresh
 * rule was telling me.
 *
 * NO ICON LIBRARY, AND THE REASON IS THE SERVICE WORKER RATHER THAN TASTE. An
 * icon font or a CDN sprite is a second network request that has to succeed
 * before a screen is readable, and this app is expected to open on a school
 * laptop with the wifi off — offline behaviour logging is a built and verified
 * feature (NFR2), not an aspiration. Inline paths are in the JavaScript bundle
 * the service worker already caches, so they cannot arrive late or not at all.
 *
 * A package would also be forty kilobytes to use twenty-two glyphs, and one
 * more dependency in a product that handles children's records.
 *
 * ---------------------------------------------------------------------------
 * DECORATIVE BY DEFAULT, AND THAT IS THE IMPORTANT PART
 * ---------------------------------------------------------------------------
 * Almost every icon here sits beside a word that already says the same thing —
 * a sidebar link reading "Students" does not become clearer when a screen
 * reader announces "picture of two people, Students". So `aria-hidden` is the
 * default and the icon is invisible to assistive technology.
 *
 * `label` opts out, for the rare icon carrying meaning no text repeats. It
 * turns the icon into `role="img"` with an accessible name. If you find
 * yourself passing a label that matches adjacent text, do not.
 *
 * ---------------------------------------------------------------------------
 * STROKE, NOT FILL
 * ---------------------------------------------------------------------------
 * `currentColor` and a 1.75 stroke, so an icon takes the colour of whatever it
 * sits in — sidebar muted, primary on an active link, danger inside an alert —
 * without a single colour being written here. One drawing, every context.
 */

/** 24×24 path data. Add here; nothing else needs to change. */
export const PATHS = {
  // --- the public site ----------------------------------------------------
  stopwatch: 'M10 2h4M12 5v-1M18.5 7.5 20 6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-8 3-2',
  shieldCheck: 'M12 3 4 6.5V12c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6.5L12 3Zm-3 8.5 2.2 2.2L15.5 10',
  offline: 'M5 12.5a9 9 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M3 3l18 18',
  tick: 'M5 12.5 10 17.5 19 7',
  // A panel with its edge pushed in — reads as "make this narrower", which a
  // chevron alone does not.
  collapse: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm5.5 0v14M7 10l-2 2 2 2',
  // Circle at 10,10 r6 and a handle to 20,20 — the whole glyph sits inside
  // 3.5..20.5 on both axes, so it centres like the rest at 24×24.
  search: 'M10 16a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm4.5-1.5L20 20',
  // One person, where `people` is a group. Head at 12,8 r3.5 and shoulders to
  // y=20: the glyph spans 5.5..18.5 across and 4.5..20 down, so it sits on the
  // same optical centre as the rest.
  user: 'M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0 2c-3.5 0-6.5 2-6.5 4.5V20h13v-2c0-2.5-3-4.5-6.5-4.5Z',
  // --- navigation ---------------------------------------------------------
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  students: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0 2c-3 0-6 1.5-6 4v2h12v-2c0-2.5-3-4-6-4Zm8-9a3 3 0 1 1 0 6M19 20v-2c0-1.6-1-2.9-2.5-3.6',
  messages: 'M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z',
  schedule: 'M7 3v3m10-3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  home: 'M4 11 12 4l8 7M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9',
  progress: 'M4 19V5m0 14h16M8 16V9m4 7v-4m4 4V6',
  observations: 'M12 5c-5 0-8 5-8 5s3 5 8 5 8-5 8-5-3-5-8-5Zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  goals: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  resources: 'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm9 0v5h5M8 13h8M8 17h5',
  link: 'M9.5 14.5a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14.5 9.5a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  privacy: 'M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Zm0 6v4m0 3h.01',
  finance: 'M3 7h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm9 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5 10v4m14-4v4',
  caseload: 'M7 4h10a1 1 0 0 1 1 1v15l-6-3-6 3V5a1 1 0 0 1 1-1Z',
  review: 'M9 11.5 11 13.5 15.5 9M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  kpis: 'M4 20h16M7 20v-6m5 6V8m5 12v-9',
  people: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19v-1.5C2 15.5 4.7 14 8 14s6 1.5 6 3.5V19m4 0v-1.5c0-1.4-1-2.6-2.5-3.2',
  directory: 'M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm5 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-3 8c0-1.5 1.3-2.5 3-2.5s3 1 3 2.5M3 7h2m-2 5h2m-2 5h2',
  safeguarding: 'M12 3 4 6.5V12c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6.5L12 3Zm0 5v4m0 3h.01',
  invoices: 'M6 3h12a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Zm3 5h6M9 12h6M9 16h3',
  audit: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 5h6M9 12h6M9 16h4',
  schools: 'M12 3 2 8l10 5 10-5-10-5Zm-6 8v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5',
  verification: 'M9 12.5 11 14.5 15.5 10M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3Z',
  ai: 'M9 3h6M9 21h6M4 9v6M20 9v6M8 8h8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm2 3h.01M14 11h.01',
  enquiries: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm0 1 8 6 8-6',
  applications: 'M9 3h6v3H9V3Zm-2 2H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1M8 12h8M8 16h5',
  screening: 'M10.5 16a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Zm4 -.5L20 21M8.5 10.5h4m-2-2v4',
  recordAccess: 'M12 5c-5.5 0-9 5.5-9 7s3.5 7 9 7 9-5.5 9-7-3.5-7-9-7Zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  compliance: 'M8 4h8a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm2 6 1.5 1.5L14.5 8M10 15h4',
  // A bell: dome from 7 to 17, a flat lip, and the clapper below. Drawn open
  // rather than struck through — this one is never "muted", because what it
  // counts is work rather than messages.
  bell: 'M6 17h12l-1.5-2.5V11a4.5 4.5 0 0 0-9 0v3.5L6 17Zm4 0v.5a2 2 0 0 0 4 0V17M12 4.5V6',
  // --- the account menu ---------------------------------------------------
  chevronDown: 'M6 9.5 12 15.5 18 9.5',
  // A padlock, for the page about passwords and sign-in. `privacy` and
  // `safeguarding` are both shields and both already mean something else here:
  // one is the family's data-protection page, the other is child protection.
  lock: 'M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Zm2.5 0V8a3.5 3.5 0 0 1 7 0v3',
  // A doorway open on the right with the arrow leaving through it.
  logout: 'M14 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8M11 12h10m0 0-3.5-3.5M21 12l-3.5 3.5',
  // --- the four behaviour types, in the quick-log modal -------------------
  // These replaced emoji. An emoji renders at a different size, weight and
  // colour on every platform, cannot take currentColor, and on a safeguarding
  // form it reads as a chat sticker. Everything else in this product is a
  // stroke path in the bundle the service worker already caches.
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6l1-7Z',
  moon: 'M21 13.5A9 9 0 1 1 10.5 3 7 7 0 0 0 21 13.5Z',
  droplet: 'M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z',
  // An open palm: four fingers and a thumb, for "pushing, throwing objects".
  hand: 'M7 12V7.5a1.5 1.5 0 1 1 3 0V12m0-2V5.5a1.5 1.5 0 1 1 3 0V12m0-1.5a1.5 1.5 0 1 1 3 0V12m0-.5a1.5 1.5 0 1 1 3 0v3.5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V12',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm7 9a7 7 0 0 1-14 0M12 19v3m-4 0h8',
  // --- acting on an AI suggestion -----------------------------------------
  flag: 'M5 21V4h12l-2.5 4L17 12H5',
  cross: 'M6.5 6.5l11 11m0-11-11 11',
} as const

export type IconName = keyof typeof PATHS

/**
 * Every name, for the sheet on /design-tokens.
 *
 * Derived from PATHS rather than typed out again, so a new icon appears on the
 * sheet the moment it exists and a list that has quietly gone out of step is
 * not possible.
 */
export const ICON_NAMES = Object.keys(PATHS) as IconName[]
