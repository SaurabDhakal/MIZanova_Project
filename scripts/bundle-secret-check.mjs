/**
 * Proves no server-only secret is compiled into the browser bundle.
 *
 *   npm run bundle-secret-check     (also runs inside npm run security-check)
 *
 * Why this exists: Vite compiles any variable prefixed VITE_ into the JavaScript
 * it ships. One accidental rename to VITE_ANTHROPIC_API_KEY would publish your
 * API key to every visitor, with no error and no visible symptom. This is the
 * only thing that would catch it.
 *
 * TWO SCANS, because they fail in different ways.
 *
 *   BY SHAPE   Looks for things that are secrets whatever their value —
 *              sk-ant-, sb_secret_, a Stripe key, a JWT whose payload says
 *              service_role. Needs no credentials, so it runs everywhere,
 *              including CI with nothing configured. It also catches a secret
 *              this project has never heard of.
 *
 *   BY VALUE   Takes the real values from the environment and searches for
 *              them exactly. Catches a secret whose shape nobody anticipated.
 *              Only possible where the values exist.
 *
 * Neither is enough alone. By-shape misses a key with an unusual format;
 * by-value misses a key that is not in this environment's .env.local.
 *
 * NEVER PRINTS A VALUE. Not on success, not on failure, not truncated.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv } from './lib/env.mjs'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const distDir = join(root, 'dist')

if (!existsSync(distDir)) {
  console.error('No dist/ found. Run `npm run build` first.')
  process.exit(1)
}

/**
 * Walk the WHOLE of dist, not just dist/assets.
 *
 * It used to scan dist/assets only, which quietly stopped being everything the
 * browser downloads the moment the service worker arrived: sw.js and
 * workbox-*.js are generated into dist/ root, and index.html always was. A
 * check that says "no secret is in the browser bundle" has to look at all of
 * it, or the reassurance is worth nothing.
 */
function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return collect(full)
    return /\.(js|css|html|json|map)$/.test(entry.name) ? [full] : []
  })
}

// Environment first, then .env.local — so this runs in CI as well as here.
const env = loadEnv()

/**
 * Must never appear in anything a browser downloads.
 *
 * `shapeCovered` says whether the by-shape scan below already looks for this
 * kind of secret whatever its value. It decides what happens when the value is
 * not available here — and the reasoning matters, because an earlier version
 * of this file failed hard in that case and the strictness was right THEN for a
 * reason that no longer applies.
 *
 * Then: there was no by-shape scan. No value meant nothing was checked at all,
 * and reporting success would have been a lie.
 *
 * Now: a key with a fixed prefix is found by shape whether or not this machine
 * holds it — and that is arguably the STRONGER test, because it also catches a
 * key belonging to a different environment, which a by-value search never
 * would. So for these, no value means "checked another way", not "not checked".
 *
 * Anything without a recognisable shape still fails when its value is missing.
 * There is genuinely no way to look for it.
 */
const MUST_NOT_SHIP = [
  { name: 'ANTHROPIC_API_KEY', shapeCovered: true },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', shapeCovered: true },
  { name: 'STRIPE_SECRET_KEY', shapeCovered: true },
  { name: 'RESEND_API_KEY', shapeCovered: true },
  // A Gmail App Password sends mail AS a real person from their real mailbox.
  // Leaked, it is worse than an API key: it cannot be scoped, and revoking it
  // means going into somebody's Google account. `shapeCovered: false` because
  // sixteen lowercase letters has no distinguishing shape to search for — this
  // one is only caught by its exact value being present.
  { name: 'SMTP_PASS', shapeCovered: false, optional: true },
]
// Expected in the bundle — public by design, protected by RLS.
const MAY_SHIP = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']

const files = collect(distDir)
const haystack = files.map((f) => readFileSync(f, 'utf8')).join('\n')

/** Shipped a real secret. An emergency: the key is public and must be rotated. */
let leaked = 0
/** Could not look. Not an emergency, and NOT the same thing — see the summary. */
let unverified = []

console.log(`Scanning ${files.length} built assets\n`)

// ---------------------------------------------------------------------------
// Scan 1 — by shape. No credentials needed.
// ---------------------------------------------------------------------------
const SHAPES = [
  ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{20,}/],
  ['Stripe secret key', /sk_(?:live|test)_[A-Za-z0-9]{20,}/],
  ['Stripe webhook secret', /whsec_[A-Za-z0-9]{20,}/],
  ['OpenAI-style key', /sk-proj-[A-Za-z0-9_-]{20,}/],
  // The word boundary matters here and nowhere else in this list. Every
  // other prefix is distinctive; 're_' is two letters, so without it an
  // ordinary minified identifier such as feature_flags_abcdefghijklmnop
  // matches and the check cries wolf on a clean build.
  ['Resend API key', /\bre_[A-Za-z0-9_-]{20,}/],
]

