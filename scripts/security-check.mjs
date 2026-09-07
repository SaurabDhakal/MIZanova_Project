/**
 * Anonymous security check.
 *
 *   npm run security-check
 *
 * Acts as a hostile visitor holding only the publishable key — precisely what
 * anyone who opens DevTools on the deployed site has. Every attempt below must
 * be refused. Re-run this after ANY change to db/ scripts: a policy edit that
 * accidentally opens a table is silent until something like this catches it.
 *
 * Exits non-zero if anything succeeds, so it can gate a deploy later.
 *
 * SCOPE: this covers the anonymous case only. Attacks by a signed-in user
 * (e.g. a parent trying to read another family's child) need real accounts and
 * are tested separately once authentication exists.
 */
import { loadEnv } from './lib/env.mjs'

// Environment first, then .env.local — so this runs in CI as well as here.
const env = loadEnv()

const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY

if (!url || !key || key.includes('PASTE_YOUR')) {
  console.error('.env.local is not configured — cannot run the security check.')
  process.exit(1)
}

const H = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
}

const PROTECTED_TABLES = [
  'schools',
  'profiles',
  'students',
  'student_guardians',
  'student_educators',
  'consents',
  'behaviour_logs',
  'ai_controls',
  'ai_strategies',
  'strategy_feedback',
  'home_observations',
  'goals',
  'goal_milestones',
  'iep_documents',
  'iep_acknowledgements',
  'message_threads',
  'thread_participants',
  'messages',
  'ai_control_events',
  'admin_audit_events',
  // db/068. The union view over both audit tables. A VIEW rather than a table,
  // and that is exactly why it is listed: RLS lives on the tables underneath,
  // and a view only inherits it while `security_invoker` stays set. Losing that
  // in a later rewrite would open the whole governance trail without touching a
  // single policy, so the anonymous probe has to know this name exists.
  'audit_timeline',
  'mfa_recovery_codes',
  'invoices',
  'student_access_events',
  'specialist_sessions',
  'specialist_session_notes',
  // db/059. When a child is seen by a therapist is health information, so an
  // appointment is no less sensitive than the session it becomes.
  'specialist_appointments',
  // db/111. What somebody pays and when it renews. `individual_plan` is the
  // company's own pricing configuration including the Stripe id; the
  // subscriptions table is a person's billing state. Neither is anonymous
  // business — and note that the PUBLIC half of the plan is a separate view,
  // checked below, so a mistake that exposed the table itself would not be
  // caught by the view still behaving.
  'individual_plan',
  'individual_subscriptions',
  // db/094, db/101, db/110. An individual's private writing: what they asked
  // the AI about themselves, what it answered, what they are working on and
  // how each week went. Nobody but them reads these, not even a platform
  // admin — so nothing at all should come back without a session.
  'individual_ai_requests',
  'individual_ai_suggestions',
  'individual_goals',
  'individual_goal_checkins',
  // db/114. A family's account of what happened at home and what the AI said
  // back. Neither table has an insert policy and neither should answer an
  // anonymous reader at all — the request carries the observation's words and
  // the strategies carry advice about a named child's difficulties.
  'home_ai_requests',
  'home_ai_strategies',
]

/*
 * DELIBERATELY READABLE WITHOUT SIGNING IN — and therefore worth asserting.
 *
 * db/111 grants this view to `anon` on purpose: a pricing page is read by
 * people who do not have accounts, and a shop that hides its prices until you
 * register is not protecting anything. db/098 did the same for the course
 * catalogue.
 *
 * Listed here rather than left untested because "open on purpose" and "open by
 * accident" look identical from the outside. If a later change revokes this,
 * the public pricing page silently loses its figures and nothing else
 * complains; if a later change widens it to carry the Stripe id, that is a
 * different kind of mistake. Both are caught by naming what is expected.
 */
const PUBLIC_VIEWS = [
  { name: 'course_catalogue', mustNotCarry: ['body', 'video_url'] },
  { name: 'individual_plan_public', mustNotCarry: ['stripe_price_id'] },
]

