# Backend guide (`server/`, `db/`, `scripts/`)

Read [../CLAUDE.md](../CLAUDE.md) first for the invariants. This file is how the
backend is built.

---

## What the server is for

Only what must never run in a browser: the Anthropic key, the Supabase
`service_role` key, Stripe secrets, and outbound mail.

**If the browser can do it under RLS, the browser does it.** A new endpoint that
just proxies a Supabase read is a second permission system to keep in sync with
the first, and the one in JavaScript is the one nobody re-tests.

Plain JavaScript, ESM, **no build step** — what you read is what runs. Keep it
that way: `scripts/anonymisation-check.mjs` imports `anonymise.js` directly with
no compilation in between.

| File | Job |
|---|---|
| `index.js` | Config, the two Supabase clients, shared helpers, route wiring |
| `claude.js` | The only file that talks to Anthropic |
| `anonymise.js` | Redaction. The only thing making the privacy promise true |
| `mail.js` | Resend or SMTP, plus every message template |

---

## The two clients — pick the right one every time

```js
const admin = createClient(SUPABASE_URL, SERVICE_KEY, …)   // BYPASSES all RLS
function clientForUser(accessToken)                        // acts AS the caller
```

- **`clientForUser(token)` answers "may this person see this?"** Read the
  subject of the request with it. If RLS returns nothing, the caller is not
  entitled to it. Never re-implement the permission check in JavaScript.
- **`admin` is only for what a policy deliberately forbids the browser**:
  writing `ai_strategies`, reading a whole-school roster for anonymisation,
  hashing invitation and guardian-code tokens, recording system events.

Using `admin` to fetch the thing you are about to authorise is the bug this
split exists to prevent.

---

## Endpoint skeleton

```js
app.post('/api/thing', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { thingId } = req.body ?? {}
  if (!thingId) return res.status(400).json({ error: 'thingId is required.' })

  try {
    const userClient = clientForUser(token)
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired.' })

    const { data: thing, error } = await userClient.from('things').select('…').eq('id', thingId).maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!thing) return res.status(404).json({ error: 'Thing not found.' })

    // … work, using `admin` only where a policy forbids the browser …

    res.json({ ok: true })
  } catch (err) {
    recordEvent('error', 'thing', 'failed', err.message)
    res.status(500).json({ error: 'Something went wrong.' })
  }
})
```

Rules that skeleton encodes:

- **Every response body is `{ error: string }` or the success payload.** The
  frontend reads `.error`; anything else surfaces as "undefined" in a toast.
- **"Does not exist" and "not yours" get the identical 404.** Distinguishing
  them tells an attacker which ids are real.
- **Error text is for the person reading it.** "Your session has expired" beats
  the raw Postgres message. Keep the raw one for `recordEvent`.
- **`recordEvent(severity, source, event, detail)` for anything that failed.**
  `console.error` writes to a terminal nobody watches; this writes to
  `system_events`, which Special Miles can read. It is never awaited and can
  never fail the request. **`detail` must never carry a child's name, an
  anonymised payload, or a secret** — platform staff read it across every
  school.
- **Anything public and unauthenticated gets a `rateLimiter`.** Existing ones:
  `tooManyPeeks`, `tooManyEnquiries`, `tooManyApplications`, `tooManyRedeems`.
  Public endpoints today: enquiries, specialist applications, invitation peek
  and accept, guardian-code peek and redeem.

---

## Middleware order — one thing here is load-bearing

`POST /api/billing/webhook` is registered **before `express.json()`** and uses
`express.raw()`. Stripe signs the raw bytes; parsing and re-serialising produces
different bytes and every real payment notification is rejected as a forgery.
Do not move it below the JSON parser, and do not add a body parser above it.

`express.json({ limit: '64kb' })` and the CORS allowlist come next. New dev
origins go in `DEV_ORIGINS`.

---

## Modularity — where new code goes

`index.js` is already ~2,400 lines. It stays as **config, shared helpers and
wiring**; it is not where the next feature lands.

A new feature area gets its own module exporting a Router factory:

```js
// server/routes/sessions.js
import { Router } from 'express'
export function createSessionRoutes({ admin, clientForUser, recordEvent }) {
  const router = Router()
  router.post('/sessions', async (req, res) => { … })
  return router
}
```

```js
// index.js
app.use('/api', createSessionRoutes({ admin, clientForUser, recordEvent }))
```

Dependencies are passed in, not imported from `index.js` — that keeps the module
testable and avoids a circular import. Existing endpoints stay where they are;
do not do a sweeping refactor mid-project.

Anything that is not a route is its own module already (`claude.js`,
`anonymise.js`, `mail.js`). Keep that shape: message templates go in `mail.js`,
prompts and schemas in `claude.js`, redaction in `anonymise.js`.

---

## The AI path

`claude.js` is the only file importing `@anthropic-ai/sdk`. Model is pinned in
one constant (`MODEL = 'claude-opus-5'`).

The order is fixed and it is the whole privacy promise:

1. Build the payload with `buildAnonymousPayload()` — it strips the student's
   names, **every other student's name at that school**, staff names, emails,
   Australian phone numbers and dates, and coarsens duration to whole minutes.