console.log('By shape — runs anywhere, no credentials needed')
for (const [label, pattern] of SHAPES) {
  if (pattern.test(haystack)) {
    leaked++
    console.log(`  *** LEAKED *** ${label} is in the browser bundle`)
  } else {
    console.log(`  ok  no ${label}`)
  }
}

/**
 * A legacy Supabase service_role key is a JWT, so it has no distinctive prefix
 * — it starts `eyJ` exactly like the publishable key that is SUPPOSED to be
 * here. Telling them apart means reading the payload.
 *
 * Decoding rather than pattern-matching the base64: the same text encodes to
 * three different strings depending on its offset in the payload, so a
 * substring search for an encoded "service_role" silently misses two thirds of
 * the time.
 */
const jwts = haystack.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g) ?? []
let serviceRoleTokens = 0
for (const token of new Set(jwts)) {
  try {
    const payload = Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
    if (/"role"\s*:\s*"service_role"/.test(payload)) serviceRoleTokens++
  } catch {
    /* not a JWT after all — a base64 blob that happened to start eyJ */
  }
}
if (serviceRoleTokens > 0) {
  leaked++
  console.log(`  *** LEAKED *** ${serviceRoleTokens} service_role JWT(s) in the bundle`)
} else {
  console.log(`  ok  no service_role JWT (${jwts.length} token(s) inspected)`)
}

// ---------------------------------------------------------------------------
// Scan 2 — by exact value. Only where the values exist.
// ---------------------------------------------------------------------------
console.log('\nBy exact value — needs the real secrets to be present')
for (const { name, shapeCovered, optional } of MUST_NOT_SHIP) {
  const value = env[name]
  if (!value || value.startsWith('PASTE_')) {
    /**
     * NEVER COUNTED AS A LEAK. An earlier version added this to the same
     * counter as a real find, so a machine without .env.local printed
     * "2 secret(s) shipped. Rotate them now" — an instruction to revoke
     * working keys, based on a search that had not run.
     */
    if (shapeCovered) {
      console.log(`  --  ${name.padEnd(28)} no value here; covered by the shape scan above`)
    } else if (optional) {
      /*
       * NOT CONFIGURED IS NOT UNCHECKED. This bundle was built on this machine
       * from this environment: a value that does not exist here cannot be in
       * the file that was just produced here. Failing would train somebody to
       * ignore a red result, which is how a real one gets missed.
       *
       * CI still does the real check, because CI is where the value is set.
       */
      console.log(`  --  ${name.padEnd(28)} not configured here, so nothing to leak`)
    } else {
      unverified.push(name)
      console.log(`  --  ${name.padEnd(28)} NOT CHECKED — no value, and no known shape`)
    }
    continue
  }
  if (haystack.includes(value)) {
    leaked++
    console.log(`  *** LEAKED *** ${name} IS IN THE BROWSER BUNDLE`)
  } else {
    console.log(`  ok  ${name.padEnd(28)} absent from the bundle`)
  }
}

console.log()
for (const name of MAY_SHIP) {
  const value = env[name]
  if (!value || value.startsWith('PASTE_')) continue
  console.log(
    `  --  ${name.padEnd(28)} ${
      haystack.includes(value) ? 'present (expected — public, RLS protects it)' : 'absent'
    }`,
  )
}

// ---------------------------------------------------------------------------
// Two failures, two messages. Saying the wrong one costs somebody a key.
// ---------------------------------------------------------------------------
console.log()
if (leaked > 0) {
  console.log(`FAIL — ${leaked} secret(s) ARE IN THE BUNDLE and are now public.`)
  console.log('       Rotate them, then find the VITE_ prefix that shipped them.')
} else if (unverified.length > 0) {
  console.log('FAIL — these were NOT checked at all. No value to search for, and')
  console.log('       no shape the scan above knows how to recognise:')
  for (const name of unverified) console.log(`         ${name}`)
  console.log()
  console.log('       NOTHING HAS LEAKED. Do not rotate anything.')
  console.log('       Locally: add them to .env.local.')
  console.log('       In CI:   Settings → Secrets and variables → Actions,')
  console.log('               then add them to the job\'s env: block in ci.yml.')
} else {
  console.log('PASS — no server-only secret is in the browser bundle.')
}

process.exit(leaked > 0 || unverified.length > 0 ? 1 : 0)
