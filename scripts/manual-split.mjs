/**
 * One manual per role, from the single source.
 *
 *   node scripts/manual-split.mjs
 *
 * ---------------------------------------------------------------------------
 * WHY SPLIT AT ALL
 * ---------------------------------------------------------------------------
 * The combined manual is 46 pages and says on its first page that a reader only
 * needs their own chapter. Handing a parent 46 pages and telling them 8 are
 * theirs is asking them to do the sorting, and most will not — they will skim
 * the lot or none of it.
 *
 * So each role gets a document that is entirely theirs: the shared front matter
 * every account needs, then their own screens, and nothing about anybody else's
 * job.
 *
 * ---------------------------------------------------------------------------
 * SPLIT, NOT REWRITTEN
 * ---------------------------------------------------------------------------
 * Every word comes from manual/User-Manual.md. Nothing is retyped here, because
 * two copies of a sentence is two sentences to keep true, and this repository
 * has already been bitten by notes that outlived the thing they described.
 * Change the source and run this again.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'C:/GIT/MIZanova_Project/manual'
const OUT = join(DIR, 'roles')
mkdirSync(OUT, { recursive: true })

const src = readFileSync(join(DIR, 'User-Manual.md'), 'utf8').replace(/\r\n/g, '\n')

/* The document is split on its own `# ` headings, so a chapter added to the
   source appears here without this file being edited. */
const parts = src.split(/\n(?=# )/)
const find = (starts) => parts.find((p) => p.startsWith(starts))

const frontMatter = find('# Before you start')
if (!frontMatter) throw new Error('“Before you start” not found — has the manual been restructured?')

const ROLES = [
  {
    slug: 'parents',
    file: 'MiZanova-Manual-Parents-and-Guardians',
    title: 'Manual for Parents and Guardians',
    chapter: '# Chapter 1',
    lead: 'You are reading this because your child’s school uses MiZanova. It covers everything your account can do, and nothing it cannot.',
  },
  {
    slug: 'educators',
    file: 'MiZanova-Manual-Educators',
    title: 'Manual for Educators',
    chapter: '# Chapter 2',
    lead: 'For classroom teachers. Logging what you saw, the strategies that come back, and the plans behind them.',
  },
  {
    slug: 'specialists',
    file: 'MiZanova-Manual-Specialists',
    title: 'Manual for Specialists',
    chapter: '# Chapter 3',
    lead: 'For learning and wellbeing specialists. Your caseload, the queue where a human checks the AI, and your diary.',
  },
  {
    slug: 'school-admins',
    file: 'MiZanova-Manual-School-Administrators',
    title: 'Manual for School Administrators',
    chapter: '# Chapter 4',
    lead: 'For whoever runs a school’s use of MiZanova: the roll, the staff, the safeguarding queue and the money.',
  },
  {
    slug: 'platform-admins',
    file: 'MiZanova-Manual-Platform-Administrators',
    title: 'Manual for Platform Administrators',
    chapter: '# Chapter 5',
    lead: 'For Special Miles staff. Every school, the specialist network, the AI controls and the audit trail.',
  },
  {
    slug: 'students',
    file: 'MiZanova-Manual-Students',
    title: 'Manual for Students',
    chapter: '# Chapter 6',
    lead: 'Your account shows the goals you are working on at school. This explains what is there and what is not.',
  },
  {
    slug: 'individuals',
    file: 'MiZanova-Manual-Individuals',
    title: 'Manual for Individuals',
    chapter: '# Chapter 7',
    lead: 'For an adult using MiZanova for themselves, with no school and nobody else involved.',
  },
]

/* The front matter tells four roles that two-factor is compulsory and two that
   it is not. In a document for ONE role, the other half is noise — but editing
   the prose per role would be the two-copies problem again, so it is left
   whole and the chapter that follows is the part that differs. */
let written = 0
for (const role of ROLES) {
  const chapter = find(role.chapter)
  if (!chapter) {
    console.log(`  SKIPPED ${role.slug} — ${role.chapter} not found in the source`)
    continue
  }

  // "# Chapter 3 — Specialists" becomes "# Your screens": in a document that is
  // only about them, a chapter number is a reference to a book they do not have.
  const body = chapter.replace(/^# Chapter \d+ — .*$/m, '# Your screens')

  const doc = `# MiZanova — ${role.title}

${role.lead}

MiZanova is a support platform for neurodiverse students in Australian schools.
It keeps one shared picture of a child and shows each person exactly the part of
it that is theirs to see.

This document is complete for your role. There is nothing you need from the
other versions.

---

${frontMatter.trim()}

---

${body.trim()}
`

  const path = join(OUT, `${role.file}.md`)
  writeFileSync(path, doc, 'utf8')
  const images = (doc.match(/!\[/g) || []).length
  const words = doc.split(/\s+/).length
  console.log(`  ${role.file}.md — ${words} words, ${images} images`)
  written++
}

console.log(`\n${written} role manuals written to ${OUT}`)