2. Assert with `findLeaks()` immediately before the request goes out. A leak
   throws `AnonymisationError` and the request never leaves.
3. Only then call Anthropic.

What is kept on purpose: behaviour type, intensity, approximate duration, year
level. None identifies a child; all of them make a strategy useful.

Other rules:

- **Never send an id of any kind** — not student, school, teacher, or a
  timestamp precise enough to correlate against a roster.
- Redaction order is contact details *before* names, and names longest-first.
  Both are load-bearing; the comments in `anonymise.js` say why.
- Never share a `/g` regex instance between redaction and leak detection —
  `lastIndex` persists and the detector misses every second leak.
- Output is schema-constrained (`STRATEGY_SCHEMA`). A refusal raises
  `RefusalError` and is surfaced honestly, not retried into compliance.
- The `ai_controls` kill switch and confidence threshold are checked **before**
  spending a call. Low-confidence output is held for a specialist, not shown.
- **Never diagnostic.** Strategies for a classroom, never an assessment of a
  child.
- A repeat request for a log that already has live strategies returns the
  existing ones. Rejected rows do not count as "already generated" — a
  specialist rejecting all three must not lock a teacher out forever.

`npm run anonymisation-check` proves this and runs in CI.

---

## Mail

Optional by design. Without `RESEND_API_KEY` or SMTP credentials the app still
works — links are copied by hand and the endpoint says so via
`mailConfigured()` / `mailProvider()`. **A missing mail provider must never
fail the action it accompanies**: an invitation is created whether or not the
email went out, and the response reports delivery separately (`Delivered`).

New message → a new exported template function in `mail.js` returning
`{ subject, text }`. Nothing builds a message body inline in a route.

---

## Secrets

- Required at startup: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY`. The server exits with a readable message if one is
  missing or still says `PASTE_`.
- **Never prefix a server secret with `VITE_`.** Vite compiles those into the
  bundle. `npm run bundle-secret-check` scans the build for them by value.
- Stripe has two different secrets that fail only when someone presses Pay:
  `STRIPE_SECRET_KEY` (calls to Stripe) and `STRIPE_WEBHOOK_SECRET` (proves a
  notification came from Stripe). Prefixes are checked at startup.
- `/api/health` reports degraded rather than ok when payments cannot be
  recorded. Keep it that way — a green check that could not check is the
  failure mode this project has hit repeatedly.

---

## The database (`db/`)

**One Supabase project, shared by all four of us. Git protects the code; nothing
protects the database.**

- **Say so in the group chat before running anything in `db/`.** It changes the
  app for everyone instantly, with no branch and no undo.
- **Never edit an applied script.** They are history. Add `db/0NN_next.sql`.
- **Claim your migration numbers up front.** Two people writing `058_*.sql`
  independently is a silent collision.
- **Commit the script before you run it.** The free tier has no backups; these
  files *are* the backup.
- **Every script must be safe to run twice**: `create table if not exists`,
  `create or replace function`, `drop policy if exists` before `create policy`,
  guarded `do $$` blocks for types.
- Scripts live in `db/`, not `supabase/migrations/` — the GitHub integration
  auto-applies that folder, and the SQL editor does not wrap a script in a
  transaction, so a half-failed auto-apply leaves the first half committed.
- `npm run apply-db` builds a fresh database and resumes from where it failed.
  `db/verify.sql` is read-only and shows the real schema state.

### Writing a policy

- Build on the security-definer helpers rather than repeating joins — a policy
  that queries its own table recurses (see `033`). The base set is in
  `003_rls_helpers.sql` (`my_role`, `my_school_id`, `is_platform_admin`,
  `is_school_admin`, `is_guardian_of`, `is_assigned_staff_for`,
  `can_view_student`); `can_staff_view_student` starts in `005` and is
  **redefined** by `013` (verification gate) and `040` (context scopes). If you
  change a helper, add a new numbered file that replaces it — the latest
  definition wins, so check `verify.sql` for what is actually live.
- A view is a second door: create it `security_invoker` so RLS still applies
  (`055`), and give it every column the app reads (`042`).
- Deny by default. Grant the narrowest thing that works, then prove it.
- **Add an RLS test in `tests/rls/` in the same commit.** A policy with no test
  that refuses is a policy nobody knows is doing anything.

### Verifying

```bash
npm run security-check
```

Runs four things: `security-check.mjs` attacks every table as an anonymous
visitor holding only the publishable key, plus the anonymisation, bundle-secret
and contrast checks. **An accidentally-opened table produces no error and no
symptom** — nothing else will tell you.

```bash
npm test
```

The RLS suite. It signs in as real users against the real project and cleans up
by naming convention — **one person at a time, announced first**.

---

## Do not

- Add an endpoint the browser could do under RLS.
- Authorise with `admin` and then decide permissions in JavaScript.
- Return different responses for "not found" and "not yours".
- Put a name, an anonymised payload or a secret in a `system_events` detail.
- Send anything to Anthropic that has not been through `buildAnonymousPayload`
  and `findLeaks`.
- Register a body parser above the Stripe webhook.
- Edit an applied `db/` script, or run one without telling the team.
