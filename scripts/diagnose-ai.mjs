/**
 * Why is strategy generation refusing?
 *
 *   node --env-file=.env.local scripts/diagnose-ai.mjs
 *
 * Walks the same gates `server/index.js` walks, in the same order, and prints
 * what each one currently answers. Read-only — it changes nothing.
 *
 * Prints no secrets.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Run me with: node --env-file=.env.local scripts/diagnose-ai.mjs')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log('--- Gate 1: is the AI switched on? ------------------------------')
const { data: controls, error: controlsError } = await admin
  .from('ai_controls')
  .select('id, ai_enabled, confidence_threshold, last_change_reason, updated_at')
  .eq('id', true)
  .maybeSingle()

if (controlsError) console.log('  ERROR reading ai_controls:', controlsError.message)
else if (!controls) console.log('  *** No ai_controls row with id = true. The server treats this as OFF.')
else {
  console.log(`  ai_enabled            ${controls.ai_enabled}`)
  console.log(`  confidence_threshold  ${controls.confidence_threshold}`)
  console.log(`  last changed          ${controls.updated_at}`)
  if (!controls.ai_enabled) console.log('  *** This alone returns 503 to every teacher.')
}

console.log('\n--- Gate 2: consent per student ---------------------------------')
const { data: students } = await admin
  .from('students')
  .select('id, first_name, last_name, school_id')
  .eq('is_active', true)
  .order('first_name')

const { data: consents } = await admin
  .from('consents')
  .select('student_id, consent_type, granted_at, revoked_at')

for (const s of students ?? []) {
  const mine = (consents ?? []).filter(
    (c) => c.student_id === s.id && c.consent_type === 'ai_strategy_generation',
  )
  const active = mine.find((c) => c.revoked_at === null)
  const name = `${s.first_name} ${s.last_name}`.padEnd(20)
  if (active) console.log(`  ok   ${name} consent active since ${active.granted_at}`)
  else if (mine.length > 0) console.log(`  ***  ${name} consent WITHDRAWN (${mine.length} historical row(s)) — 403`)
  else console.log(`  ***  ${name} NO consent row at all — 403`)
}

console.log('\n--- Gate 3: logs that already have strategies --------------------')
// The server returns early for these. If every strategy on a log is held for
// review, the teacher gets an empty list and no error — which looks broken.
const { data: logs } = await admin
  .from('behaviour_logs')
  .select('id, student_id, behaviour_type, occurred_at')
  .order('occurred_at', { ascending: false })
  .limit(10)

const { data: strategies } = await admin
  .from('ai_strategies')
  .select('behaviour_log_id, status')

for (const log of logs ?? []) {
  const mine = (strategies ?? []).filter((x) => x.behaviour_log_id === log.id)
  if (mine.length === 0) continue
  const count = (s) => mine.filter((x) => x.status === s).length
  const visible = count('published') + count('approved')
  const student = (students ?? []).find((s) => s.id === log.student_id)
  const who = `${student?.first_name ?? '?'} ${log.behaviour_type}`.padEnd(20)
  const breakdown = `pub ${count('published')} appr ${count('approved')} pending ${count('pending_review')} rej ${count('rejected')}`
  const note =
    visible === 0
      ? count('pending_review') > 0
        ? '  *** teacher sees nothing; waiting on a specialist'
        : '  *** teacher sees nothing; all rejected'
      : ''
  console.log(`  ${who} ${breakdown}${note}`)
}

console.log('\n--- Gate 4: is the API server up? -------------------------------')
try {
  const res = await fetch('http://localhost:8887/api/health')
  console.log(`  /api/health  ${res.status} ${await res.text()}`)
} catch (err) {
  console.log(`  *** Cannot reach http://localhost:8887 — ${err.message}`)
  console.log('  *** Run `npm run server` in a second terminal.')
}

console.log('\n--- Anthropic key present? --------------------------------------')
console.log(
  process.env.ANTHROPIC_API_KEY
    ? `  set, ${process.env.ANTHROPIC_API_KEY.length} characters`
    : '  *** ANTHROPIC_API_KEY is missing from .env.local',
)