let failures = 0
const fail = (msg) => {
  failures++
  console.log(`  *** FAIL *** ${msg}`)
}

console.log('Anonymous read attempts — must expose no rows')
for (const table of PROTECTED_TABLES) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, { headers: H })
  const text = await res.text()
  let rows = null
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) rows = parsed.length
  } catch {
    /* an error object rather than a row array — that is a refusal */
  }
  if (rows !== null && rows > 0) fail(`${table} returned ${rows} rows to an anonymous caller`)
  else console.log(`  ok  ${table.padEnd(18)} ${res.status} — no data`)
}

/* The other half of the same question: the things that SHOULD answer, do —
   and still do not carry what they were built to withhold. */
console.log('\nDeliberately public — must answer, and must not leak')
for (const view of PUBLIC_VIEWS) {
  // The same raw fetch the loop above uses, so this is testing the same door.
  const res = await fetch(`${url}/rest/v1/${view.name}?select=*&limit=1`, {
    headers: H,
  })
  const text = await res.text()
  let rows = null
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) rows = parsed
  } catch {
    /* not a row array — it refused, which for these views is the failure */
  }
  if (rows === null) {
    fail(
      `${view.name} should be readable signed out and returned ${res.status}: ${text.slice(0, 90)}`,
    )
    continue
  }
  const row = rows[0]
  const leaked = row ? view.mustNotCarry.filter((c) => Object.hasOwn(row, c)) : []
  if (leaked.length > 0) {
    fail(`${view.name} exposes ${leaked.join(', ')} to anybody holding the publishable key`)
  } else {
    console.log(
      `  ok  ${view.name.padEnd(24)} readable, carries no ${view.mustNotCarry.join('/')}`,
    )
  }
}

console.log('\nAnonymous write attempts — must all be refused')
const writes = [
  ['create a school', 'schools', { name: 'Hostile School' }],
  [
    'create a student',
    'students',
    {
      school_id: '11111111-1111-1111-1111-111111111111',
      first_name: 'Attacker',
      last_name: 'Test',
    },
  ],
  [
    'link self to a child',
    'student_guardians',
    {
      student_id: '11111111-1111-1111-1111-111111111111',
      profile_id: '11111111-1111-1111-1111-111111111111',
    },
  ],
  [
    'forge a consent',
    'consents',
    {
      student_id: '11111111-1111-1111-1111-111111111111',
      consent_type: 'ai_strategy_generation',
    },
  ],
  [
    'log a behaviour',
    'behaviour_logs',
    {
      student_id: '11111111-1111-1111-1111-111111111111',
      behaviour_type: 'disruptive',
      intensity: 'high',
    },
  ],
  [
    'book an appointment',
    'specialist_appointments',
    {
      student_id: '11111111-1111-1111-1111-111111111111',
      specialist_id: '11111111-1111-1111-1111-111111111111',
      starts_at: '2030-01-01T00:00:00.000Z',
    },
  ],
]

for (const [label, table, body] of writes) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(body),
  })
  if (res.status === 201) fail(`${label} SUCCEEDED — ${table} is writable anonymously`)
  else console.log(`  ok  ${label.padEnd(22)} ${res.status} — refused`)
}

console.log('\nPrivilege escalation attempt')
const esc = await fetch(
  `${url}/rest/v1/profiles?id=eq.11111111-1111-1111-1111-111111111111`,
  { method: 'PATCH', headers: H, body: JSON.stringify({ role: 'platform_admin' }) },
)
if (esc.status === 200 || esc.status === 204) fail('role column was writable')
else console.log(`  ok  set own role = platform_admin  ${esc.status} — refused`)

console.log(
  failures === 0
    ? '\nPASS — every anonymous attack was refused.'
    : `\nFAIL — ${failures} problem(s) above. Do not deploy.`,
)
process.exit(failures === 0 ? 0 : 1)
