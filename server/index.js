/**
 * MiZanova API server.
 *
 *   npm run server
 *
 * Exists for one reason: some things must never run in a browser. The Anthropic
 * key and the Supabase service_role key both live here and are never sent to
 * the frontend. React asks this server for strategies; this server talks to the
 * AI.
 *
 * Plain JavaScript, no build step — what you read is what runs.
 */
import crypto from 'node:crypto'
import path from 'node:path'
import { existsSync } from 'node:fs'
import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import { buildAnonymousPayload, redact } from './anonymise.js'
import { pushConfigured, sendToProfile, vapidPublicKey } from './push.js'
import {
  bookingAnsweredEmail,
  bookingRequestedEmail,
  ENQUIRIES_TO,
  usingTestSender,
  applicationDecisionEmail,
  enquiryEmail,
  screeningReminderEmail,
  specialistApplicationEmail,
  guardianCodeEmail,
  invitationEmail,
  mailConfigured,
  mailProvider,
  smtpSenderMismatch,
  sendMail,
} from './mail.js'
import {
  AnonymisationError,
  RefusalError,
  generateStrategies,
  generateSelfStrategies,
  generateHomeStrategies,
  SELF_PROMPT_VERSION,
  HOME_PROMPT_VERSION,
} from './claude.js'

// 8887, not the conventional 8787 — see the note in vite.config.ts.
const PORT = process.env.PORT || 8887

/**
 * Where the browser app lives, for building invitation links.
 *
 * Defaults to the dev server. Set APP_URL in .env.local when the app is
 * deployed, or every invitation will point at somebody's laptop.
 *
 * ---------------------------------------------------------------------------
 * THE TRAILING SLASH IS STRIPPED, AND IT BROKE EVERY EMAILED LINK
 * ---------------------------------------------------------------------------
 * A dashboard's environment field is filled in by a person copying an address
 * out of a browser, and a browser shows `https://example.com/`. Every use
 * below appends a path, so one invisible character produced:
 *
 *     https://mizanova-project.onrender.com//invite/Vb8NzLK6v-PLd5...
 *
 * React Router does not match `//invite/:token`, so the first real invitation
 * sent to a school administrator opened Not Found. The email was correct, the
 * token was valid, and the link was dead.
 *
 * It is not only the links. `Origin` headers never carry a trailing slash, so
 * CORS_ORIGINS and ALLOWED_ORIGINS both held a value no browser could ever
 * match — the second of which decides where Stripe sends a parent after they
 * pay.
 *
 * Normalised here rather than at each of the five use sites, because the next
 * person to add a link would have to know to do it, and would find out the way
 * we did.
 */
const APP_URL = (process.env.APP_URL || 'http://localhost:5273').replace(/\/+$/, '')
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PUBLISHABLE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

for (const [name, value] of Object.entries({
  VITE_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
})) {
  if (!value || value.startsWith('PASTE_')) {
    console.error(
      `\n${name} is missing from .env.local.\n` +
        'The server is started with `node --env-file=.env.local`, so the file\n' +
        'is read at launch — stop the server and start it again after editing.\n',
    )
    process.exit(1)
  }
}

/**
 * The service-role client BYPASSES every Row-Level Security policy.
 * Use it only where a policy deliberately forbids the browser from acting:
 * writing ai_strategies, and reading the school roster for anonymisation.
 * Never use it to answer "may this person see this?" — that is what the
 * per-request user client below is for.
 */
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** A client acting AS the signed-in user, so RLS still applies to their reads. */

/**
 * Tell a school's safeguarding leads that something is waiting.
 *
 * ---------------------------------------------------------------------------
 * THE ONLY THING THIS PRODUCT INTERRUPTS SOMEBODY FOR
 * ---------------------------------------------------------------------------
 * The notification bell counts seven kinds of work. Six of them — unread
 * messages, invoices, screening due, applications — are things that can wait
 * until somebody opens the app, and notifying on all of them is how a person
 * turns notifications off for good and then misses the one that mattered.
 *
 * A flagged safeguarding incident is the exception. db/010 exists because a
 * record somebody senior has read must not be quietly reworded; the queue
 * exists because "a flag a human never sees is not a safeguard". This is the
 * same argument one step earlier: a flag nobody is TOLD about waits as long as
 * the next time somebody happens to look.
 *
 * ---------------------------------------------------------------------------
 * A COUNT, AND THE SCHOOL. NOTHING ELSE.
 * ---------------------------------------------------------------------------
 * Not which child, not what happened, not who logged it. The count is read
 * from the queue rather than passed in, so it says how many are actually
 * waiting rather than how many times this fired.
 *
 * ---------------------------------------------------------------------------
 * NEVER THROWS, NEVER BLOCKS
 * ---------------------------------------------------------------------------
 * Called with `void`. A push service having a bad afternoon must not fail the
 * request that flagged the incident — the flag itself is the safeguard and it
 * is already written. This is an accelerant on top of a durable queue, which
 * is also why a client that never calls the endpoint below costs a nudge and
 * not a record.
 */
async function notifySafeguardingLeads(schoolId) {
  if (!pushConfigured() || !schoolId) return

  try {
    const [{ data: leads }, { data: school }, { data: students }] =
      await Promise.all([
        admin
          .from('profiles')
          .select('id')
          .eq('role', 'school_admin')
          .eq('school_id', schoolId),
        admin.from('schools').select('name').eq('id', schoolId).maybeSingle(),
        admin.from('students').select('id').eq('school_id', schoolId),
      ])

    if (!leads?.length) return

    const ids = (students ?? []).map((s) => s.id)
    if (!ids.length) return

    const { count } = await admin
      .from('behaviour_logs')
      .select('id', { count: 'exact', head: true })
      .eq('is_risk_flagged', true)
      .is('safeguarding_acknowledged_at', null)
      .in('student_id', ids)

    await Promise.all(
      leads.map((lead) =>
        sendToProfile(admin, lead.id, {
          count: count ?? 1,
          where: school?.name ?? null,
          url: '/school-admin/safeguarding',
        }),
      ),
    )
  } catch (err) {
    // Recorded rather than raised: somebody should know the nudge stopped
    // working, and nobody's request should fail because it did.
    recordEvent(
      'warning',
      'push',
      'safeguarding_notify_failed',
      err?.message ?? String(err),
    )
  }
}

function clientForUser(accessToken) {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Record a failure somewhere a person will actually see it — db/027.
 *
 * console.error writes to a terminal nobody is watching. This writes to a
 * table Special Miles can read.
 *
 * Never awaited, and never able to fail the request that triggered it. A
 * teacher whose strategies worked should not lose them because the incident
 * log was unavailable — and if this itself is broken, console.error is still
 * there as the last resort.
 *
 * `detail` is for a human debugging later. It must never carry a child's name,
 * an anonymised payload or a secret: platform staff read this across every
 * school, and a debugging aid is not a reason to move personal information
 * into a new table.
 */
function recordEvent(severity, source, event, detail) {
  console.error(`[${severity}] ${source}.${event}${detail ? ` — ${detail}` : ''}`)

  void admin
    .from('system_events')
    .insert({ severity, source, event, detail: detail ?? null })
    .then(({ error }) => {
      if (error) console.error('Could not record system event:', error.message)
    })
}

const app = express()

/**
 * POST /api/billing/webhook — Stripe telling us a payment happened.
 *
 * REGISTERED BEFORE express.json() ON PURPOSE, and it must stay there.
 * Stripe signs the raw bytes of the request. Parsing the body to JSON and
 * re-serialising it produces different bytes, the signature stops matching,
 * and every real payment notification is rejected as a forgery. `express.raw`
 * hands over the untouched buffer.
 *
 * WHY THIS EXISTS AT ALL. Until now a payment was only recorded when the
 * parent's browser came back to the app afterwards. Close the tab at the
 * wrong moment, lose signal in a car park, have the phone ring — and Stripe
 * has the money while MiZanova still shows the invoice as unpaid, with no way
 * to reconcile it. This path does not care what the browser did: Stripe
 * reports the payment server to server, and retries for days if we are down.
 *
 * The signature check is not optional. Without it, this endpoint is a public
 * URL that marks any invoice paid on request.
 */
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) {
      console.error(
        'A Stripe webhook arrived but STRIPE_WEBHOOK_SECRET is not set. Ignoring it — an unverified payment notification is worthless.',
      )
      return res.status(503).send('Webhook not configured.')
    }

    const stripe = await getStripe()
    if (!stripe) return res.status(503).send('Payments not configured.')

    let event
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        secret,
      )
    } catch (err) {
      // Either someone is probing the endpoint, or STRIPE_WEBHOOK_SECRET is
      // wrong. The two look identical from here and have very different
      // consequences — one is noise, the other silently stops every payment
      // being recorded — so a person needs to look rather than a rule decide.
      recordEvent(
        'warning',
        'billing',
        'webhook_rejected',
        `Signature verification failed: ${err.message}`,
      )
      return res.status(400).send('Signature verification failed.')
    }

    // Stripe retries anything that is not a 2xx, so acknowledge events we do
    // not handle rather than letting them queue up for days.
    const handled = [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      // db/111. Stripe owns the subscription clock; these are how it tells us
      // the time changed — a renewal, a failed card, an ended cancellation.
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ]
    if (!handled.includes(event.type)) {
      return res.json({ received: true, ignored: event.type })
    }

    /* ------------------------------------------------------------------
     * SUBSCRIPTION LIFECYCLE COMES FIRST, because the object is a
     * Subscription rather than a Session and has no `payment_status` at all.
     * Falling through to the check below would read undefined, decide the
     * event was unpaid, and drop every renewal and cancellation on the floor.
     * ------------------------------------------------------------------ */
    if (event.type.startsWith('customer.subscription.')) {
      const recorded = await recordSubscription(event.data.object)
      return res.json({ received: true, subscription: recorded })
    }

    const session = event.data.object

    /* ------------------------------------------------------------------
     * A SUBSCRIPTION CHECKOUT ALSO COMES BEFORE THE PAID CHECK, and this one
     * is easy to get wrong: a checkout that opens with a free trial settles
     * with `payment_status: 'no_payment_required'`, because no money moved.
     * Requiring 'paid' would throw away exactly the sessions a trial creates —
     * the subscription would exist at Stripe and never appear here.
     * ------------------------------------------------------------------ */
    if (session.metadata?.kind === 'subscription') {
      if (!session.subscription) {
        return res.json({ received: true, subscription: false })
      }
      const stripeSub = await stripe.subscriptions.retrieve(
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id,
      )
      const recorded = await recordSubscription(
        stripeSub,
        session.metadata?.profileId ?? null,
      )
      return res.json({ received: true, subscription: recorded })
    }

    if (session.payment_status !== 'paid') {
      // A completed session that has not been paid: a delayed method still
      // clearing, or a failure. Not our business until it succeeds.
      return res.json({ received: true, unpaid: true })
    }

    /* ------------------------------------------------------------------
     * A COURSE PURCHASE TAKES A DIFFERENT TABLE — db/092.
     *
     * Same event, same signature check, same idempotent shape. The metadata
     * says which kind of thing was paid for, because a settled Stripe session
     * cannot be asked what it was for without guessing.
     * ------------------------------------------------------------------ */
    if (session.metadata?.kind === 'course') {
      const { data: recorded, error: courseError } = await admin.rpc(
        'mark_course_purchase_paid',
        {
          p_session_id: session.id,
          p_payment_intent_id:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : null,
        },
      )

      if (courseError) {
        recordEvent(
          'critical',
          'billing',
          'payment_unrecorded',
          `Course purchase ${session.id} paid at Stripe but not recorded: ${courseError.message}`,
        )
        return res.status(500).send('Could not record payment.')
      }

      console.log(
        recorded
          ? `Course purchase recorded from webhook for ${session.id}`
          : `Webhook for course purchase ${session.id} was already recorded`,
      )
      return res.json({ received: true, recorded })
    }

    const invoiceId = session.metadata?.invoiceId
    if (!invoiceId) {
      // Acknowledged deliberately: retrying will not add metadata that was
      // never attached, so a retry loop would achieve nothing but noise.
      console.error('Stripe session has no invoiceId in metadata:', session.id)
      return res.json({ received: true, unmatched: true })
    }

    const { data: recorded, error } = await admin.rpc('mark_invoice_paid', {
      p_invoice_id: invoiceId,
      p_session_id: session.id,
      p_payment_intent_id:
        typeof session.payment_intent === 'string' ? session.payment_intent : null,
    })

    if (error) {
      // Critical without qualification: Stripe has the money and MiZanova does
      // not know. The 500 makes Stripe retry, so this may resolve itself — but
      // if it does not, somebody has paid an invoice that still reads unpaid.
      recordEvent(
        'critical',
        'billing',
        'payment_unrecorded',
        `Invoice ${invoiceId} paid at Stripe but not recorded: ${error.message}`,
      )
      return res.status(500).send('Could not record payment.')
    }

    // `recorded === false` means it was already paid — the parent got back to
    // the app before this arrived, or Stripe sent it twice. Both are success.
    console.log(
      recorded
        ? `Payment recorded from webhook for invoice ${invoiceId}`
        : `Webhook for invoice ${invoiceId} was already recorded`,
    )
    return res.json({ received: true, recorded })
  },
)

app.use(express.json({ limit: '64kb' }))

/**
 * WHO MAY CALL THIS SERVER. Still never a wildcard — it holds the service key.
 *
 * The two dev origins are always allowed because they are somebody's laptop and
 * cannot be anybody else's. Deployed origins are added through APP_URL, so
 * putting the app on the internet does not mean editing this file: one variable
 * decides both where invitation links point and who may call the API, and those
 * two answers must not be allowed to disagree.
 */
/*
 * `[::1]` is the same laptop as `127.0.0.1`, and on some machines it is the
 * only one Vite offers: it binds IPv6 by default, so a browser pointed at
 * http://[::1]:5273 gets the app and then cannot call this server. The
 * preflight passes and the request itself fails, which reads as a broken API
 * rather than a missing origin — found on 8 September, chasing a strategy
 * panel that had hidden its own button because a status lookup "failed".
 */
const DEV_ORIGINS = [
  'http://localhost:5273',
  'http://127.0.0.1:5273',
  'http://[::1]:5273',
  'http://localhost:4273',
]
const CORS_ORIGINS = [...new Set([...DEV_ORIGINS, ...(APP_URL ? [APP_URL] : [])])]
app.use(cors({ origin: CORS_ORIGINS }))

/**
 * GET /api/health
 *
 * Reports what is CONFIGURED, not merely that Express answered. `{ok:true}`
 * was true while the Stripe key held a webhook secret and while the webhook
 * was switched off entirely — a health check that is green during an outage is
 * worse than none.
 *
 * Nothing polls this. Knowing the server has stopped needs something outside
 * the server, which is an external service and a deployment decision. This
 * endpoint is what such a service would call.
 */
/**
 * A database error the caller is not entitled to read.
 *
 * ---------------------------------------------------------------------------
 * LOG IN FULL, ANSWER IN GENERAL
 * ---------------------------------------------------------------------------
 * Fourteen routes handed PostgREST's own `error.message` straight to the
 * browser. Those strings name tables, columns and constraints, and the one
 * place it was reachable without signing in — /api/screening/:id/remind, found
 * by probing with a forged bearer on 8 September — answered
 * "JWT cryptographic operation failed" to a stranger.
 *
 * None of these fourteen is reachable unauthenticated, so this is hardening
 * rather than a breach. It is written as one helper because fourteen copies of
 * a decision is fourteen chances to make it differently, and because the next
 * route should have somewhere obvious to reach for.
 *
 * The status stays 500: from the caller's side a failed read IS our fault, and
 * a 400 would tell them to go and fix a request that was fine. `where` is for
 * the log, never for the response.
 */
function dbFailed(res, where, error) {
  console.error(`${where}:`, error?.message ?? error)
  return res
    .status(500)
    .json({ error: 'Something went wrong at our end. Try again in a moment.' })
}

/**
 * Does the Stripe key actually work — asked of Stripe, not of the string.
 *
 * ---------------------------------------------------------------------------
 * THIS ENDPOINT WAS GREEN ON A KEY THAT COULD NOT TAKE A PAYMENT
 * ---------------------------------------------------------------------------
 * `stripe_key_looks_right` is `startsWith('sk_')`, and the key in .env.local
 * was `sk_test_…xxxx` — a placeholder with the right shape. So /api/health
 * reported `"status":"ok"` with every Stripe check true, while the first real
 * call returned "Invalid API Key provided". This endpoint's own docstring says
 * a health check that is green during an outage is worse than none, and the
 * one thing it could not catch was the one thing most likely to be wrong.
 *
 * A prefix test cannot tell a key from a shape. Asking Stripe can.
 *
 * ---------------------------------------------------------------------------
 * CACHED, BECAUSE HEALTH IS POLLED AND STRIPE IS NOT OURS TO HAMMER
 * ---------------------------------------------------------------------------
 * A five-minute cache: long enough that a monitor calling every thirty seconds
 * makes one Stripe request per five minutes, short enough that fixing the key
 * shows up without a restart. Failures are cached too — a broken key stays
 * broken, and retrying it per request would turn an outage into a rate limit.
 *
 * Anthropic is deliberately NOT checked this way. A Stripe key lookup is free;
 * the cheapest honest Anthropic check is a generation, which costs money on
 * every poll. Presence is the most that can be checked there without charging
 * Special Miles to find out.
 */
let stripeCheck = { at: 0, ok: false }
const STRIPE_CHECK_TTL_MS = 5 * 60 * 1000

async function stripeKeyWorks() {
  if (!process.env.STRIPE_SECRET_KEY) return false
  if (Date.now() - stripeCheck.at < STRIPE_CHECK_TTL_MS) return stripeCheck.ok

  let ok = false
  try {
    const stripe = await getStripe()
    if (stripe) {
      // The cheapest authenticated read there is. It proves the key is real
      // and the account is reachable, and returns nothing worth logging.
      await stripe.prices.list({ limit: 1 })
      ok = true
    }
  } catch {
    ok = false
  }
  stripeCheck = { at: Date.now(), ok }
  return ok
}

app.get('/api/health', async (_req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  const checks = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    supabase: false,
    stripe_key_present: Boolean(stripeKey),
    stripe_key_looks_right: Boolean(stripeKey?.startsWith('sk_')),
    stripe_key_works: await stripeKeyWorks(),
    stripe_webhook_configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
  }

  try {
    const { error } = await admin.from('ai_controls').select('id').limit(1)
    checks.supabase = !error
  } catch {
    checks.supabase = false
  }

  // Degraded, not broken: the app works without Stripe, and saying "ok" while
  // payments cannot be recorded is the failure this endpoint exists to avoid.
  const healthy = checks.supabase && checks.anthropic
  const complete =
    healthy && checks.stripe_key_works && checks.stripe_webhook_configured

  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    status: complete ? 'ok' : healthy ? 'degraded' : 'unhealthy',
    checks,
  })
})

/**
 * POST /api/strategies  { behaviourLogId }
 *
 * AUTHORISATION NOTE, and it is the important part of this file.
 *
 * This server does NOT decide whether the caller may see the student. It reads
 * the behaviour log using the CALLER'S OWN token, so Row-Level Security answers
 * that question — the same 21 policies that protect every other read. If RLS
 * returns nothing, the caller is not entitled to it, full stop.
 *
 * Re-implementing the permission check here in JavaScript would mean two
 * sources of truth that can drift apart, and the one in JavaScript would be
 * the one nobody re-tests.
 */
/**
 * The curated answer, for when the model cannot give one — db/118, E02.
 *
 * Shaped exactly like a generated response so `StrategyPanel` renders either
 * without knowing which it got, and marked `source: 'evidence'` so it can SAY
 * which it got. A teacher handed advice in a crisis is entitled to know it
 * came from a library rather than from a model reading their notes.
 *
 * The usage row is written with the same `source`, because A04 asks for "the
 * ratio of AI-generated strategies versus Database-only usage" and without it
 * that ratio cannot be computed at all.
 */
async function evidenceFallback(log, actorId) {
  /*
   * The school is looked up here rather than passed in. The first version took
   * a `student` the caller had already fetched — and the kill-switch branch
   * runs BEFORE that fetch, so it read a `const` in its temporal dead zone.
   * Neither the linter nor `node --check` sees that; it throws at runtime, in
   * the branch that only runs during a crisis, which is the worst possible
   * place to find out.
   */
  const { data: student } = await admin
    .from('students')
    .select('school_id')
    .eq('id', log.student_id)
    .maybeSingle()

  const { data: rows, error } = await admin
    .from('evidence_strategies')
    .select('id, title, body, rationale, provenance')
    .eq('behaviour_type', log.behaviour_type)
    .eq('is_current', true)
    .is('retired_at', null)
    .limit(3)

  if (error) {
    console.error('Evidence fallback failed:', error.message)
    return { strategies: [] }
  }

  const strategies = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    rationale: r.rationale ?? [],
    /*
     * No confidence score. A number here would be invented: these were written
     * by a person and chosen by a specialist, and a made-up 0.9 beside them
     * would put them on the same scale as something a model scored itself on.
     */
    confidence: null,
    status: 'published',
    provenance: r.provenance,
  }))

  if (strategies.length > 0) {
    await admin.from('ai_generation_events').insert({
      school_id: student?.school_id ?? null,
      requested_by: actorId,
      behaviour_log_id: log.id,
      strategies_returned: strategies.length,
      model: null,
      source: 'evidence',
    })
  }

  return {
    strategies,
    heldForReview: 0,
    rejected: 0,
    riskFlagged: false,
    redactions: 0,
    source: 'evidence',
  }
}

app.post('/api/strategies', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { behaviourLogId } = req.body ?? {}
  if (!behaviourLogId) {
    return res.status(400).json({ error: 'behaviourLogId is required.' })
  }

  try {
    const userClient = clientForUser(token)

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    // Read AS THE USER. RLS is the authorisation check.
    const { data: log, error: logError } = await userClient
      .from('behaviour_logs')
      .select('id, student_id, behaviour_type, intensity, notes, duration_seconds')
      .eq('id', behaviourLogId)
      .maybeSingle()

    if (logError) return dbFailed(res, 'logError', logError)
    if (!log) {
      // Deliberately the same answer for "does not exist" and "not yours".
      return res.status(404).json({ error: 'Behaviour log not found.' })
    }

    // --- Already generated? Return what exists, don't pay twice ------------
    // Without this, a teacher who clicks again because nothing appeared on
    // screen silently spends another API call and creates duplicate rows.
    const { data: existing } = await admin
      .from('ai_strategies')
      .select('id, title, body, rationale, confidence, status, routing_reason')
      .eq('behaviour_log_id', log.id)

    // Rejected rows do NOT count as "already generated".
    //
    // They did, and the result was a teacher permanently unable to get help: a
    // specialist rejects all three suggestions, this guard then refuses to
    // generate any more for that log forever, and the screen told them to wait
    // for a specialist who had already acted. A rejection means "these are not
    // right for this child" — it does not mean the teacher stops needing
    // something. So if everything on this log was rejected, fall through and
    // generate afresh.
    const live = (existing ?? []).filter((s) => s.status !== 'rejected')
    const rejectedCount = (existing ?? []).length - live.length

    if (live.length > 0) {
      const visible = live.filter(
        (s) => s.status === 'published' || s.status === 'approved',
      )
      return res.json({
        strategies: visible,
        // Counted separately, because they are different facts. Reporting a
        // rejection as "with a specialist for review" is a lie the teacher
        // cannot detect and would wait on indefinitely.
        heldForReview: live.length - visible.length,
        rejected: rejectedCount,
        riskFlagged: false,
        redactions: 0,
        alreadyGenerated: true,
      })
    }

    // --- Is the AI switched on at all? (FR20/21 kill switch) ---------------
    const { data: controls } = await admin
      .from('ai_controls')
      .select('ai_enabled, confidence_threshold')
      .eq('id', true)
      .single()

    if (!controls?.ai_enabled) {
      /*
       * E02: "Strategies must fall back to the curated Evidence Database (DB)
       * if AI is blocked or offline."
       *
       * This used to be a 503 and nothing else — so FR21's kill switch, the
       * one Special Miles pulls during a crisis, left every teacher in every
       * classroom with no strategies at all, at the moment they were most
       * likely to need one. db/118 is the net that was missing.
       */
      const fallback = await evidenceFallback(log, user.id)
      if (fallback.strategies.length > 0) return res.json(fallback)

      return res.status(503).json({
        error:
          'AI suggestions are switched off at the moment, and the evidence library has nothing recorded for this behaviour yet. Your school specialist can help.',
      })
    }

    // --- Quota (db/026) ----------------------------------------------------
    // Before consent and before anonymisation, because the cheapest request is
    // the one never made. The kill switch above is all-or-nothing; this is the
    // control between "every school" and "no school".
    const { data: student0 } = await admin
      .from('students')
      .select('school_id')
      .eq('id', log.student_id)
      .single()

    const { data: quota } = await admin
      .rpc('ai_quota_status', {
        p_school_id: student0?.school_id ?? null,
        p_actor_id: user.id,
      })
      .single()

    if (quota) {
      // Which limit was reached, not just that one was. "You have reached
      // today's limit" with no further detail generates a support call.
      if (quota.user_used >= quota.user_limit) {
        return res.status(429).json({
          error: `You have used all ${quota.user_limit} AI suggestions available to you in the last 24 hours. Behaviour logging is unaffected — this only pauses new suggestions.`,
        })
      }
      if (quota.school_used >= quota.school_limit) {
        return res.status(429).json({
          error: `Your school has used all ${quota.school_limit} AI suggestions available in the last 24 hours. Contact Special Miles if this is unexpected — it usually means something is requesting them automatically.`,
        })
      }
    }

    // --- Consent (FR25) ----------------------------------------------------
    // Checked before anything is sent, not after. No consent, no request.
    const { data: consented } = await admin.rpc('has_active_consent', {
      p_student_id: log.student_id,
      p_type: 'ai_strategy_generation',
    })

    if (!consented) {
      return res.status(403).json({
        error:
          'This student has no active consent for AI strategy generation. A guardian must give consent first.',
      })
    }

    // --- Anonymise ---------------------------------------------------------
    // The roster read uses the service client on purpose: a teacher may not be
    // entitled to see every student at the school, but we must redact all of
    // their names — a teacher writing "he pushed Maya" would otherwise leak a
    // child this request has nothing to do with.
    const { data: student } = await admin
      .from('students')
      .select('id, first_name, last_name, year_level, school_id')
      .eq('id', log.student_id)
      .single()

    const { data: roster } = await admin
      .from('students')
      .select('first_name, last_name')
      .eq('school_id', student.school_id)

    const namesToRemove = (roster ?? []).flatMap((s) => [
      s.first_name,
      s.last_name,
    ])

    const payload = buildAnonymousPayload({
      behaviourType: log.behaviour_type,
      intensity: log.intensity,
      notes: log.notes,
      durationSeconds: log.duration_seconds,
      yearLevel: student.year_level,
      namesToRemove,
    })

    // --- Generate ----------------------------------------------------------
    const result = await generateStrategies(payload, namesToRemove)

    // --- Route: teacher, or human specialist first? ------------------------
    const threshold = Number(controls.confidence_threshold ?? 0.7)

    const rows = result.strategies.map((s) => {
      // ROUTING IS PER STRATEGY, and deliberately does NOT depend on
      // result.riskFlag.
      //
      // riskFlag describes the OBSERVATION and sends the incident to a human
      // (below). Using it here as well meant a teacher who had just handled a
      // serious incident received no strategies at all — the moment they most
      // need practical help. The brief routes risky *suggestions*, not risky
      // *incidents*, and those are different things.
      const heldBack = s.confidence < threshold || s.safetyConcern
      return {
        behaviour_log_id: log.id,
        student_id: log.student_id,
        title: s.title,
        body: s.body,
        rationale: s.rationale,
        confidence: s.confidence,
        status: heldBack ? 'pending_review' : 'published',
        routing_reason: s.safetyConcern
          ? 'The model flagged this specific strategy as needing specialist oversight.'
          : s.confidence < threshold
            ? `Confidence ${s.confidence.toFixed(2)} is below the ${threshold} threshold.`
            : null,
        // The exact text that was sent. Stored so the privacy claim can be
        // audited later rather than taken on trust.
        anonymised_input: JSON.stringify(payload),
        redaction_count: payload.redactions,
        model: result.model,
      }
    })

    // Written with the service key: ai_strategies has no insert policy, so a
    // browser cannot invent a strategy and present it as the model's output.
    const { data: inserted, error: insertError } = await admin
      .from('ai_strategies')
      .insert(rows)
      .select('id, title, body, rationale, confidence, status, routing_reason')

    if (insertError) return dbFailed(res, 'insertError', insertError)

    /**
     * Record the request itself — db/026.
     *
     * AFTER the model has answered, because this counts what actually cost
     * money. Recording before would mean a failed call still consumed somebody
     * quota, which turns a bad afternoon at Anthropic into a lockout here.
     *
     * Not awaited and never allowed to fail the response: a teacher who has
     * their strategies should get them even if the meter misses a tick. The
     * consequence is that under-counting is possible and over-counting is not,
     * which is the right way round for a limit that blocks people.
     */
    void admin
      .from('ai_generation_events')
      .insert({
        school_id: student.school_id,
        requested_by: user.id,
        behaviour_log_id: log.id,
        strategies_returned: inserted.length,
        model: result.model,
      })
      .then(({ error: usageError }) => {
        if (usageError) console.error('Usage not recorded:', usageError.message)
      })

    // If the observation was risk-flagged, mark the log for the safeguarding
    // queue. A flag a human never sees is not a safeguard.
    if (result.riskFlag) {
      await admin
        .from('behaviour_logs')
        .update({ is_risk_flagged: true, risk_note: result.riskReason })
        .eq('id', log.id)

      // And tell somebody. The comment above says a flag a human never sees is
      // not a safeguard; a flag nobody is told about waits for the next time
      // one of them happens to look. Not awaited — see notifySafeguardingLeads.
      void notifySafeguardingLeads(student.school_id)
    }

    const visible = inserted.filter((s) => s.status === 'published')

    return res.json({
      strategies: visible,
      heldForReview: inserted.length - visible.length,
      rejected: 0,
      riskFlagged: result.riskFlag,
      redactions: payload.redactions,
    })
  } catch (err) {
    if (err instanceof AnonymisationError) {
      // Fail closed and say so loudly: the privacy layer caught something and
      // refused to send it. Critical because if it starts happening often,
      // either the redaction has broken or something is being written that it
      // cannot handle — and both mean teachers silently stop getting help.
      recordEvent(
        'critical',
        'ai',
        'anonymisation_blocked',
        // The message names the PATTERN that matched, never the text.
        err.message,
      )
      return res.status(500).json({
        error:
          'Blocked: the anonymisation check found identifying information and refused to contact the AI.',
      })
    }
    if (err instanceof RefusalError) {
      return res.status(422).json({ error: err.message })
    }
    if (err?.status === 429) {
      return res
        .status(429)
        .json({ error: 'The AI is rate limited right now. Try again shortly.' })
    }
    if (err?.status === 401) {
      console.error('Anthropic rejected the API key.')
      return res
        .status(500)
        .json({ error: 'The AI service is not configured correctly.' })
    }
    console.error('Strategy generation failed:', err)
    return res.status(500).json({ error: 'Could not generate strategies.' })
  }
})

/**
 * The time, as the person will read it — db/103.
 *
 * Australia/Sydney explicitly rather than the server's clock. Render runs in
 * Singapore, and an email telling an Australian their session is at 7am when
 * it is at 9am is worse than no email.
 */
function whenInSydney(date) {
  return date.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Tell the other person, by whatever means they have.
 *
 * Email and push both, because they answer different questions: push reaches
 * somebody who is holding their phone, email reaches somebody who is not. A
 * booking matters enough to be worth both, and neither is guaranteed to be
 * configured — a missing VAPID key or SMTP host makes each a no-op rather than
 * an error.
 *
 * NEVER AWAITED BY A ROUTE. Somebody whose booking went through must not be
 * told it failed because a mail server was slow.
 */
/**
 * Write what Stripe says about a subscription into `individual_subscriptions`.
 *
 * ---------------------------------------------------------------------------
 * STRIPE IS THE TRUTH; THIS TABLE IS A COPY
 * ---------------------------------------------------------------------------
 * Every field here comes from the Stripe object rather than being worked out
 * locally. The row exists so a screen can say "renews on the 3rd" without a
 * network call on every page load — not so the product can hold an opinion
 * about somebody's billing that differs from the company taking the money.
 *
 * IDEMPOTENT BY INDEX. `individual_subscriptions_stripe_idx` is unique on
 * `stripe_subscription_id`, so an upsert on that column is safe to replay —
 * which matters, because Stripe retries any webhook that does not return 2xx
 * and will happily deliver the same event twice on a good day.
 *
 * `profileId` is only supplied on the first event, from the checkout session's
 * metadata. Later events are about a subscription that already has a row, so
 * the update must not null the column out — hence the conditional spread.
 */
async function recordSubscription(sub, profileId = null) {
  try {
    const price = sub.items?.data?.[0]?.price
    const amountCents = price?.unit_amount ?? null
    if (!amountCents) {
      recordEvent(
        'warning',
        'billing',
        'subscription_no_amount',
        `Stripe subscription ${sub.id} arrived with no unit_amount.`,
      )
      return false
    }

    /* Stripe's statuses are a superset of ours. 'unpaid' and 'incomplete_expired'
       both mean it is over, and mapping them to 'canceled' keeps one meaning of
       "this is finished" rather than spreading it across four spellings. */
    const status =
      sub.status === 'unpaid' || sub.status === 'incomplete_expired'
        ? 'canceled'
        : sub.status === 'incomplete'
          ? 'incomplete'
          : sub.status

    const seconds = (n) => (n ? new Date(n * 1000).toISOString() : null)

    const row = {
      ...(profileId ? { profile_id: profileId } : {}),
      amount_cents: amountCents,
      currency: price?.currency ?? 'aud',
      bill_every: price?.recurring?.interval === 'year' ? 'year' : 'month',
      status,
      stripe_subscription_id: sub.id,
      stripe_customer_id:
        typeof sub.customer === 'string' ? sub.customer : (sub.customer?.id ?? null),
      current_period_end: seconds(sub.current_period_end),
      trial_ends_at: seconds(sub.trial_end),
      cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      /* db/111 has a check constraint tying these together: a canceled row
         must carry a time, and a live one must not. */
      canceled_at: status === 'canceled' ? seconds(sub.canceled_at) ?? new Date().toISOString() : null,
    }

    const { error } = await admin
      .from('individual_subscriptions')
      .upsert(row, { onConflict: 'stripe_subscription_id' })

    if (error) {
      recordEvent(
        'critical',
        'billing',
        'subscription_unrecorded',
        `Stripe subscription ${sub.id} could not be recorded: ${error.message}`,
      )
      return false
    }
    return true
  } catch (err) {
    recordEvent(
      'critical',
      'billing',
      'subscription_unrecorded',
      `Stripe subscription ${sub?.id} could not be recorded: ${err.message}`,
    )
    return false
  }
}

async function notifyAboutBooking(profileId, kind, { whenText, note }) {
  try {
    const { data: person } = await admin
      .from('profiles')
      .select('email, role')
      .eq('id', profileId)
      .single()

    const letter =
      kind === 'requested'
        ? bookingRequestedEmail({ whenText })
        : bookingAnsweredEmail({
            accepted: kind === 'accepted',
            whenText,
            note,
          })

    if (person?.email) {
      const sent = await sendMail({ to: person.email, ...letter })
      if (!sent?.ok && sent?.error) {
        recordEvent('warning', 'booking', 'mail_failed', sent.error)
      }
    }

    await sendToProfile(admin, profileId, {
      count: 1,
      where: null,
      /*
       * THE DESTINATION FOLLOWS THE PERSON, NOT THE EVENT.
       *
       * This read `'/individual/book'` for every answered booking, which was
       * right while individuals were the only people who could ask. db/115
       * gave families the same ability, and a parent tapping that push would
       * have been sent to a route `ProtectedRoute` allows to individuals
       * only — bounced to their dashboard with no idea why, which is the
       * failure BACKLOG already records under in-app links that strand
       * people.
       */
      url:
        kind === 'requested'
          ? '/specialist/schedule'
          : person?.role === 'parent'
            ? '/parent/appointments'
            : '/individual/book',
    })
  } catch (err) {
    // Recorded rather than raised, for the reason above.
    recordEvent(
      'warning',
      'booking',
      'notify_failed',
      err?.message ?? String(err),
    )
  }
}

/**
 * Booking, through the server so somebody is actually told — db/103.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE EXIST WHEN THE BROWSER COULD WRITE THE ROW ITSELF
 * ---------------------------------------------------------------------------
 * It could, and it did. Row-Level Security already decides who may ask and who
 * may answer, so the write needed no server at all — which is exactly why the
 * first version of this feature shipped with a hole in it: an individual asked
 * for an hour and nothing on earth told the specialist, and the specialist
 * answered and nothing told the individual. Both had to keep coming back to
 * look.
 *
 * So the write still happens AS THE USER, with their own token, and RLS is
 * still the authority on whether it is allowed. The server's only addition is
 * the part a browser cannot do: reading the other person's email address and
 * sending them something.
 *
 * ---------------------------------------------------------------------------
 * THE MAIL IS NEVER ALLOWED TO FAIL THE REQUEST
 * ---------------------------------------------------------------------------
 * Same rule as the AI usage meter: somebody whose booking went through should
 * not be told it failed because a mail server was slow. The send is not
 * awaited and its failure is recorded rather than raised.
 */
app.post('/api/bookings/request', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { specialistId, startsAt, purpose } = req.body ?? {}
  if (!specialistId || !startsAt) {
    return res.status(400).json({ error: 'A specialist and a time are required.' })
  }

  try {
    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    const starts = new Date(startsAt)
    const ends = new Date(starts.getTime() + 45 * 60000)

    // AS THE USER. `individual_bookings_ask` refuses a row for anybody else,
    // and refuses any status but 'requested'.
    const { data: booking, error: insertError } = await userClient
      .from('individual_bookings')
      .insert({
        profile_id: user.id,
        specialist_id: specialistId,
        starts_at: starts.toISOString(),
        duration_minutes: 45,
        ends_at: ends.toISOString(),
        purpose: (purpose ?? '').trim() || null,
        status: 'requested',
      })
      .select('id, starts_at')
      .single()

    if (insertError) return res.status(400).json({ error: insertError.message })

    void notifyAboutBooking(specialistId, 'requested', {
      whenText: whenInSydney(starts),
    })

    return res.json({ id: booking.id })
  } catch (err) {
    console.error('Booking request failed:', err)
    return res.status(500).json({ error: 'Could not ask for that time.' })
  }
})

app.post('/api/bookings/answer', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { id, status, note } = req.body ?? {}
  if (!id || (status !== 'accepted' && status !== 'declined')) {
    return res.status(400).json({ error: 'An answer of accepted or declined is required.' })
  }

  try {
    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    /*
     * AS THE USER AGAIN. `individual_bookings_answer` lets the specialist set
     * any status and the person who asked set only 'cancelled', so a person
     * accepting their own request is refused by the database rather than by a
     * check here that could drift away from it.
     */
    const { data: rows, error: updateError } = await userClient
      .from('individual_bookings')
      .update({
        status,
        outcome_note: (note ?? '').trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, profile_id, starts_at')

    if (updateError) {
      /*
       * Three different refusals, and a person should be told which. The RLS
       * one is what somebody hits by answering a booking that is not theirs —
       * `individual_bookings_answer` lets the person who asked set only
       * 'cancelled' — and "new row violates row-level security policy" is not
       * a sentence anybody should read on a screen.
       */
      const raw = updateError.message
      return res.status(400).json({
        error: raw.includes('individual_bookings_no_clash')
          ? 'Something else was accepted for that time while this was open. Refresh and take another look.'
          : raw.includes('row-level security')
            ? 'Only the specialist can accept or decline this. You can withdraw it instead.'
            : raw,
      })
    }

    /*
     * ZERO ROWS IS A REFUSAL, NOT A SUCCESS. An update RLS declines returns
     * success with an empty array and no error — the trap `assertChanged`
     * exists for elsewhere in this codebase. Without this, somebody answering
     * a booking that is not theirs would be told it worked.
     */
    const booking = rows?.[0]
    if (!booking) {
      return res.status(403).json({ error: 'That is not yours to answer.' })
    }

    void notifyAboutBooking(booking.profile_id, status, {
      whenText: whenInSydney(new Date(booking.starts_at)),
      note: (note ?? '').trim(),
    })

    return res.json({ ok: true })
  } catch (err) {
    console.error('Booking answer failed:', err)
    return res.status(500).json({ error: 'Could not send that answer.' })
  }
})

/**
 * A family asking their child's specialist for a time — db/115, FR6, P05.
 *
 * The same shape as `/api/bookings/request` above, against the other table.
 * `individual_bookings` is for somebody with no school; this writes to
 * `specialist_appointments`, because a parent's request is for a child and the
 * row it wants to become is exactly the row a specialist would have created.
 *
 * The insert runs with the CALLER'S token, so db/115's policy decides all four
 * of the things that matter — their own child, an assigned specialist, status
 * 'requested' and nothing else. None of that is re-checked here, on purpose:
 * a second copy of a rule is a second place for it to be wrong.
 */
app.post('/api/appointments/request', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { studentId, specialistId, startsAt, purpose } = req.body ?? {}
  if (!studentId || !specialistId || !startsAt) {
    return res.status(400).json({ error: 'A child, a specialist and a time are required.' })
  }

  try {
    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    const starts = new Date(startsAt)
    const ends = new Date(starts.getTime() + 45 * 60000)

    const { data: appointment, error: insertError } = await userClient
      .from('specialist_appointments')
      .insert({
        student_id: studentId,
        specialist_id: specialistId,
        starts_at: starts.toISOString(),
        duration_minutes: 45,
        ends_at: ends.toISOString(),
        purpose: (purpose ?? '').trim() || null,
        status: 'requested',
      })
      .select('id, starts_at')
      .single()

    if (insertError) {
      /*
       * The database refusing this is the normal case rather than a fault: a
       * specialist who is not on the child's caseload, or a family that is not
       * theirs. Its own message is about row-level security and means nothing
       * to a parent.
       */
      return res.status(400).json({
        error:
          'That time could not be requested. It may have been taken, or that specialist may no longer be working with your child.',
      })
    }

    /*
     * THE SPECIALIST IS TOLD THE TIME AND NOTHING ELSE. `purpose` is what a
     * family wrote about what they are finding hard, and db/103 made the same
     * call for the same reason: that stays in the account where RLS governs
     * who reads it, rather than travelling to an inbox.
     */
    void notifyAboutBooking(specialistId, 'requested', {
      whenText: whenInSydney(starts),
    })

    return res.json({ id: appointment.id })
  } catch (err) {
    console.error('Appointment request failed:', err)
    return res.status(500).json({ error: 'Could not ask for that time.' })
  }
})

/**
 * A specialist answering one — db/115.
 *
 * Accepting is an UPDATE to 'scheduled' rather than a new row, which is the
 * whole reason this extends the appointments table instead of copying db/103:
 * the request and the booking are the same appointment at two moments.
 *
 * db/059's update policy already allows exactly this person and no other, so
 * again the check is the database's rather than a second copy here.
 */
app.post('/api/appointments/answer', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { appointmentId, decision, note } = req.body ?? {}
  if (!appointmentId || !['scheduled', 'declined'].includes(decision)) {
    return res.status(400).json({ error: 'An appointment and a decision are required.' })
  }

  try {
    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    const { data: updated, error: updateError } = await userClient
      .from('specialist_appointments')
      .update({
        status: decision,
        cancelled_reason: decision === 'declined' ? (note ?? '').trim() || null : null,
      })
      .eq('id', appointmentId)
      .eq('status', 'requested')
      .select('id, student_id, starts_at, status')
      .single()

    if (updateError || !updated) {
      /*
       * A REFUSED UPDATE AND AN ALREADY-ANSWERED ONE LOOK IDENTICAL under RLS —
       * both return no rows. The exclusion constraint is the third possibility
       * and the likeliest here: two families can ask for the same half hour
       * because a request reserves nothing, so the second acceptance is the
       * one the database stops.
       */
      return res.status(409).json({
        error:
          'That could not be answered. Somebody may have answered it already, or you may have since agreed to something else at the same time.',
      })
    }

    // Everybody at home, because either guardian may have asked and both are
    // waiting on the answer.
    const { data: guardians } = await admin
      .from('student_guardians')
      .select('profile_id')
      .eq('student_id', updated.student_id)

    for (const g of guardians ?? []) {
      void notifyAboutBooking(g.profile_id, decision === 'scheduled' ? 'accepted' : 'declined', {
        whenText: whenInSydney(new Date(updated.starts_at)),
        note: decision === 'declined' ? (note ?? '').trim() || null : null,
      })
    }

    return res.json({ id: updated.id, status: updated.status })
  } catch (err) {
    console.error('Appointment answer failed:', err)
    return res.status(500).json({ error: 'Could not answer that request.' })
  }
})


/**
 * POST /api/account/close  { password }
 *
 * Closing your own account — db/096.
 *
 * ---------------------------------------------------------------------------
 * THE PAGE PROMISED THIS BEFORE IT EXISTED
 * ---------------------------------------------------------------------------
 * ForIndividuals.tsx says "an account you can close, with an email address you
 * can change". Changing the email has always worked. Closing had no route, no
 * screen and no database machinery, so half of that sentence was untrue for
 * the life of the page.
 *
 * ---------------------------------------------------------------------------
 * INDIVIDUALS ONLY, AND NOT BECAUSE IT IS EASIER
 * ---------------------------------------------------------------------------
 * An individual is the only role whose departure harms nobody else. A parent
 * is somebody's guardian, an educator is on a roster, a specialist holds a
 * caseload — deleting any of them raises a question about the people attached
 * to them that a delete button must not answer on its own.
 *
 * So this refuses every other role rather than doing something surprising, and
 * says who to ask instead.
 *
 * ---------------------------------------------------------------------------
 * THE PASSWORD IS PROVED FIRST
 * ---------------------------------------------------------------------------
 * Same reasoning api.ts gives for changing an email, and more so: this is
 * irreversible. An unattended signed-in laptop must not be one click away from
 * destroying somebody's account, so the current password is re-checked against
 * a throwaway client that cannot touch this session.
 *
 * ---------------------------------------------------------------------------
 * WHAT DELETING THE AUTH USER ACTUALLY DOES
 * ---------------------------------------------------------------------------
 * `profiles.id` references `auth.users` ON DELETE CASCADE, and the forty-odd
 * keys pointing at `profiles` are already split correctly: CASCADE for what IS
 * the person, SET NULL for records of what they DID. One call therefore erases
 * their enrolments, their push subscriptions and their private AI requests,
 * while leaving audit events and AI spend counted and detached.
 *
 * db/096 moved `course_purchases` from the first group to the second, so a
 * closure no longer deletes the record that money was received.
 */
app.post('/api/account/close', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const password = String(req.body?.password ?? '')
  if (!password) {
    return res.status(400).json({ error: 'Enter your password to confirm.' })
  }

  try {
    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    const { data: me } = await admin
      .from('profiles')
      .select('id, role, email')
      .eq('id', user.id)
      .single()

    if (me?.role !== 'individual') {
      return res.status(403).json({
        error:
          'Only an account with no school attached can be closed from here. Ask your school administrator, or Special Miles, to close this one.',
      })
    }

    // Prove the password against a client that holds no session of its own, so
    // a wrong answer cannot disturb the one making the request.
    const checker = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: wrongPassword } = await checker.auth.signInWithPassword({
      email: me.email ?? user.email,
      password,
    })
    if (wrongPassword) {
      return res.status(403).json({ error: 'That password is not right.' })
    }

    /*
     * COUNTED BEFORE THE DELETE, because afterwards there is nothing to count.
     * The response tells them what actually happened rather than a generic
     * "done", and it is the last thing this account will ever be told.
     */
    const [{ count: enrolments }, { count: suggestions }, { count: purchases }] =
      await Promise.all([
        admin
          .from('course_enrolments')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', user.id),
        admin
          .from('individual_ai_requests')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', user.id),
        admin
          .from('course_purchases')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', user.id)
          .eq('status', 'paid'),
      ])

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) {
      console.error('Account closure failed:', deleteError)
      return res.status(500).json({
        error:
          'Your account could not be closed. Nothing has been changed — please try again, or write to us.',
      })
    }

    /*
     * RECORDED AFTER THE FACT, WITH NO NAME. Special Miles is entitled to know
     * that an account closed — it is the only signal that the product lost
     * somebody — and is not entitled to a parting record of who. recordEvent
     * writes to the table db/027 built for things a person should see.
     */
    recordEvent(
      'info',
      'account',
      'account_closed',
      `An individual account was closed. ${enrolments ?? 0} enrolment(s) and ${
        suggestions ?? 0
      } saved suggestion(s) were deleted; ${
        purchases ?? 0
      } purchase record(s) were kept and detached.`,
    )

    return res.json({
      closed: true,
      enrolmentsDeleted: enrolments ?? 0,
      suggestionsDeleted: suggestions ?? 0,
      purchasesKept: purchases ?? 0,
    })
  } catch (err) {
    console.error('Account closure failed:', err)
    return res.status(500).json({ error: 'Could not close the account.' })
  }
})

/**
 * What the AI is told about somebody, when they have said it may be — db/107.
 *
 * ---------------------------------------------------------------------------
 * TWO KINDS OF THING, AND ONLY ONE OF THEM NEEDED PERMISSION
 * ---------------------------------------------------------------------------
 * Previous QUESTIONS were written to be sent to the AI, were sent to it, and
 * are stored already redacted. Including them again discloses nothing new.
 *
 * Goals and check-in notes were written under a promise — "nobody else can see
 * any of this" — on the screen where they were typed. An AI is somebody else.
 * That is what the switch is for, and why nothing here runs without it.
 *
 * ---------------------------------------------------------------------------
 * SMALL ON PURPOSE
 * ---------------------------------------------------------------------------
 * Three goals, four check-ins, three questions. Not because of tokens, but
 * because a model given six months of somebody's worst weeks writes about the
 * six months instead of about the question in front of it. Recent is what
 * makes an answer feel informed; everything is what makes it feel like being
 * profiled.
 *
 * REDACTED LIKE EVERYTHING ELSE. Consent is about who reads it, never about
 * whether somebody's name goes with it, so this runs through the same `redact`
 * the question does and its redactions are counted into the same total.
 */
async function historyFor(userId, names) {
  const [goals, asks] = await Promise.all([
    admin
      .from('individual_goals')
      .select('title, why, status, individual_goal_checkins (how_it_went, note, created_at)')
      .eq('profile_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(3),
    admin
      .from('individual_ai_requests')
      // Named for the same reason as in api.ts — db/110 made this ambiguous.
      .select('asked, created_at, individual_ai_suggestions!individual_ai_suggestions_request_id_fkey (title, outcome)')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const lines = []
  let redactions = 0

  const clean = (text) => {
    const out = redact(text ?? '', names, '[ME]')
    redactions += out.redactions
    return out.text
  }

  for (const g of goals.data ?? []) {
    const checkins = [...(g.individual_goal_checkins ?? [])]
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 4)
    lines.push(
      `- Working on: ${clean(g.title)}${
        g.why ? ` (their reason: ${clean(g.why)})` : ''
      }`,
    )
    for (const c of checkins) {
      lines.push(
        `    check-in: ${c.how_it_went}${c.note ? ` — ${clean(c.note)}` : ''}`,
      )
    }
  }

  /* The current question is not in this list — it has not been saved yet —
     so there is no risk of the model being shown its own prompt twice. */
  for (const a of asks.data ?? []) {
    lines.push(`- Asked before: ${clean(a.asked)}`)
    /*
     * db/108. THE MOST USEFUL THING IN HERE. Everything else tells the model
     * what somebody is doing; this tells it what it got wrong. Without it the
     * model will cheerfully suggest again, in September, the thing they tried
     * in March and abandoned in April — and the person will conclude it is not
     * listening, which it was not.
     */
    for (const s of a[
      'individual_ai_suggestions'
    ] ?? []) {
      if (s.outcome === 'helped') {
        lines.push(`    you suggested "${clean(s.title)}" and it HELPED`)
      } else if (s.outcome === 'didnt_help') {
        lines.push(
          `    you suggested "${clean(s.title)}" and it did NOT help — do not suggest it again`,
        )
      }
    }
  }

  return { text: lines.join('\n'), redactions, used: lines.length > 0 }
}

/**
 * POST /api/self-strategies  { text }
 *
 * Somebody asking about their own life — db/094.
 *
 * ---------------------------------------------------------------------------
 * INDIVIDUALS ONLY, AND THIS IS A SECURITY CHECK RATHER THAN A TIDY ONE
 * ---------------------------------------------------------------------------
 * /api/strategies puts a child's behaviour through guardian consent, quota,
 * anonymisation against the whole roster, and a specialist's review queue.
 * This route has no consent to check and no specialist to route to, because
 * the person writing is the person it is about.
 *
 * That makes it a bypass for anybody else. A teacher who typed "my student
 * kicked a chair" here would get unreviewed suggestions about a child with no
 * guardian consulted — the exact thing FR25 exists to prevent. So the role is
 * checked, and it is checked from the PROFILE rather than the token's metadata,
 * which a client controls at sign-up.
 *
 * Students are excluded for the same reason in reverse: a student has a school,
 * and their school's safeguarding people are entitled to be in the loop.
 */
app.post('/api/self-strategies', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const text = String(req.body?.text ?? '').trim()
  const aboutSuggestionId = req.body?.aboutSuggestionId ?? null

  /*
   * A FOLLOW-UP MAY BE SHORT, and a fresh question may not.
   *
   * Twenty characters is right for a cold start: three words about a whole
   * situation produces a thin answer. A follow-up arrives with the original
   * question and the suggestion attached, so "I share a room" is fourteen
   * characters and completely sufficient — and rejecting it would be the
   * product refusing the most natural thing somebody could type.
   */
  const minimum = aboutSuggestionId ? 5 : 20
  if (text.length < minimum) {
    return res.status(400).json({
      error: aboutSuggestionId
        ? 'A few words about what is in the way is enough.'
        : 'Tell it a bit more about the situation — a sentence or two gives it something to work with.',
    })
  }
  if (text.length > 2000) {
    return res
      .status(400)
      .json({ error: 'That is longer than this can take. Try the essentials in a paragraph or two.' })
  }

  try {
    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    const { data: me } = await admin
      .from('profiles')
      .select('id, role, first_name, last_name, ai_may_use_my_history')
      .eq('id', user.id)
      .single()

    if (me?.role !== 'individual') {
      return res.status(403).json({
        error:
          'This is only for accounts that belong to no school. If you are asking about a student, use the behaviour log so consent and specialist review apply.',
      })
    }

    // --- Is the AI switched on at all? (FR20/21 kill switch) ---------------
    const { data: controls } = await admin
      .from('ai_controls')
      .select(
        'ai_enabled, confidence_threshold, free_model, paid_model, free_confidence_threshold, free_daily_limit_per_user',
      )
      .eq('id', true)
      .single()

    if (!controls?.ai_enabled) {
      return res.status(503).json({
        error: 'AI suggestions are switched off at the moment. The courses and reading still work.',
      })
    }

    // --- Which tier, and therefore which model and which limits ----------
    // db/099. The tier is asked of the database rather than worked out here,
    // because "has this person paid us anything" will change the day a
    // subscription exists and there must be one place that answers it.
    const { data: tier } = await userClient.rpc('my_ai_tier')
    const paidTier = tier === 'paid'
    const firstModel = paidTier ? controls.paid_model : controls.free_model

    // --- Quota (db/026) ----------------------------------------------------
    // A null school makes the per-school half of this vacuous, which is right:
    // there is no school to share a budget with. The per-user limit still
    // counts by `requested_by` and is the one that applies here.
    const { data: quota } = await admin
      .rpc('ai_quota_status', { p_school_id: null, p_actor_id: user.id })
      .single()

    /*
     * THE FREE LIMIT IS THE LOWER OF THE TWO, never higher than the paid one —
     * db/099 constrains that in the schema so this cannot drift into giving
     * somebody more for paying less.
     */
    const userLimit = paidTier
      ? (quota?.user_limit ?? 40)
      : Number(controls.free_daily_limit_per_user ?? 10)

    if (quota && quota.user_used >= userLimit) {
      return res.status(429).json({
        error: paidTier
          ? `You have used all ${userLimit} suggestions available in the last 24 hours. Nothing else on your account is affected.`
          : `You have used all ${userLimit} free suggestions for today. They reset in 24 hours, and buying a course lifts the limit. Nothing else on your account is affected.`,
      })
    }

    // --- Anonymise ---------------------------------------------------------
    // Their own name, and the pattern rules that take emails, phone numbers
    // and dates with them. Somebody writing "I'm Ada and I can't get started"
    // has no reason to have sent us their name, so it does not travel.
    const namesToRemove = [me.first_name, me.last_name].filter(Boolean)
    const { text: redacted, redactions } = redact(text, namesToRemove, '[ME]')

    /*
     * db/110. WHICH SUGGESTION THEY ARE ASKING ABOUT, READ AS THEM.
     *
     * The browser sends an id and nothing else, and this reads the suggestion
     * with the CALLER'S token — so RLS answers whether it is theirs. A forged
     * id belonging to somebody else returns nothing and the follow-up is
     * simply treated as a fresh question, which is the safe way to fail.
     */
    let about = null
    if (aboutSuggestionId) {
      const { data } = await userClient
        .from('individual_ai_suggestions')
        .select('id, title, body')
        .eq('id', aboutSuggestionId)
        .maybeSingle()
      about = data ?? null
    }

    /* db/107. Only when they have said so, and counted into the same
       redaction total — the number on the screen has to describe everything
       that left, not just the part they typed today. */
    const history = me.ai_may_use_my_history
      ? await historyFor(user.id, namesToRemove)
      : { text: '', redactions: 0, used: false }

    /* The suggestion goes through the same redaction as everything else. It
       is the model's own words, so nothing should be found in it — and that
       is exactly why it is cheap to check rather than assume. */
    const aboutClean = about
      ? redact(`${about.title}
${about.body}`, namesToRemove, '[ME]')
      : { text: '', redactions: 0 }

    const payload = {
      text: redacted,
      redactions: redactions + history.redactions + aboutClean.redactions,
      history: history.used ? history.text : null,
      about: about ? aboutClean.text : null,
    }

    /* --- Generate, cheaply, and escalate when it matters -----------------
     *
     * db/099 has the measurements. The short version: the cheap model spots
     * distress as reliably as the expensive one — four agreements out of four,
     * including the understated case — and then returns NO STRATEGIES AT ALL
     * on exactly those cases, where the expensive one returns three.
     *
     * So somebody having the worst day of their year would have asked for help
     * and got an empty screen, and only if they had never paid. That is the
     * fault db/094 was written around, pointed at somebody in trouble.
     *
     * Hence: cheap by default, run again on the capable model if the answer
     * comes back risk-flagged or empty. It is rare, so it costs almost
     * nothing, and it means the model somebody gets in a crisis does not
     * depend on whether they have ever paid us.
     *
     * The escalation is NOT conditional on the free tier. A paid request that
     * somehow returns nothing gets the same second chance; there is no reason
     * to make that path worse just because it is already the good model, and
     * `firstModel === controls.paid_model` makes the retry a no-op decision
     * rather than a special case.
     */
    /*
     * The threshold has to be known before the escalation decision, because
     * "came back with nothing" includes coming back with three suggestions
     * that all fall under the bar. A free tier that answers "1 shown, 2 held
     * back" is a poor answer; one that shows nothing at all is the empty
     * screen again, arrived at the long way round.
     */
    const barFor = (model) =>
      model === controls.paid_model
        ? Number(controls.confidence_threshold ?? 0.7)
        : Number(controls.free_confidence_threshold ?? 0.8)

    const wouldShow = (r, model) =>
      r.strategies.filter(
        (s) => !s.safetyConcern && s.confidence >= barFor(model),
      ).length

    let result = await generateSelfStrategies(payload, namesToRemove, firstModel)
    let escalated = false

    const needsBetterModel =
      firstModel !== controls.paid_model &&
      (result.riskFlag || wouldShow(result, firstModel) === 0)

    if (needsBetterModel) {
      try {
        result = await generateSelfStrategies(
          payload,
          namesToRemove,
          controls.paid_model,
        )
        escalated = true
      } catch (escalationError) {
        /*
         * KEEP THE CHEAP ANSWER RATHER THAN FAILING. If the second call is
         * refused or rate-limited, the first result still holds a risk flag,
         * and the screen's support panel depends on that flag reaching them.
         * Losing it to an error would remove the one part of the answer that
         * matters most.
         */
        console.error('Escalation failed, keeping the first answer:', escalationError)
        recordEvent(
          'warning',
          'ai',
          'escalation_failed',
          'A risk-flagged answer could not be re-run on the capable model. The first answer was kept.',
        )
      }
    }

    // --- Shown, or withheld for good ---------------------------------------
    // No third option. db/094 explains why there is no review state: a
    // `pending_review` row here waits on a specialist who does not exist.
    //
    // THE THRESHOLD FOLLOWS THE MODEL THAT ACTUALLY ANSWERED. db/099 measured
    // the cheap model scoring itself consistently higher for the same quality
    // of answer — 0.77 and 0.85 against 0.69 and 0.76 — so one number applied
    // to both would let more weak output through from the weaker model, which
    // is precisely backwards.
    const answeredBy = escalated ? controls.paid_model : firstModel
    const threshold = barFor(answeredBy)
    const shown = []
    let withheldSafety = 0
    let withheldConfidence = 0

    for (const s of result.strategies) {
      if (s.safetyConcern) withheldSafety++
      else if (s.confidence < threshold) withheldConfidence++
      else shown.push(s)
    }

    const withheldCount = withheldSafety + withheldConfidence
    const withheldReason =
      withheldCount === 0
        ? null
        : withheldSafety > 0 && withheldConfidence > 0
          ? 'One needed somebody qualified involved to be safe, and another was too much of a guess to be worth your time.'
          : withheldSafety > 0
            ? 'It needed somebody qualified involved to be safe, and there is nobody attached to this account to check it.'
            : 'It was too much of a guess to be worth your time.'

    // Written with the service key: neither table has an insert policy, so a
    // browser cannot invent a suggestion and read it back as the model's.
    const { data: request, error: requestError } = await admin
      .from('individual_ai_requests')
      .insert({
        profile_id: user.id,
        asked: redacted,
        about_suggestion_id: about?.id ?? null,
        redaction_count: payload.redactions,
        risk_flagged: result.riskFlag,
        withheld_count: withheldCount,
        withheld_reason: withheldReason,
        model: result.model,
        prompt_version: SELF_PROMPT_VERSION,
      })
      .select('id, created_at, risk_flagged, withheld_count, withheld_reason, asked')
      .single()

    if (requestError) return dbFailed(res, 'requestError', requestError)

    let inserted = []
    if (shown.length > 0) {
      const { data, error: insertError } = await admin
        .from('individual_ai_suggestions')
        .insert(
          shown.map((s) => ({
            request_id: request.id,
            title: s.title,
            body: s.body,
            rationale: s.rationale,
            confidence: s.confidence,
          })),
        )
        .select('id, title, body, rationale, confidence')

      if (insertError) return dbFailed(res, 'insertError', insertError)
      inserted = data ?? []
    }

    /*
     * Record the request — db/026, and the same reasoning as /api/strategies:
     * after the model answered, because this counts what cost money, and never
     * allowed to fail the response. school_id is null and behaviour_log_id is
     * null; both columns are nullable and this is the case they are nullable
     * for.
     */
    void admin
      .from('ai_generation_events')
      .insert({
        school_id: null,
        requested_by: user.id,
        behaviour_log_id: null,
        strategies_returned: inserted.length,
        model: result.model,
        escalated,
      })
      .then(({ error: usageError }) => {
        if (usageError) console.error('Usage not recorded:', usageError.message)
      })

    /*
     * NOBODY IS NOTIFIED ON A RISK FLAG, and db/094 argues that at length.
     * The school flow tells the safeguarding leads because the subject is a
     * child. Here the subject is an adult who was promised that nothing they
     * do on these pages is reported to anybody, and the screen answers a flag
     * by showing them where to find human help rather than by filing a report
     * about them.
     */

    return res.json({
      requestId: request.id,
      suggestions: inserted,
      withheldCount,
      withheldReason,
      riskFlagged: result.riskFlag,
      // payload.redactions, NOT the bare count from the question. db/107 added
      // the history to what gets sent, and it goes through the same redaction —
      // but this line kept reporting only what was stripped from what they
      // typed today. The screen says "N details were removed before this was
      // sent", and N was quietly wrong the moment memory was switched on.
      redactions: payload.redactions,
    })
  } catch (err) {
    if (err instanceof AnonymisationError) {
      recordEvent('critical', 'ai', 'anonymisation_blocked', err.message)
      return res.status(500).json({
        error:
          'Blocked: the check that strips personal details found something it could not remove, so nothing was sent.',
      })
    }
    if (err instanceof RefusalError) {
      return res.status(422).json({ error: err.message })
    }
    if (err?.status === 429) {
      return res.status(429).json({ error: 'The AI is busy right now. Try again shortly.' })
    }
    if (err?.status === 401) {
      console.error('Anthropic rejected the API key.')
      return res.status(500).json({ error: 'The AI service is not configured correctly.' })
    }
    console.error('Self-strategy generation failed:', err)
    return res.status(500).json({ error: 'Could not generate suggestions.' })
  }
})

/**
 * Three things a family could try, from something that happened at home.
 *
 * db/114, FR9 and P06. The third generator and the third route, and the
 * differences from the other two are the whole design:
 *
 * `/api/strategies` writes to a teacher about a classroom and routes anything
 * unsure to a specialist. `/api/self-strategies` writes to an adult about
 * themselves and has nowhere to route, so it discards what it cannot show.
 * A parent is neither: writing about somebody else, at home, with a specialist
 * attached to that child who CAN be asked.
 *
 * So nothing here is discarded. Everything under the bar — low confidence or
 * flagged as needing a professional — is written as `pending_review` and waits
 * for the child's specialist, which is exactly what FR9 asks for and what
 * db/094's header says it could not do.
 *
 * THE SCHOOL'S BUDGET IS NOT TOUCHED. `p_school_id: null` on the quota call, on
 * purpose: a family's private observation is not the school's spend, and
 * letting it draw on the school's daily allowance would let somebody outside
 * the building exhaust a classroom's quota. The per-user limit still applies
 * and is the one that matters here.
 */
app.post('/api/home-strategies', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const observationId = String(req.body?.observationId ?? '').trim()
  if (!observationId) {
    return res.status(400).json({ error: 'Which observation?' })
  }

  try {
    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    /*
     * READ THE OBSERVATION WITH THE CALLER'S TOKEN. RLS decides whether this
     * person may see it at all, so a parent cannot ask for suggestions about
     * another family's child by pasting an id — the row simply does not come
     * back. This is the same reason the booking routes write with the caller's
     * token rather than checking a guardian link by hand here.
     */
    const { data: observation, error: obsError } = await userClient
      .from('home_observations')
      .select('id, student_id, title, body, category, logged_by')
      .eq('id', observationId)
      .maybeSingle()

    if (obsError) return dbFailed(res, 'obsError', obsError)
    if (!observation) {
      return res.status(404).json({
        error: 'That observation could not be found on your account.',
      })
    }

    const { data: me } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single()

    if (me?.role !== 'parent') {
      return res.status(403).json({
        error:
          'This is for families writing about their own child. Staff should use the behaviour log, where specialist review and consent already apply.',
      })
    }

    // --- Is the AI switched on at all? (FR20/21 kill switch) ---------------
    const { data: controls } = await admin
      .from('ai_controls')
      .select(
        'ai_enabled, confidence_threshold, free_model, paid_model, free_confidence_threshold, free_daily_limit_per_user, daily_limit_per_user',
      )
      .eq('id', true)
      .single()

    if (!controls?.ai_enabled) {
      return res.status(503).json({
        error:
          'Suggestions are switched off at the moment. Your observation has been saved and the school can still see it.',
      })
    }

    // --- Already answered? -------------------------------------------------
    // A second press must not spend a second generation. The teacher route
    // makes the same check for the same reason.
    const { data: existing } = await admin
      .from('home_ai_requests')
      .select('id')
      .eq('observation_id', observation.id)
      .maybeSingle()

    if (existing) {
      return res.json({ alreadyGenerated: true })
    }

    // --- Which tier, and therefore which model and which limits ------------
    // db/099 through db/111. `my_ai_tier()` asks about the CALLER rather than
    // their role, so a parent answers 'free' today and will answer 'paid' the
    // day a family subscription exists, with nothing here to change.
    const { data: tier } = await userClient.rpc('my_ai_tier')
    const paidTier = tier === 'paid'
    const firstModel = paidTier ? controls.paid_model : controls.free_model

    const { data: quota } = await admin
      .rpc('ai_quota_status', { p_school_id: null, p_actor_id: user.id })
      .single()

    const userLimit = paidTier
      ? (quota?.user_limit ?? controls.daily_limit_per_user ?? 40)
      : Number(controls.free_daily_limit_per_user ?? 10)

    if (quota && quota.user_used >= userLimit) {
      return res.status(429).json({
        error: `That is ${userLimit} suggestions in the last twenty-four hours, which is the daily limit. Your observation is saved and the school can see it; try again tomorrow.`,
      })
    }

    // --- Anonymise ---------------------------------------------------------
    // Every child at the school, not only this one: a parent writing "he hit
    // Maya at the park" would otherwise send a child this request has nothing
    // to do with. The guardians' own names go too — the family is as entitled
    // to that as the child is.
    const { data: student } = await admin
      .from('students')
      .select('id, first_name, last_name, school_id')
      .eq('id', observation.student_id)
      .single()

    const { data: roster } = await admin
      .from('students')
      .select('first_name, last_name')
      .eq('school_id', student.school_id)

    const { data: household } = await admin
      .from('student_guardians')
      .select('profiles ( first_name, last_name )')
      .eq('student_id', observation.student_id)

    const namesToRemove = [
      ...(roster ?? []).flatMap((s) => [s.first_name, s.last_name]),
      ...(household ?? []).flatMap((g) => [
        g.profiles?.first_name,
        g.profiles?.last_name,
      ]),
    ].filter(Boolean)

    const { text: redacted, redactions } = redact(
      `${observation.title}\n\n${observation.body}`,
      namesToRemove,
    )

    const payload = {
      text: redacted,
      redactions,
      category: observation.category ?? null,
    }

    // --- Generate, escalating when the cheap model comes back empty --------
    // db/099's reasoning, unchanged: a family having a bad night should not
    // get a worse model than one who has paid, and the escalation is rare
    // enough to cost almost nothing.
    const barFor = (model) =>
      model === controls.paid_model
        ? Number(controls.confidence_threshold ?? 0.7)
        : Number(controls.free_confidence_threshold ?? 0.8)

    const wouldShow = (r, model) =>
      r.strategies.filter(
        (s) => !s.safetyConcern && s.confidence >= barFor(model),
      ).length

    let result = await generateHomeStrategies(payload, namesToRemove, firstModel)
    let escalated = false

    const needsBetterModel =
      firstModel !== controls.paid_model &&
      (result.riskFlag || wouldShow(result, firstModel) === 0)

    if (needsBetterModel) {
      try {
        result = await generateHomeStrategies(
          payload,
          namesToRemove,
          controls.paid_model,
        )
        escalated = true
      } catch (escalationError) {
        console.error('Escalation failed, keeping the first answer:', escalationError)
        recordEvent(
          'warning',
          'ai',
          'escalation_failed',
          'A risk-flagged home observation could not be re-run on the capable model. The first answer was kept.',
        )
      }
    }

    // --- Shown now, or waiting for the specialist --------------------------
    // NOT withheld. This is the difference from db/094: the child has staff,
    // so a suggestion under the bar has somebody to wait for rather than
    // nowhere to go.
    const answeredBy = escalated ? controls.paid_model : firstModel
    const threshold = barFor(answeredBy)

    const rows = result.strategies.map((s) => {
      const held = s.safetyConcern || s.confidence < threshold
      return {
        title: s.title,
        body: s.body,
        rationale: s.rationale,
        confidence: s.confidence,
        status: held ? 'pending_review' : 'published',
        routing_reason: !held
          ? null
          : s.safetyConcern
            ? 'The model judged this needs somebody qualified involved before a family tries it.'
            : `Confidence ${s.confidence.toFixed(2)} is below the ${threshold} bar for ${answeredBy}.`,
      }
    })

    const heldCount = rows.filter((r) => r.status === 'pending_review').length

    // --- Write it, with the service key ------------------------------------
    // Neither table has an insert policy, so a browser cannot invent a
    // suggestion and read it back as advice the school had settled.
    const { data: request, error: requestError } = await admin
      .from('home_ai_requests')
      .insert({
        observation_id: observation.id,
        student_id: observation.student_id,
        asked_by: user.id,
        asked: redacted,
        redaction_count: redactions,
        risk_flagged: result.riskFlag,
        withheld_count: heldCount,
        withheld_reason:
          heldCount === 0
            ? null
            : 'Waiting for your child’s specialist to look at it. You will see it here if they release it.',
        model: result.model,
        prompt_version: HOME_PROMPT_VERSION,
      })
      .select('id, created_at, risk_flagged, withheld_count, withheld_reason')
      .single()

    if (requestError) return dbFailed(res, 'requestError', requestError)

    let inserted = []
    if (rows.length > 0) {
      const { data, error: insertError } = await admin
        .from('home_ai_strategies')
        .insert(rows.map((r) => ({ ...r, request_id: request.id })))
        .select('id, title, body, rationale, confidence, status')

      if (insertError) return dbFailed(res, 'insertError', insertError)
      inserted = data ?? []
    }

    // --- The spend record --------------------------------------------------
    // school_id null: see the note at the top of this route.
    await admin.from('ai_generation_events').insert({
      school_id: null,
      requested_by: user.id,
      home_observation_id: observation.id,
      strategies_returned: inserted.length,
      model: result.model,
    })

    res.json({
      requestId: request.id,
      // Only the settled ones. A held suggestion is invisible to the family by
      // policy, and sending its text here would put it on their screen anyway.
      strategies: inserted.filter((s) => s.status === 'published'),
      heldForReview: heldCount,
      heldReason: request.withheld_reason,
      riskFlagged: result.riskFlag,
      redactions,
      escalated,
    })
  } catch (error) {
    if (error instanceof AnonymisationError) {
      console.error('Anonymisation refused a home observation:', error)
      return res.status(500).json({
        error:
          'That could not be sent safely, so it was not sent at all. Your observation is saved and the school can see it.',
      })
    }
    if (error instanceof RefusalError) {
      return res.status(422).json({ error: error.message })
    }
    console.error('/api/home-strategies failed:', error)
    res.status(500).json({ error: 'Suggestions could not be generated just now.' })
  }
})


/**
 * GET /api/strategy-status/:studentId
 *
 * Counts, per behaviour log, of what the AI produced and what happened to it.
 *
 * WHY THIS EXISTS. A teacher's RLS policy on `ai_strategies` deliberately
 * returns only published and approved rows — they must not read the text of a
 * suggestion a specialist is still weighing, or one that was rejected. Correct.
 * But it also means the browser cannot tell "nothing was ever generated" apart
 * from "three were generated and rejected", and those need opposite things
 * said about them. Previously the second case rendered as a bare "Suggest
 * strategies" button, as though nothing had ever happened.
 *
 * So this returns COUNTS and the specialist's note — never the suggestion
 * bodies. The teacher learns the state of their own request without gaining
 * access to withheld content.
 *
 * Authorisation is the same as everywhere else: the logs are read with the
 * caller's token, so RLS decides which student they may ask about. The service
 * key is used only for the counting query, after that check has passed.
 */
app.get('/api/strategy-status/:studentId', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  try {
    const userClient = clientForUser(token)
    const {
      data: { user },
    } = await userClient.auth.getUser()
    if (!user) return res.status(401).json({ error: 'Your session has expired.' })

    // RLS is the check: a caller not entitled to this student gets no logs.
    const { data: logs, error: logError } = await userClient
      .from('behaviour_logs')
      .select('id')
      .eq('student_id', req.params.studentId)

    if (logError) return dbFailed(res, 'logError', logError)
    if (!logs || logs.length === 0) return res.json({ logs: {} })

    const { data: rows, error: rowError } = await admin
      .from('ai_strategies')
      .select('behaviour_log_id, status, review_note, reviewed_at')
      .in(
        'behaviour_log_id',
        logs.map((l) => l.id),
      )

    if (rowError) return dbFailed(res, 'rowError', rowError)

    const byLog = {}
    for (const row of rows ?? []) {
      const entry = (byLog[row.behaviour_log_id] ??= {
        visible: 0,
        pending: 0,
        rejected: 0,
        reviewNote: null,
        reviewedAt: null,
      })

      if (row.status === 'published' || row.status === 'approved') entry.visible++
      else if (row.status === 'pending_review') entry.pending++
      else if (row.status === 'rejected') {
        entry.rejected++
        // Keep the most recent note — the specialist's reason is the single
        // most useful thing a teacher can be told here.
        if (row.review_note && (!entry.reviewedAt || row.reviewed_at > entry.reviewedAt)) {
          entry.reviewNote = row.review_note
          entry.reviewedAt = row.reviewed_at
        }
      }
    }

    return res.json({ logs: byLog })
  } catch (err) {
    console.error('strategy-status failed:', err)
    return res.status(500).json({ error: 'Could not load strategy status.' })
  }
})

/**
 * Failed recovery attempts, per user, in memory.
 *
 * Honest about what this is: a speed bump. It resets when the server restarts
 * and does not survive more than one process. The real defence is that a
 * recovery code is 80 bits of random — guessing one is not a strategy — and
 * that each code dies the moment it is used. This exists so a script cannot
 * hammer the endpoint for free, not because the codes are weak.
 */
const recoveryAttempts = new Map()
const MAX_ATTEMPTS = 10
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000

function tooManyAttempts(userId) {
  const record = recoveryAttempts.get(userId)
  if (!record) return false
  if (Date.now() - record.first > ATTEMPT_WINDOW_MS) {
    recoveryAttempts.delete(userId)
    return false
  }
  return record.count >= MAX_ATTEMPTS
}

function noteFailedAttempt(userId) {
  const record = recoveryAttempts.get(userId)
  if (!record || Date.now() - record.first > ATTEMPT_WINDOW_MS) {
    recoveryAttempts.set(userId, { count: 1, first: Date.now() })
  } else {
    record.count++
  }
}

/**
 * POST /api/mfa/recover  { code }
 *
 * The way back in for someone who has lost their authenticator.
 *
 * WHAT IT DOES NOT DO: let them past the second factor. Supabase decides that,
 * and it will not accept anything but a real code. What this does is REMOVE
 * the authenticator, so the account drops back to password-only and a new
 * phone can be enrolled. Removing a factor is something a user cannot do
 * themselves — Supabase requires aal2 for that, and someone locked out is by
 * definition not at aal2 — which is the entire reason this endpoint exists.
 *
 * THE USER ID COMES FROM THE TOKEN, NEVER FROM THE BODY. Taking "which user"
 * from the request would let any signed-in person spend another person's
 * recovery codes and strip their second factor. The caller proves who they are
 * with their own session; all they supply is the code.
 */
app.post('/api/mfa/recover', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { code } = req.body ?? {}
  if (typeof code !== 'string' || code.trim() === '') {
    return res.status(400).json({ error: 'Enter a recovery code.' })
  }

  try {
    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    if (tooManyAttempts(user.id)) {
      return res.status(429).json({
        error:
          'Too many incorrect recovery codes. Wait fifteen minutes, or ask a platform administrator to reset two-factor authentication on your account.',
      })
    }

    // The database decides. It matches the hash and marks the code used in one
    // statement, so two simultaneous requests cannot both spend the same code.
    const { data: accepted, error: redeemError } = await admin.rpc(
      'redeem_recovery_code',
      { p_user_id: user.id, p_code: code },
    )

    if (redeemError) {
      console.error('redeem_recovery_code failed:', redeemError.message)
      return res.status(500).json({ error: 'Could not check that code.' })
    }

    if (!accepted) {
      noteFailedAttempt(user.id)
      // Deliberately the same answer for "wrong" and "already used". Which one
      // it was is information about the account's codes.
      return res
        .status(400)
        .json({ error: 'That recovery code is not valid or has already been used.' })
    }

    // Code spent. Now remove every authenticator on the account, using the
    // service key — this is the step the browser is not permitted to take.
    const { data: full, error: lookupError } =
      await admin.auth.admin.getUserById(user.id)
    if (lookupError) {
      console.error('getUserById failed:', lookupError.message)
      return res.status(500).json({ error: 'Could not read your account.' })
    }

    let removed = 0
    for (const factor of full.user.factors ?? []) {
      const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: user.id,
      })
      if (deleteError) {
        console.error('deleteFactor failed:', deleteError.message)
        return res.status(500).json({
          error:
            'Your code was accepted but the authenticator could not be removed. Ask a platform administrator.',
        })
      }
      removed++
    }

    recoveryAttempts.delete(user.id)

    return res.json({ removed })
  } catch (err) {
    console.error('MFA recovery failed:', err)
    return res.status(500).json({ error: 'Could not complete recovery.' })
  }
})

/**
 * POST /api/mfa/admin-reset  { userId }
 *
 * The last resort: a Platform Admin clears someone's two-factor authentication
 * when both the phone and the ten recovery codes are gone.
 *
 * AUTHORISATION IS NOT DECIDED HERE. This reads the caller's id from their own
 * token and hands it to `admin_reset_mfa`, which checks the role, clears the
 * recovery codes and writes the audit row in one transaction. If this server
 * had a bug that let the wrong person through, the database would still refuse.
 *
 * The database call comes FIRST and the factor deletion second, on purpose. An
 * unlogged reset is worse than a failed one: if deletion then fails, the log
 * shows an attempt that has to be retried, which is true and visible.
 */
app.post('/api/mfa/admin-reset', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { userId } = req.body ?? {}
  if (!userId) return res.status(400).json({ error: 'userId is required.' })

  try {
    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    const { data: label, error: resetError } = await admin.rpc(
      'admin_reset_mfa',
      { p_actor_id: user.id, p_subject_id: userId },
    )

    if (resetError) {
      // 42501 is the "not a Platform Admin" refusal raised by the function.
      const denied = resetError.code === '42501'
      console.error('admin_reset_mfa refused:', resetError.message)
      return res
        .status(denied ? 403 : 500)
        .json({ error: resetError.message })
    }

    const { data: full, error: lookupError } =
      await admin.auth.admin.getUserById(userId)
    if (lookupError) {
      return res.status(500).json({
        error:
          'The reset was recorded but their account could not be read. Try again.',
      })
    }

    let removed = 0
    for (const factor of full.user.factors ?? []) {
      const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId,
      })
      if (deleteError) {
        console.error('deleteFactor failed:', deleteError.message)
        return res.status(500).json({
          error:
            'The reset was recorded but the authenticator could not be removed. Try again.',
        })
      }
      removed++
    }

    return res.json({ name: label, removed })
  } catch (err) {
    console.error('Admin MFA reset failed:', err)
    return res.status(500).json({ error: 'Could not reset two-factor.' })
  }
})

// ---------------------------------------------------------------------------
// Billing (M11)
// ---------------------------------------------------------------------------
// Stripe CHECKOUT, not a card form of our own. Stripe hosts the payment page
// on their domain, so card numbers never touch MiZanova, never reach this
// server, and never appear in a log. For a product holding children's records
// that is the only sensible answer: it removes an entire class of liability
// rather than managing it.
//
// The key is read lazily so the server still starts without it — everything
// else here works, and the two billing endpoints say plainly what is missing.
/**
 * Two DIFFERENT Stripe secrets, and they are easy to confuse:
 *
 *   STRIPE_SECRET_KEY      sk_test_…  from Developers → API keys.
 *                          Authorises calls TO Stripe.
 *   STRIPE_WEBHOOK_SECRET  whsec_…    printed by `stripe listen`.
 *                          Verifies calls FROM Stripe.
 *
 * Pasting one into the other's name has already happened once. It fails at the
 * worst moment — a parent pressing Pay — with an authentication error from
 * Stripe that says nothing about which variable is wrong. Checked at startup
 * instead, loudly, while somebody is looking at the terminal.
 */
function checkStripeEnv() {
  const key = process.env.STRIPE_SECRET_KEY
  const hook = process.env.STRIPE_WEBHOOK_SECRET

  if (key && !key.startsWith('sk_')) {
    console.error(
      '\nSTRIPE_SECRET_KEY does not look like a Stripe secret key.' +
        (key.startsWith('whsec_')
          ? '\nIt holds a whsec_… value, which is the WEBHOOK signing secret.' +
            '\nThat belongs in STRIPE_WEBHOOK_SECRET. The secret key starts sk_test_' +
            '\nand comes from the Stripe dashboard, Developers → API keys.'
          : '\nIt should start with sk_test_ (or sk_live_).') +
        '\nPayments will fail until this is fixed.\n',
    )
  }

  if (hook && !hook.startsWith('whsec_')) {
    console.error(
      '\nSTRIPE_WEBHOOK_SECRET should start with whsec_ — it is the value' +
        '\nprinted by `stripe listen`, not an API key. Webhooks will be' +
        '\nrejected until this is fixed.\n',
    )
  }

  if (key?.startsWith('sk_live_')) {
    console.warn(
      '\nSTRIPE_SECRET_KEY is a LIVE key. Real cards will be charged.\n',
    )
  }
}
checkStripeEnv()

let stripeClient = null
async function getStripe() {
  if (stripeClient) return stripeClient
  if (!process.env.STRIPE_SECRET_KEY) return null
  const { default: Stripe } = await import('stripe')
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY)
  return stripeClient
}

/**
 * Where Stripe may send someone back to. Never taken from the request alone.
 *
 * APP_URL IS FIRST, AND THAT IS THE FIX. This list previously held the two dev
 * origins and nothing else, so deployed it never matched — a browser posting
 * from https://…onrender.com is not in a list of localhost addresses — and
 * `returnOrigin` fell through to element [0]. Every parent who paid on the real
 * site was then redirected to http://localhost:5173, which is their OWN
 * machine. The payment itself succeeded, so nothing would have looked wrong on
 * Stripe's side.
 *
 * Derived from the same APP_URL and DEV_ORIGINS as the CORS list above, so the
 * two cannot drift apart. In development APP_URL is the dev server, which makes
 * element [0] correct there too.
 */
const ALLOWED_ORIGINS = [...new Set([APP_URL, ...DEV_ORIGINS])]
function returnOrigin(req) {
  const origin = req.headers.origin
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
}

/**
 * POST /api/billing/checkout  { invoiceId }
 *
 * Starts a payment and returns the Stripe page to send the parent to.
 *
 * THE AMOUNT COMES FROM THE DATABASE, NEVER THE REQUEST. The browser sends an
 * invoice id and nothing else. If it sent the amount, anyone could pay a
 * $1,250 invoice with $1 by editing one number before it left their machine —
 * and the payment would be genuine, so nothing downstream would notice.
 *
 * The invoice is read with the CALLER'S token, so RLS answers "is this yours".
 */
app.post('/api/billing/checkout', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { invoiceId } = req.body ?? {}
  if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required.' })

  try {
    const stripe = await getStripe()
    if (!stripe) {
      return res.status(503).json({
        error:
          'Payments are not configured on this server. STRIPE_SECRET_KEY is missing from .env.local.',
      })
    }

    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    // RLS decides. A parent gets only their own child's non-draft invoices.
    const { data: invoice, error: invoiceError } = await userClient
      .from('invoices')
      .select('id, description, amount_cents, currency, status')
      .eq('id', invoiceId)
      .maybeSingle()

    if (invoiceError) return dbFailed(res, 'invoiceError', invoiceError)
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' })

    if (invoice.status === 'paid') {
      return res.status(409).json({ error: 'This invoice is already paid.' })
    }
    if (invoice.status !== 'open') {
      return res.status(409).json({ error: 'This invoice is not payable.' })
    }

    const origin = returnOrigin(req)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: invoice.currency,
            unit_amount: invoice.amount_cents,
            product_data: { name: invoice.description },
          },
        },
      ],
      // Carried through Stripe and read back on return, so the confirmation
      // step knows which invoice was paid without trusting the browser again.
      metadata: { invoiceId: invoice.id },
      success_url: `${origin}/parent/finance?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/parent/finance?cancelled=1`,
    })

    return res.json({ url: session.url })
  } catch (err) {
    console.error('Checkout failed:', err)
    return res.status(500).json({ error: 'Could not start the payment.' })
  }
})

/**
 * POST /api/billing/confirm  { sessionId }
 *
 * Called when Stripe sends the parent back. Asks STRIPE whether the money
 * moved, then records it.
 *
 * The browser is not believed about payment at any point: it hands over a
 * session id, and this server asks Stripe directly what happened to it. A
 * forged id simply does not exist at Stripe.
 *
 * NOT THE ONLY CONFIRMATION PATH ANY MORE. The webhook at the top of this file
 * is the reliable one — it does not care what the browser did. This remains
 * because it is faster: the parent sees "Paid" the moment they land back here,
 * rather than whenever Stripe's notification arrives.
 *
 * Both call the same idempotent function, so whichever gets there first wins
 * and the second is a no-op. That is the point of `mark_invoice_paid`
 * returning false rather than erroring on an already-paid invoice.
 */
/**
 * POST /api/billing/course-checkout  { courseId }
 *
 * Buying a course as an individual — db/092. Joe's brief lists individual
 * program enrolments as a revenue stream, and until this existed the only
 * money in MiZanova moved between a school and somebody else.
 *
 * THE PRICE COMES FROM THE DATABASE, for the same reason db/020 gives about
 * invoices: if it travelled from the browser, a $49 course could be bought for
 * a dollar by editing one number, and the payment would be genuine so nothing
 * downstream would notice.
 *
 * THE PENDING ROW IS WRITTEN BEFORE STRIPE IS CALLED, with the service role,
 * because `course_purchases` has no insert policy at all — a browser that could
 * write one could enrol itself in anything. It carries the session id so the
 * webhook can find it again with nothing but what Stripe sends back.
 */
app.post('/api/billing/course-checkout', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { courseId } = req.body ?? {}
  if (!courseId) return res.status(400).json({ error: 'courseId is required.' })

  try {
    const stripe = await getStripe()
    if (!stripe) {
      return res.status(503).json({
        error:
          'Payments are not configured on this server. STRIPE_SECRET_KEY is missing from .env.local.',
      })
    }

    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    /* RLS decides whether this person may even see the course: published, and
       their role among its audiences. A course they cannot read cannot be
       bought, which is one fewer thing for this route to check itself. */
    const { data: course, error: courseError } = await userClient
      .from('courses')
      .select('id, title, price_cents, currency, is_published')
      .eq('id', courseId)
      .maybeSingle()

    if (courseError) return dbFailed(res, 'courseError', courseError)
    if (!course) return res.status(404).json({ error: 'Course not found.' })
    if (course.price_cents === null) {
      return res
        .status(409)
        .json({ error: 'This course is free — just start it.' })
    }

    const { data: already } = await userClient
      .from('course_purchases')
      .select('id')
      .eq('course_id', course.id)
      .eq('status', 'paid')
      .maybeSingle()

    if (already) {
      return res.status(409).json({ error: 'You have already bought this one.' })
    }

    const { data: purchase, error: purchaseError } = await admin
      .from('course_purchases')
      .insert({
        course_id: course.id,
        profile_id: user.id,
        amount_cents: course.price_cents,
        currency: course.currency,
        status: 'pending',
      })
      .select('id')
      .single()

    if (purchaseError) {
      return dbFailed(res, 'purchaseError', purchaseError)
    }

    /* Where to send them back to. Read from their profile rather than from the
       request: the return path is not a security boundary, but a browser that
       chose it could land somebody on a screen their role cannot open, which
       looks exactly like a failed payment. */
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const base = profile?.role === 'individual' ? '/individual/academy' : '/parent/academy'

    const origin = returnOrigin(req)

    /* THE ROW IS WRITTEN BEFORE STRIPE AND REMOVED IF STRIPE REFUSES.
     *
     * This order is deliberate: creating the session first and the row second
     * means a failure between them leaves somebody able to pay for a purchase
     * that was never recorded, which is the expensive mistake. This way the
     * failure leaves an unpaid row with no session id — inert, since only
     * 'paid' grants anything — and the catch below removes even that. */
    let session
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: course.currency,
              unit_amount: course.price_cents,
              product_data: { name: course.title },
            },
          },
        ],
        metadata: { kind: 'course', purchaseId: purchase.id },
        success_url: `${origin}${base}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${base}?cancelled=1`,
      })
    } catch (stripeError) {
      await admin.from('course_purchases').delete().eq('id', purchase.id)
      throw stripeError
    }

    await admin
      .from('course_purchases')
      .update({ stripe_session_id: session.id })
      .eq('id', purchase.id)

    return res.json({ url: session.url })
  } catch (err) {
    console.error('Course checkout failed:', err)
    return res.status(500).json({ error: 'Could not start the payment.' })
  }
})

/**
 * POST /api/billing/course-confirm  { sessionId }
 *
 * The fast path, exactly as `/api/billing/confirm` is for invoices: the webhook
 * is the reliable one and does not care what the browser did, but somebody who
 * has just paid should see it immediately rather than whenever Stripe's
 * notification lands. Both call the same idempotent function.
 *
 * The browser is not believed about payment at any point — it hands over a
 * session id and this server asks Stripe what happened to it.
 */
app.post('/api/billing/course-confirm', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { sessionId } = req.body ?? {}
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' })

  try {
    const stripe = await getStripe()
    if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' })

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.metadata?.kind !== 'course') {
      return res.status(400).json({ error: 'That is not a course payment.' })
    }
    if (session.payment_status !== 'paid') {
      return res.json({ paid: false })
    }

    const { error } = await admin.rpc('mark_course_purchase_paid', {
      p_session_id: session.id,
      p_payment_intent_id:
        typeof session.payment_intent === 'string' ? session.payment_intent : null,
    })
    if (error) return res.status(500).json({ error: 'Could not record payment.' })

    return res.json({ paid: true })
  } catch (err) {
    console.error('Course confirm failed:', err)
    return res.status(500).json({ error: 'Could not confirm the payment.' })
  }
})

/**
 * POST /api/billing/subscribe   -> { url }
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT course-checkout WITH A FLAG
 * ---------------------------------------------------------------------------
 * A course is bought once and the row is settled forever. A subscription has a
 * clock: it renews, it can fail to renew, it can be cancelled and keep working
 * until the month somebody paid for runs out. Stripe owns that clock, and the
 * webhook below is what keeps our copy of it honest.
 *
 * The price is NOT read from a request body. A browser that could name its own
 * price could subscribe for a cent — the plan row is the only source, and
 * db/111's check constraint refuses to mark a plan on sale without both a
 * price and a Stripe price id, so a half-configured plan cannot be bought.
 */
app.post('/api/billing/subscribe', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  try {
    const stripe = await getStripe()
    if (!stripe) {
      return res.status(503).json({
        error:
          'Payments are not configured on this server. STRIPE_SECRET_KEY is missing from .env.local.',
      })
    }

    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    const { data: plan } = await admin
      .from('individual_plan')
      .select('name, price_cents, currency, bill_every, trial_days, stripe_price_id, is_offered')
      .eq('id', 1)
      .single()

    /* NOT ON SALE IS A 409, NOT A 500. Nothing is broken — Special Miles has
       not set a price yet, which is the state this shipped in. The screen says
       so plainly rather than showing a button that fails. */
    if (!plan?.is_offered) {
      return res.status(409).json({
        error: 'There is no subscription on sale yet.',
      })
    }

    const { data: live } = await admin
      .from('individual_subscriptions')
      .select('id, status')
      .eq('profile_id', user.id)
      .in('status', ['trialing', 'active', 'past_due'])
      .maybeSingle()

    if (live) {
      return res.status(409).json({ error: 'You are already subscribed.' })
    }

    /* `returnOrigin(req)` is what the other two checkout routes use: it takes
       the caller's Origin header and refuses anything not in ALLOWED_ORIGINS,
       so a success_url cannot be pointed at somebody else's site. The first
       version of this route called an `appUrl()` that does not exist — it
       passed lint and build, because this is plain JavaScript and nothing was
       type-checking it, and then threw ReferenceError on the first real
       request. It only surfaced by putting the plan on sale and pressing the
       button. */
    const origin = returnOrigin(req)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      customer_email: user.email ?? undefined,
      /* Stripe owns the trial. Passing the number rather than implementing a
         clock here means "14 days" means the same thing on the invoice, in the
         dashboard and on the screen. Null sends nothing, which is no trial. */
      subscription_data: plan.trial_days
        ? { trial_period_days: plan.trial_days }
        : undefined,
      /* The webhook cannot ask a settled session what it was for, so it is
         told. Same reason `kind: 'course'` exists. */
      metadata: { kind: 'subscription', profileId: user.id },
      /* BACK TO WHERE THE SUBSCRIPTION ACTUALLY LIVES. This pointed at
         /account/profile, which was true until billing moved to its own
         Payments tab — so somebody who had just paid landed on a page with no
         mention of a subscription anywhere on it. The session id travels so
         the return can be confirmed immediately rather than waiting on the
         webhook, exactly as the course and invoice paths do. */
      success_url: `${origin}/account/payments?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/account/payments?cancelled=1`,
    })

    return res.json({ url: session.url })
  } catch (err) {
    /* RECORDED, NOT JUST LOGGED. A console line lives in whatever terminal the
       server happens to be running in; nobody at Special Miles reads it. This
       is the route that takes money, and the failure mode found in testing —
       a Stripe price id that does not resolve — is silent, permanent and
       invisible: every attempt fails, the person sees a toast, and the company
       learns nothing. `system_events` is the thing the platform admin's
       dashboard actually shows. */
    recordEvent(
      'critical',
      'billing',
      'subscribe_failed',
      `A subscription could not be started: ${err.message}`,
    )
    console.error('Subscribe failed:', err)
    return res.status(500).json({ error: 'Could not start the subscription.' })
  }
})

/**
 * POST /api/billing/subscription/cancel   -> { cancelAt }
 *
 * CANCELS AT THE END OF THE PERIOD, NOT NOW. Somebody who has paid for the
 * month keeps the month. Ending access the instant they press cancel is
 * charging for time and then not providing it, and it also punishes anybody
 * who cancels early precisely so they do not forget.
 *
 * Stripe is changed FIRST and our row second. A row saying 'canceled' while
 * Stripe keeps billing is worse than no button at all — the person believes
 * they have stopped paying and has not.
 */
/**
 * POST /api/billing/subscription-confirm  { sessionId }  -> { active }
 *
 * The fast path, as `/api/billing/course-confirm` is for a course. The webhook
 * is the reliable one and does not care what the browser did; this exists so
 * somebody who has just paid sees it on the page they land on rather than
 * whenever Stripe's notification arrives.
 *
 * The browser is not believed about payment at any point — it hands over a
 * session id and this server asks Stripe what happened to it.
 *
 * NO `payment_status === 'paid'` CHECK, and that is deliberate. A subscription
 * opened with a free trial settles as `no_payment_required`, because no money
 * moved. Requiring 'paid' here would reject exactly the returns a trial
 * produces — the same trap the webhook had.
 */
app.post('/api/billing/subscription-confirm', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { sessionId } = req.body ?? {}
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' })

  try {
    const stripe = await getStripe()
    if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' })

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.metadata?.kind !== 'subscription') {
      return res.status(400).json({ error: 'That is not a subscription payment.' })
    }
    if (!session.subscription) return res.json({ active: false })

    const sub = await stripe.subscriptions.retrieve(
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id,
    )
    const recorded = await recordSubscription(
      sub,
      session.metadata?.profileId ?? null,
    )
    return res.json({
      active: recorded && ['trialing', 'active', 'past_due'].includes(sub.status),
    })
  } catch (err) {
    recordEvent(
      'critical',
      'billing',
      'subscription_confirm_failed',
      `A paid subscription could not be confirmed on return: ${err.message}`,
    )
    return res.status(500).json({ error: 'Could not confirm the subscription.' })
  }
})

app.post('/api/billing/subscription/cancel', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { resume } = req.body ?? {}

  try {
    const stripe = await getStripe()
    if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' })

    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    const { data: sub } = await admin
      .from('individual_subscriptions')
      .select('id, stripe_subscription_id, status')
      .eq('profile_id', user.id)
      .in('status', ['trialing', 'active', 'past_due'])
      .maybeSingle()

    if (!sub?.stripe_subscription_id) {
      return res.status(404).json({ error: 'You do not have a subscription.' })
    }

    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: !resume,
    })

    await admin
      .from('individual_subscriptions')
      .update({ cancel_at_period_end: !resume })
      .eq('id', sub.id)

    return res.json({
      cancelAtPeriodEnd: !resume,
      endsAt: updated.current_period_end
        ? new Date(updated.current_period_end * 1000).toISOString()
        : null,
    })
  } catch (err) {
    // Same reasoning as above, and arguably worse: somebody who pressed cancel
    // and saw an error will assume they are still being charged, and they will
    // be right until a person looks at this.
    recordEvent(
      'critical',
      'billing',
      'subscription_change_failed',
      `A subscription could not be changed: ${err.message}`,
    )
    console.error('Cancel failed:', err)
    return res.status(500).json({ error: 'Could not change the subscription.' })
  }
})

app.post('/api/billing/confirm', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { sessionId } = req.body ?? {}
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' })

  try {
    const stripe = await getStripe()
    if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' })

    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid') {
      return res.json({ paid: false })
    }

    const invoiceId = session.metadata?.invoiceId
    if (!invoiceId) {
      console.error('Stripe session has no invoiceId in metadata:', sessionId)
      return res.status(500).json({ error: 'That payment could not be matched.' })
    }

    // Service key: marking an invoice paid is refused to every browser session
    // by the trigger in db/020, deliberately.
    const { data: recorded, error } = await admin.rpc('mark_invoice_paid', {
      p_invoice_id: invoiceId,
      p_session_id: session.id,
      p_payment_intent_id:
        typeof session.payment_intent === 'string' ? session.payment_intent : null,
    })

    if (error) {
      console.error('mark_invoice_paid failed:', error.message)
      return res.status(500).json({ error: 'Payment taken but not recorded.' })
    }

    // `recorded` is false when it was already paid — a reload of the return
    // URL, or Stripe telling us twice. Both are success from here.
    return res.json({ paid: true, newlyRecorded: recorded === true })
  } catch (err) {
    console.error('Payment confirmation failed:', err)
    return res.status(500).json({ error: 'Could not confirm the payment.' })
  }
})

// ===========================================================================
// Invitations — db/035
// ===========================================================================
// Why any of this is on the server rather than in a policy: issuing an
// invitation means generating a cryptographic token and storing only its hash.
// A browser cannot be trusted to choose its own token, and telling it the
// hashing scheme would defeat the point of hashing. `invitations` has no insert
// policy at all; the three functions below are granted to service_role alone.

/** The token is 32 random bytes. The database only ever sees this. */
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/**
 * A crude in-memory limiter for the endpoints an anonymous visitor can call.
 *
 * A 256-bit token is not going to be guessed — that is not what this is for.
 * It is so a script cannot hammer the database for free. It resets on restart
 * and does not survive more than one instance, which is honest rather than
 * ideal: a real deployment wants this at the edge.
 *
 * The sweep matters more than it looks. Without it the map keeps one entry per
 * address that has ever called, so the thing protecting the server from a
 * flood is itself what the flood fills up.
 */
function rateLimiter({ windowMs, max }) {
  const seen = new Map()
  return function tooMany(ip) {
    const now = Date.now()

    if (seen.size > 5000) {
      for (const [key, value] of seen) {
        if (now - value.since > windowMs) seen.delete(key)
      }
    }

    const record = seen.get(ip)
    if (!record || now - record.since > windowMs) {
      seen.set(ip, { since: now, count: 1 })
      return false
    }
    record.count++
    return record.count > max
  }
}

/** Reading an invitation: cheap, and a person refreshing is normal. */
const tooManyPeeks = rateLimiter({ windowMs: 60_000, max: 20 })

/**
 * TWO LIMITS ON THE ENQUIRY FORM, BECAUSE THEY GUARD DIFFERENT THINGS.
 *
 * There was one, and it counted requests. Three malformed submissions — which
 * write nothing, send nothing and cost a database round trip — used the whole
 * allowance, so somebody who mistyped their address twice and then got it right
 * was told "that is a lot of enquiries from one place" and locked out for ten
 * minutes. The count was of the wrong event: a person correcting a typo is the
 * opposite of the thing being defended against.
 *
 * So the tight limit now counts enquiries actually recorded, and is checked
 * immediately before the insert. The loose one counts requests, which is a real
 * thing to want a ceiling on — just not at three.
 */
const tooManyRequests = rateLimiter({ windowMs: 10 * 60_000, max: 30 })
const tooManyEnquiries = rateLimiter({ windowMs: 10 * 60_000, max: 3 })

/**
 * Issue one. School admins for their own school; platform admins anywhere.
 *
 * Also issues a STUDENT account since db/076, which needs a `studentId`. That
 * turns only the first of db/074's two keys: the account is linked and can sign
 * in, and shows nothing at all until a guardian grants student_portal_access on
 * their own Privacy & Consent screen.
 */
app.post('/api/invitations', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { email, role, schoolId, studentId } = req.body ?? {}
  if (!email || !role) {
    return res.status(400).json({ error: 'An email address and a role are required.' })
  }
  /*
   * db/076 added 'student'. The list is repeated here rather than derived,
   * because this check runs before anything touches the database and
   * issue_invitation refuses the same set — two independent refusals is the
   * point, not duplication to be tidied away.
   */
  if (!['educator', 'specialist', 'school_admin', 'student'].includes(role)) {
    return res.status(400).json({ error: `An invitation cannot grant ${role}.` })
  }
  // Both directions, matching db/076's check constraint, so the message names
  // the mistake instead of quoting a constraint.
  if (role === 'student' && !studentId) {
    return res
      .status(400)
      .json({ error: 'Say which student the account is for.' })
  }
  if (role !== 'student' && studentId) {
    return res
      .status(400)
      .json({ error: 'Only a student invitation names a student.' })
  }

  try {
    const userClient = clientForUser(token)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    const { data: me, error: meError } = await admin
      .from('profiles')
      .select('role, school_id')
      .eq('id', user.id)
      .single()
    if (meError || !me) {
      return res.status(403).json({ error: 'Your account could not be read.' })
    }

    // THE SCHOOL IS NEVER TAKEN FROM THE REQUEST for a school admin. Otherwise
    // an administrator at one school could invite staff into another simply by
    // changing a value in the browser.
    let targetSchool
    if (me.role === 'platform_admin') {
      targetSchool = schoolId
      if (!targetSchool) {
        return res.status(400).json({ error: 'Choose a school to invite them to.' })
      }
    } else if (me.role === 'school_admin') {
      targetSchool = me.school_id
      if (!targetSchool) {
        return res
          .status(403)
          .json({ error: 'Your account is not linked to a school yet.' })
      }
    } else {
      return res
        .status(403)
        .json({ error: 'Only an administrator can invite staff.' })
    }

    const raw = crypto.randomBytes(32).toString('base64url')

    const { data: id, error: issueError } = await admin.rpc('issue_invitation', {
      p_school_id: targetSchool,
      p_email: email,
      p_role: role,
      p_token_hash: hashToken(raw),
      p_invited_by: user.id,
      // Null for staff. db/076 checks the child is at `targetSchool`, which is
      // the school this server chose and never one from the request body — so a
      // student id typed into a browser cannot reach across to another school.
      p_student_id: role === 'student' ? studentId : null,
    })

    if (issueError) {
      console.error('issue_invitation failed:', issueError.message)

      /*
       * TRANSLATED, NOT FORWARDED. db/035 has a unique index allowing one live
       * invitation per address, and Postgres reports that by naming the index:
       * 'duplicate key value violates unique constraint
       * "invitations_one_live_per_email"'. That reached the screen verbatim.
       *
       * It is a sentence about a database to somebody who was trying to invite
       * a colleague, and it does not say the one thing they need — that a
       * usable link already exists and can be withdrawn or passed on.
       */
      if (/invitations_one_live_per_email/.test(issueError.message)) {
        return res.status(409).json({
          error:
            'There is already an unused invitation for that address. Withdraw it first, or pass on the link they were sent.',
        })
      }

      return res.status(400).json({ error: issueError.message })
    }

    const acceptUrl = `${APP_URL}/invite/${raw}`

    /**
     * Sent AFTER the invitation exists, and its failure is reported rather
     * than thrown. The link is already valid and is returned either way — an
     * administrator who can see it can pass it on however they like, which is
     * how this worked before there was any email at all.
     */
    const { data: school } = await admin
      .from('organisations')
      .select('name')
      .eq('id', targetSchool)
      .single()

    const mail = await sendMail({
      to: email,
      ...invitationEmail({
        schoolName: school?.name ?? 'Your school',
        roleLabel: role.replace('_', ' '),
        acceptUrl,
      }),
    })

    if (!mail.sent && mailConfigured()) {
      // Configured and still failed — worth a person's attention, because it
      // means every invitation from now on is silently not arriving.
      recordEvent('warning', 'mail', 'invitation_not_sent', mail.error)
    }

    // THE ONLY TIME THE RAW TOKEN EXISTS OUTSIDE THIS FUNCTION. It is not
    // stored, not logged, and cannot be retrieved again — a lost invitation is
    // reissued, never recovered.
    return res.json({
      id,
      token: raw,
      acceptUrl,
      emailSent: mail.sent,
      emailError: mail.sent ? null : mail.error,
    })
  } catch (err) {
    console.error('Issuing an invitation failed:', err)
    return res.status(500).json({ error: 'Could not create the invitation.' })
  }
})

/**
 * What is this invitation for? Called by somebody with no account yet, so it
 * cannot require a session — and therefore returns as little as possible: the
 * school's name, the role, and the address it was sent to. Never an id, never
 * anything that would let a guessed token enumerate a school's staff.
 */
app.get('/api/invitations/:token', async (req, res) => {
  if (tooManyPeeks(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Wait a minute.' })
  }

  try {
    const { data, error } = await admin.rpc('peek_invitation', {
      p_token_hash: hashToken(req.params.token),
    })

    if (error) {
      console.error('peek_invitation failed:', error.message)
      return res.status(500).json({ error: 'Could not read that invitation.' })
    }

    const invitation = data?.[0]
    if (!invitation) {
      // Deliberately the same answer for "never existed", "already used" and
      // "withdrawn". Distinguishing them tells a stranger which tokens are real.
      return res
        .status(404)
        .json({ error: 'That invitation link is not valid. Ask for a new one.' })
    }
    if (invitation.expired) {
      return res
        .status(410)
        .json({ error: 'That invitation has expired. Ask for a new one.' })
    }

    return res.json({
      schoolName: invitation.school_name,
      role: invitation.role,
      email: invitation.email,
    })
  } catch (err) {
    console.error('Reading an invitation failed:', err)
    return res.status(500).json({ error: 'Could not read that invitation.' })
  }
})

/** Redeem it. The account must already exist — sign up first, then accept. */
app.post('/api/invitations/:token/accept', async (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!bearer) return res.status(401).json({ error: 'Sign in first.' })

  try {
    const userClient = clientForUser(bearer)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    const tokenHash = hashToken(req.params.token)

    const { data: peeked } = await admin.rpc('peek_invitation', {
      p_token_hash: tokenHash,
    })
    const invitation = peeked?.[0]
    if (!invitation) {
      return res.status(404).json({ error: 'That invitation link is not valid.' })
    }

    /**
     * THE ADDRESS MUST MATCH, and this is a deliberate choice with a cost.
     *
     * The administrator said "this person, at this address". If any account
     * holding the link could redeem it, a forwarded email would hand a staff
     * account at a named school to whoever received it — and the audit trail
     * would show the administrator inviting somebody they had never heard of.
     *
     * The cost is real: a teacher invited at their work address who signs up
     * with a personal one is refused, and has to be told why clearly rather
     * than just failing.
     */
    if ((user.email ?? '').toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({
        error: `This invitation was sent to ${invitation.email}. Sign in with that address, or ask for a new invitation for the one you are using.`,
      })
    }

    const { data, error } = await admin.rpc('redeem_invitation', {
      p_token_hash: tokenHash,
      p_profile_id: user.id,
    })

    if (error) {
      console.error('redeem_invitation refused:', error.message)
      return res.status(400).json({ error: error.message })
    }

    const result = data?.[0]
    return res.json({ schoolId: result?.school_id, role: result?.role })
  } catch (err) {
    console.error('Accepting an invitation failed:', err)
    return res.status(500).json({ error: 'Could not accept that invitation.' })
  }
})

// ===========================================================================
// Guardian access codes — db/037
// ===========================================================================

/**
 * No 0/O and no 1/I/L. This gets read off paper, down a phone line, by
 * somebody holding a toddler — every pair a human confuses is removed.
 * 32 symbols × 12 characters is 60 bits.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function generateAccessCode() {
  const bytes = crypto.randomBytes(12)
  let out = ''
  for (let i = 0; i < 12; i++) {
    // Rejection-free because 256 is a multiple of 32, so no symbol is favoured.
    out += CODE_ALPHABET[bytes[i] % 32]
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`
}

/**
 * Typed in by a person, so accept what a person types: any case, dashes or
 * not, spaces from a copy-paste. Normalise before hashing or half the correct
 * codes in the world would be refused.
 */
function normaliseCode(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
}

/**
 * Issue a guardian code, which links a family to a child.
 *
 * The comment here used to be the invitations one, copied along with the shape
 * of the handler. It described school admins inviting staff anywhere, which is
 * not what this route does to anybody.
 */
app.post('/api/guardian-codes', async (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!bearer) return res.status(401).json({ error: 'Not signed in.' })

  const { studentId, email, relationship } = req.body ?? {}
  if (!studentId || !email) {
    return res
      .status(400)
      .json({ error: 'A student and an email address are required.' })
  }

  try {
    const userClient = clientForUser(bearer)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    const { data: me } = await admin
      .from('profiles')
      .select('role, school_id')
      .eq('id', user.id)
      .single()

    if (!me || !['school_admin', 'platform_admin'].includes(me.role)) {
      return res.status(403).json({
        error: 'Only a school administrator can give a family access to a child.',
      })
    }

    // A school admin may only issue for a child at THEIR school. Checked here
    // against the student's real row rather than trusting the request.
    const { data: student } = await admin
      .from('students')
      .select('id, school_id, first_name, last_name')
      .eq('id', studentId)
      .single()

    if (!student) return res.status(404).json({ error: 'No such student.' })
    if (me.role === 'school_admin' && student.school_id !== me.school_id) {
      return res
        .status(403)
        .json({ error: 'That student is not at your school.' })
    }

    const code = generateAccessCode()

    const { error: issueError } = await admin.rpc('issue_guardian_code', {
      p_student_id: studentId,
      p_email: email,
      p_relationship: relationship || 'guardian',
      p_code_hash: hashToken(normaliseCode(code)),
      p_issued_by: user.id,
    })

    if (issueError) {
      console.error('issue_guardian_code failed:', issueError.message)
      return res.status(400).json({ error: issueError.message })
    }

    const link =
      `${APP_URL}/link?code=${encodeURIComponent(code)}` +
      `&email=${encodeURIComponent(email)}`

    const { data: school } = await admin
      .from('organisations')
      .select('name')
      .eq('id', student.school_id)
      .single()

    /**
     * The child's DISPLAY name in the email — first name and last initial.
     *
     * A full name in an inbox is a full name wherever that inbox is read, and
     * the family already knows which child they have. The screen shows the full
     * name to the administrator, who is entitled to it.
     */
    const mail = await sendMail({
      to: email,
      ...guardianCodeEmail({
        childName: `${student.first_name} ${student.last_name.slice(0, 1)}.`,
        schoolName: school?.name ?? 'Your school',
        code,
        link,
      }),
    })

    if (!mail.sent && mailConfigured()) {
      recordEvent('warning', 'mail', 'guardian_code_not_sent', mail.error)
    }

    // THE ONLY TIME THE CODE EXISTS OUTSIDE THIS FUNCTION. Only its hash is
    // stored, so a lost code is reissued rather than looked up.
    return res.json({
      code,
      childName: `${student.first_name} ${student.last_name}`,
      emailSent: mail.sent,
      emailError: mail.sent ? null : mail.error,
    })
  } catch (err) {
    console.error('Issuing a guardian code failed:', err)
    return res.status(500).json({ error: 'Could not create the code.' })
  }
})

/**
 * Redeem one. Signed in as the family member, whose address must match what
 * the school recorded — enforced in the database function too, so the rule
 * survives a second caller being written later.
 */
const redeemAttempts = new Map()
function tooManyRedeems(ip) {
  const now = Date.now()
  const record = redeemAttempts.get(ip)
  if (!record || now - record.since > 600_000) {
    redeemAttempts.set(ip, { since: now, count: 1 })
    return false
  }
  record.count++
  return record.count > 10
}

/**
 * What is this code for? Called by somebody with no account yet — the code is
 * their invitation to the product, so requiring a session to look at it is the
 * dead end db/038 exists to close.
 *
 * POST rather than GET so the code never lands in a URL, a server log, a
 * referrer header or somebody's browser history.
 */
app.post('/api/guardian-codes/peek', async (req, res) => {
  if (tooManyRedeems(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Wait ten minutes.' })
  }

  const { code } = req.body ?? {}
  if (!code) return res.status(400).json({ error: 'Enter the code.' })

  try {
    const { data, error } = await admin.rpc('peek_guardian_code', {
      p_code_hash: hashToken(normaliseCode(code)),
    })

    if (error) {
      console.error('peek_guardian_code failed:', error.message)
      return res.status(500).json({ error: 'Could not check that code.' })
    }

    const found = data?.[0]
    if (!found) {
      // The same answer for never-existed, already-used and withdrawn.
      // Distinguishing them tells a stranger which codes are real.
      return res.status(404).json({
        error:
          'That code is not valid. Check it against the message from the school, or ask them for a new one.',
      })
    }
    if (found.expired) {
      return res
        .status(410)
        .json({ error: 'That code has expired. Ask the school for a new one.' })
    }

    return res.json({
      childName: found.child_name,
      schoolName: found.school_name,
      emailHint: found.email_hint,
    })
  } catch (err) {
    console.error('Peeking a guardian code failed:', err)
    return res.status(500).json({ error: 'Could not check that code.' })
  }
})

app.post('/api/guardian-codes/redeem', async (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!bearer) return res.status(401).json({ error: 'Sign in first.' })

  if (tooManyRedeems(req.ip)) {
    return res.status(429).json({
      error: 'Too many attempts. Wait ten minutes, then try again.',
    })
  }

  const { code } = req.body ?? {}
  if (!code) return res.status(400).json({ error: 'Enter the code.' })

  try {
    const userClient = clientForUser(bearer)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    const { data, error } = await admin.rpc('redeem_guardian_code', {
      p_code_hash: hashToken(normaliseCode(code)),
      p_profile_id: user.id,
      p_profile_email: user.email ?? '',
    })

    if (error) {
      console.error('redeem_guardian_code failed:', error.message)
      return res.status(500).json({ error: 'Could not check that code.' })
    }

    const result = data?.[0]

    /**
     * The function REPORTS refusals rather than raising them — db/043.
     *
     * A raise rolls back everything the function did, including the record
     * that somebody tried this code from the wrong account. Wrong address,
     * already used and expired are all ordinary things a parent can do, not
     * programming errors, and one of them has to leave a trace behind it.
     *
     * The messages are written for a parent and are safe to show: none of them
     * reveals whether a code exists, only that this attempt failed.
     */
    if (!result?.ok) {
      return res
        .status(400)
        .json({ error: result?.message ?? 'That code did not work.' })
    }

    return res.json({
      studentId: result.student_id,
      childName: result.child_name,
    })
  } catch (err) {
    console.error('Redeeming a guardian code failed:', err)
    return res.status(500).json({ error: 'Could not check that code.' })
  }
})

/**
 * Tell Special Miles that something arrived.
 *
 * REFUSES TO SEND WHEN THERE IS NOWHERE TO SEND IT. ENQUIRIES_TO is null when
 * MAIL_FROM is Resend's shared test sender and no real address was configured —
 * posting to `onboarding@resend.dev` returns 200 and lands nowhere anybody can
 * read, which is worse than not sending, because it reports success.
 *
 * The row is always written first by the caller. This is how a person finds out
 * today; it is not what makes the enquiry real.
 */
function announce(letter, what, id) {
  if (!ENQUIRIES_TO) {
    recordEvent(
      'warning',
      'mail',
      'no_notification_address',
      `${what} ${id} arrived and nobody was told. Set ENQUIRIES_TO in .env.local.`,
    )
    return
  }

  void sendMail({ to: ENQUIRIES_TO, ...letter }).then((result) => {
    if (!result.sent) {
      recordEvent(
        'warning',
        'mail',
        `${what}_not_sent`,
        `${id}. ${result.error ?? ''}`.slice(0, 500),
      )
    }
  })
}

/**
 * The plans somebody can enquire about.
 *
 * The keys match the check constraint in db/045 and the labels match the cards
 * in src/pages/Pricing.tsx. Deliberately NOT imported from either: this file is
 * plain JavaScript and Pricing.tsx is TypeScript carrying prices, features and
 * layout that a server has no business loading. Five strings duplicated is a
 * smaller problem than a build step in the process holding the service key.
 *
 * An unrecognised key is dropped rather than rejected. Somebody typed a plan
 * name into a query string; that is not a reason to refuse a school that wants
 * to buy something.
 */
const PLAN_LABELS = {
  small_school: 'Small schools',
  mid_school: 'Mid-size schools',
  large_school: 'Large schools',
  essential: 'Essential',
  premium: 'Premium',
}

/**
 * POST /api/enquiries — the only write in this product with no account behind it.
 *
 * A principal reading the pricing page has nobody to invite them and nothing to
 * buy: a school account is created by Special Miles, because creating one means
 * creating the thing every account at that school hangs off. So this records
 * that they asked, and a human replies. See db/045 for the rest of the
 * reasoning, including why the enquirer gets no email.
 */
// ---------------------------------------------------------------------------
// Push notifications — db/081
// ---------------------------------------------------------------------------
/**
 * The three endpoints a browser needs to turn notifications on and off.
 *
 * The SUBSCRIPTION IS WRITTEN WITH THE SERVICE KEY, not by the browser, so the
 * row's `profile_id` is whoever the access token says they are rather than
 * whoever the request body claims. db/081 has an insert policy as well, but a
 * client that could name its own profile_id is a client that could point
 * somebody else's notifications at its own device.
 */

app.get('/api/push/key', (_req, res) => {
  // Not an error when unconfigured. A deployment with no VAPID keys should
  // decline to offer notifications, and the screen needs to be able to ask.
  if (!pushConfigured()) return res.json({ configured: false, key: null })
  return res.json({ configured: true, key: vapidPublicKey() })
})

/**
 * A teacher flagged an observation themselves — nudge the safeguarding leads.
 *
 * WHY AN ENDPOINT AND NOT A DATABASE TRIGGER. A behaviour log is inserted
 * straight into Supabase by the browser, deliberately: src/lib/offlineQueue.ts
 * keeps a log written in a corridor with no signal and syncs it later, and
 * routing that through this server would break the one thing the offline
 * support exists for. Postgres cannot send a web push, so the client has to
 * say when it has flagged one.
 *
 * WHICH MEANS THIS IS NOT TRUSTED. The caller passes a log id and nothing else:
 * this reads the row with the service key and refuses unless it is genuinely
 * flagged and genuinely unacknowledged. Otherwise the endpoint would be a way
 * for any signed-in account to make every school administrator's phone buzz.
 *
 * A client that never calls it costs a nudge, not a record. The incident is in
 * the queue either way, which is the actual safeguard.
 */
app.post('/api/safeguarding/notify', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { behaviourLogId } = req.body ?? {}
  if (!behaviourLogId) return res.status(400).json({ error: 'Which log?' })

  const userClient = clientForUser(token)
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Not signed in.' })

  /*
   * Read AS THE CALLER first. If their own policies do not let them see this
   * log, they have no business announcing it — and this is what stops the
   * endpoint confirming the existence of a log at another school.
   */
  const { data: visible } = await userClient
    .from('behaviour_logs')
    .select('id')
    .eq('id', behaviourLogId)
    .maybeSingle()
  if (!visible) return res.status(404).json({ error: 'No such log.' })

  // Then read the state with the service key, so the decision to notify rests
  // on the row rather than on anything the caller said about it.
  const { data: log } = await admin
    .from('behaviour_logs')
    .select('id, is_risk_flagged, safeguarding_acknowledged_at, students ( school_id )')
    .eq('id', behaviourLogId)
    .maybeSingle()

  if (!log?.is_risk_flagged || log.safeguarding_acknowledged_at) {
    // Not an error. A log that is not flagged, or already dealt with, simply
    // has nobody to wake.
    return res.json({ notified: false })
  }

  const schoolId = log.students?.school_id ?? null
  void notifySafeguardingLeads(schoolId)
  return res.json({ notified: true })
})

app.post('/api/push/subscribe', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { endpoint, keys, userAgent } = req.body ?? {}
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'That subscription is incomplete.' })
  }

  const userClient = clientForUser(token)
  const {
    data: { user },
    error: whoError,
  } = await userClient.auth.getUser()
  if (whoError || !user) return res.status(401).json({ error: 'Not signed in.' })

  /*
   * Upsert on the endpoint, which IS the identity of a browser's subscription.
   * A browser that re-subscribes hands back the same endpoint with fresh keys;
   * inserting would collide and accumulating rows would send duplicates.
   */
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      profile_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      // Truncated: this is shown back to the person to help them recognise a
      // device, not parsed, and some user agents are enormous.
      user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 200) : null,
    },
    { onConflict: 'endpoint' },
  )

  if (error) return dbFailed(res, 'error', error)
  return res.json({ subscribed: true })
})

app.post('/api/push/unsubscribe', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const { endpoint } = req.body ?? {}
  if (!endpoint) return res.status(400).json({ error: 'Which subscription?' })

  const userClient = clientForUser(token)
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Not signed in.' })

  // Scoped to the caller as well as the endpoint. Without profile_id, knowing
  // somebody's endpoint would be enough to switch their notifications off.
  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('profile_id', user.id)

  if (error) return dbFailed(res, 'error', error)
  return res.json({ subscribed: false })
})

app.post('/api/enquiries', async (req, res) => {
  // The flood ceiling. Nowhere near what a person fixing a typo will reach.
  if (tooManyRequests(req.ip)) {
    return res
      .status(429)
      .json({ error: 'Too many attempts from here. Wait a few minutes.' })
  }

  const {
    kind,
    plan,
    organisationName,
    contactName,
    contactEmail,
    contactPhone,
    contactRole,
    studentCount,
    message,
    // A field positioned off-screen and left empty by every human. Bots fill in
    // everything they find. Cheap, silent, and it stops the unsophisticated
    // majority without making a real person prove they are one — which is the
    // trade a CAPTCHA makes badly.
    website,
  } = req.body ?? {}

  if (website) {
    // Answered as if it worked. Telling a bot which check caught it is telling
    // whoever wrote the bot what to change.
    return res.json({ received: true })
  }

  if (kind !== 'school' && kind !== 'family') {
    return res.status(400).json({ error: 'Say whether this is for a school or a family.' })
  }

  const name = String(contactName ?? '').trim()
  const email = String(contactEmail ?? '').trim().toLowerCase()
  const organisation = String(organisationName ?? '').trim()

  if (!name) return res.status(400).json({ error: 'Tell us your name.' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'That email address does not look right.' })
  }
  if (kind === 'school' && !organisation) {
    return res.status(400).json({ error: 'Tell us the name of your school or centre.' })
  }

  // Parsed rather than trusted: a number field still sends a string, and "600+"
  // is what a person types when the box is next to the words "how many".
  const students = Number.parseInt(String(studentCount ?? ''), 10)
  const validStudents =
    Number.isInteger(students) && students > 0 && students <= 100000 ? students : null

  const row = {
    kind,
    plan_key: Object.hasOwn(PLAN_LABELS, plan ?? '') ? plan : null,
    organisation_name: kind === 'school' ? organisation : null,
    contact_name: name.slice(0, 200),
    contact_email: email,
    contact_phone: String(contactPhone ?? '').trim().slice(0, 50) || null,
    contact_role: String(contactRole ?? '').trim().slice(0, 200) || null,
    student_count: validStudents,
    message: String(message ?? '').trim().slice(0, 4000) || null,
  }

  try {
    /*
     * A DOUBLE-PRESS IS NOT A SECOND ENQUIRY.
     *
     * Somebody who does not see an answer immediately presses the button again,
     * and two identical rows ten seconds apart is a member of staff wondering
     * which one to reply to. Same address, same kind, within ten minutes is the
     * same enquiry — answered as success, because from where they are sitting
     * it worked, and it did.
     */
    const { data: recent } = await admin
      .from('enquiries')
      .select('id')
      .eq('contact_email', email)
      .eq('kind', kind)
      .gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString())
      .limit(1)

    if (recent?.length) return res.json({ received: true })

    /*
     * Checked HERE, and not at the top, so it counts only what it is named
     * after. Everything above this line — a mistyped address, a missing name, a
     * second press of the same button — writes nothing and sends nothing, and
     * must not spend somebody's allowance. Nobody has three schools to ask
     * about in ten minutes; plenty of people fill a form in badly.
     */
    if (tooManyEnquiries(req.ip)) {
      return res.status(429).json({
        error:
          'That is a lot of enquiries from one place. Wait a few minutes, or email us directly.',
      })
    }

    const { data, error } = await admin
      .from('enquiries')
      .insert(row)
      .select('id')
      .single()

    if (error) {
      console.error('Storing an enquiry failed:', error.message)
      return res.status(500).json({
        error: 'We could not record that. Please try again in a moment.',
      })
    }

    /*
     * The row is the record. The email is how somebody finds out today.
     *
     * Not awaited into the response for the same reason as everywhere else: a
     * school that has just asked to buy something must not be told it failed
     * because a mail provider had a bad minute. If it does not send, the
     * enquiry is still on the platform admin's screen.
     */
    const notify = enquiryEmail({
      kind,
      planLabel: row.plan_key ? PLAN_LABELS[row.plan_key] : null,
      organisationName: row.organisation_name,
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      contactRole: row.contact_role,
      studentCount: row.student_count,
      message: row.message,
      reviewUrl: `${APP_URL}/platform-admin/enquiries`,
    })

    // Somewhere a person actually looks — db/027. An enquiry nobody was told
    // about is the failure that costs the business money rather than data, and
    // the row alone does not announce itself.
    announce(notify, 'enquiry', data.id)

    return res.json({ received: true })
  } catch (err) {
    console.error('Recording an enquiry failed:', err)
    return res.status(500).json({
      error: 'We could not record that. Please try again in a moment.',
    })
  }
})

/**
 * Gate 1 — somebody applying to join the Special Miles network.
 *
 * Same shape as the enquiry endpoint above and for the same reason: a public
 * form, written by somebody with no account, so the server writes it and the
 * table has no insert policy. db/047 has the reasoning, including why approval
 * does not create an account and why no documents are uploaded.
 */
const PROFESSION_LABELS = {
  speech_pathologist: 'Speech pathologist',
  occupational_therapist: 'Occupational therapist',
  psychologist: 'Psychologist',
  behaviour_support: 'Behaviour support practitioner',
  physiotherapist: 'Physiotherapist',
  counsellor: 'Counsellor',
  special_education_teacher: 'Special education teacher',
  other: 'Other',
}

const tooManyApplications = rateLimiter({ windowMs: 10 * 60_000, max: 3 })

app.post('/api/specialist-applications', async (req, res) => {
  if (tooManyRequests(req.ip)) {
    return res
      .status(429)
      .json({ error: 'Too many attempts from here. Wait a few minutes.' })
  }

  const {
    fullName,
    email,
    phone,
    dateOfBirth,
    profession,
    professionOther,
    registrationBody,
    registrationNumber,
    yearsExperience,
    regions,
    about,
    wwccState,
    wwccNumber,
    wwccExpiry,
    ndisScreeningNumber,
    ndisExpiry,
    website, // the honeypot — see the enquiry endpoint
  } = req.body ?? {}

  if (website) return res.json({ received: true })

  const name = String(fullName ?? '').trim()
  const address = String(email ?? '').trim().toLowerCase()

  if (!name) return res.status(400).json({ error: 'Tell us your name.' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return res.status(400).json({ error: 'That email address does not look right.' })
  }
  if (!Object.hasOwn(PROFESSION_LABELS, profession ?? '')) {
    return res.status(400).json({ error: 'Choose the profession that fits best.' })
  }
  if (profession === 'other' && !String(professionOther ?? '').trim()) {
    return res.status(400).json({ error: 'Tell us what your profession is.' })
  }
  // Checked here as well as in the database because "we cannot verify your
  // WWCC without it" is a reason a person can act on, and a constraint
  // violation is not.
  if (!dateOfBirth) {
    return res.status(400).json({
      error:
        'We need your date of birth to verify your Working With Children Check.',
    })
  }

  const years = Number.parseInt(String(yearsExperience ?? ''), 10)

  const row = {
    full_name: name.slice(0, 200),
    email: address,
    phone: String(phone ?? '').trim().slice(0, 50) || null,
    date_of_birth: dateOfBirth,
    profession,
    profession_other: String(professionOther ?? '').trim().slice(0, 200) || null,
    registration_body: String(registrationBody ?? '').trim().slice(0, 200) || null,
    registration_number: String(registrationNumber ?? '').trim().slice(0, 100) || null,
    years_experience:
      Number.isInteger(years) && years >= 0 && years <= 70 ? years : null,
    regions: String(regions ?? '').trim().slice(0, 500) || null,
    about: String(about ?? '').trim().slice(0, 4000) || null,
    wwcc_state: String(wwccState ?? '').trim().toUpperCase() || null,
    wwcc_number: String(wwccNumber ?? '').trim().slice(0, 100) || null,
    wwcc_expiry: wwccExpiry || null,
    ndis_screening_number:
      String(ndisScreeningNumber ?? '').trim().slice(0, 100) || null,
    // Null rather than a guess when they gave no number to attach it to.
    ndis_expiry: String(ndisScreeningNumber ?? '').trim() ? ndisExpiry || null : null,
  }

  try {
    if (tooManyApplications(req.ip)) {
      return res.status(429).json({
        error: 'That is a lot of applications from one place. Wait a few minutes.',
      })
    }

    const { data, error } = await admin
      .from('specialist_applications')
      .insert(row)
      .select('id')
      .single()

    if (error) {
      /*
       * ONE OPEN APPLICATION PER ADDRESS — the partial unique index in db/047.
       * Answered as the ordinary thing it is rather than as a failure: a person
       * who cannot remember whether they applied last week has not done
       * anything wrong, and two open applications is two reviewers doing the
       * same work.
       */
      if (error.code === '23505') {
        return res.status(409).json({
          error:
            'You already have an application with us and it is still open. We will be in touch — there is no need to apply again.',
        })
      }
      console.error('Storing a specialist application failed:', error.message)
      return res
        .status(500)
        .json({ error: 'We could not record that. Please try again in a moment.' })
    }

    const notify = specialistApplicationEmail({
      fullName: row.full_name,
      professionLabel:
        row.profession === 'other'
          ? row.profession_other
          : PROFESSION_LABELS[row.profession],
      email: row.email,
      phone: row.phone,
      registrationBody: row.registration_body,
      registrationNumber: row.registration_number,
      yearsExperience: row.years_experience,
      regions: row.regions,
      reviewUrl: `${APP_URL}/platform-admin/applications`,
    })

    announce(notify, 'application', data.id)

    return res.json({ received: true })
  } catch (err) {
    console.error('Recording a specialist application failed:', err)
    return res
      .status(500)
      .json({ error: 'We could not record that. Please try again in a moment.' })
  }
})

/**
 * Decide one — platform admin only.
 *
 * ONE ENDPOINT RATHER THAN A SCREEN THAT UPDATES AND THEN EMAILS. Two steps is
 * one step somebody forgets, and the one they forget is telling the person
 * waiting. The decision and the letter are the same act.
 *
 * The update runs as the SIGNED-IN ADMIN, not with the service key, so RLS
 * decides whether they may and the trigger in db/047 stamps who they are. The
 * service key would bypass exactly the checks that make this safe.
 */
app.post('/api/specialist-applications/:id/decide', async (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!bearer) return res.status(401).json({ error: 'Sign in first.' })

  const { status, note } = req.body ?? {}
  const allowed = ['in_review', 'more_needed', 'approved', 'declined']
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'That is not a decision.' })
  }

  const reason = String(note ?? '').trim()
  if ((status === 'declined' || status === 'more_needed') && !reason) {
    return res.status(400).json({
      error:
        'Say why. This is sent to the applicant, and a decision without a reason is one they cannot act on.',
    })
  }

  try {
    const userClient = clientForUser(bearer)

    const { data, error } = await userClient
      .from('specialist_applications')
      .update({ status, review_note: reason || null })
      .eq('id', req.params.id)
      .select('id, full_name, email, status')
      .maybeSingle()

    if (error) {
      console.error('Deciding an application failed:', error.message)
      return res.status(400).json({ error: error.message })
    }
    // No row came back: either it does not exist or RLS did not show it to
    // them. Deliberately the same answer, as everywhere else in this file.
    if (!data) {
      return res.status(404).json({ error: 'That application is not available.' })
    }

    /*
     * `in_review` is somebody picking the row up, not a decision, and the
     * applicant does not need a letter saying they are being read.
     */
    const letter =
      status === 'in_review'
        ? null
        : applicationDecisionEmail({
            fullName: data.full_name,
            status,
            note: reason,
          })

    let emailSent = false
    let emailError = null
    if (letter) {
      // AWAITED, unlike the notifications elsewhere. Here the screen must be
      // able to say whether the person was actually told, because the decision
      // is recorded either way and only staff can see that it did not go.
      const result = await sendMail({ to: data.email, ...letter })
      emailSent = result.sent
      emailError = result.error ?? null
      if (!result.sent) {
        recordEvent(
          'warning',
          'mail',
          'decision_not_sent',
          `Application ${data.id}. ${result.error ?? ''}`.slice(0, 500),
        )
      }
    }

    return res.json({ status: data.status, emailSent, emailError })
  } catch (err) {
    console.error('Deciding an application failed:', err)
    return res.status(500).json({ error: 'Could not record that decision.' })
  }
})

/**
 * Ask somebody to renew a check that is running out.
 *
 * PRESSED BY A PERSON, never fired by a clock. There is no scheduler in this
 * product, and inventing one here would mean its first act was emailing real
 * practitioners without anybody deciding to. doc 13 §5 keeps that open.
 *
 * The update runs as the SIGNED-IN ADMIN so RLS decides whether they may —
 * the service key would bypass exactly the check that makes this safe.
 */
app.post('/api/screening/:id/remind', async (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!bearer) return res.status(401).json({ error: 'Sign in first.' })

  try {
    const userClient = clientForUser(bearer)

    /*
     * WHO IS THIS, BEFORE ANYTHING ELSE — the idiom /api/strategies uses.
     *
     * This route used to go straight to the query, so a caller holding a
     * malformed token got the database's own complaint back: probed on 8
     * September with a forged bearer, it answered
     *
     *     400  {"error":"JWT cryptographic operation failed"}
     *
     * Two faults in one line. A rejected token is 401, not 400 — 400 says
     * "your request was wrong" to somebody whose request was fine and whose
     * credentials were not. And the text is PostgREST's, not ours: internal
     * error strings name tables, columns and constraints, and this is the
     * only route in the file that handed one to an unauthenticated caller.
     */
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ error: 'Your session has expired.' })
    }

    // Read through the view so the days-remaining arithmetic and the wording
    // in the email come from the same place as the screen — db/048 exists so
    // that a screen calling something "expiring" and an email calling it
    // "valid" cannot happen.
    const { data: check, error } = await userClient
      .from('screening_overview')
      .select('id, email, full_name, check_type, expires_on, days_remaining')
      .eq('id', req.params.id)
      .maybeSingle()

    if (error) {
      // Logged in full, reported in general: the reader of this response is
      // not necessarily entitled to know why the database said no.
      console.error('Reading a check failed:', error.message)
      return res
        .status(500)
        .json({ error: 'That check could not be read. Try again in a moment.' })
    }
    if (!check) {
      return res.status(404).json({ error: 'That check is not available.' })
    }

    const letter = screeningReminderEmail({
      fullName: check.full_name,
      checkLabel:
        check.check_type === 'wwcc'
          ? 'Working With Children Check'
          : 'NDIS Worker Screening Check',
      // Null stays null. `new Date(null)` is 1 January 1970, which this sent
      // to a real person before db/051's nullable expiry was carried through.
      expiresOn: check.expires_on
        ? new Date(check.expires_on).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : null,
      daysLeft: check.days_remaining,
    })

    const result = await sendMail({ to: check.email, ...letter })

    if (!result.sent) {
      recordEvent(
        'warning',
        'mail',
        'reminder_not_sent',
        `Screening ${check.id}. ${result.error ?? ''}`.slice(0, 500),
      )
      // NOT RECORDED AS REMINDED. The column answers "have we asked them?",
      // and a failed send means we have not — writing the date anyway would
      // make the screen say somebody had been chased when nobody had.
      return res.status(502).json({
        sent: false,
        error: `The email did not send: ${result.error ?? 'unknown reason'}`,
      })
    }

    const { error: stampError } = await userClient
      .from('staff_screening')
      .update({ last_reminded_at: new Date().toISOString() })
      .eq('id', check.id)

    if (stampError) {
      // The person WAS emailed. Say so rather than reporting a failure that
      // would have somebody send it a second time.
      console.error('Stamping the reminder failed:', stampError.message)
      return res.json({ sent: true, recorded: false })
    }

    return res.json({ sent: true, recorded: true })
  } catch (err) {
    console.error('Sending a reminder failed:', err)
    return res.status(500).json({ error: 'Could not send that reminder.' })
  }
})

/**
 * ---------------------------------------------------------------------------
 * SERVING THE BUILT FRONTEND, IN PRODUCTION ONLY
 * ---------------------------------------------------------------------------
 * One service, one origin. The alternative — the app on one host and this API
 * on another — means CORS, two sets of environment variables, and two chances
 * for APP_URL and the real address to disagree. They cannot disagree if there
 * is only one of them.
 *
 * AFTER EVERY /api ROUTE, deliberately. Express matches in order, so a catch-all
 * mounted earlier would swallow the API and every request would return
 * index.html with a 200 — the kind of failure where the browser reports
 * "unexpected token < in JSON" and nothing says why.
 *
 * NOT IN DEVELOPMENT. `npm run dev` serves the app on 5273 with hot reload;
 * dist/ there is whatever was built last, and quietly serving a stale copy on
 * 8887 would be a confusing thing to leave lying around.
 */
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(import.meta.dirname, '..', 'dist')

  if (!existsSync(dist)) {
    console.error(
      '\nNODE_ENV is production but dist/ does not exist.\n' +
        'The frontend has not been built. Run `npm run build` before starting.\n',
    )
  } else {
    // Hashed asset filenames can be cached hard; index.html must never be, or a
    // deploy leaves browsers holding an index that points at assets that are
    // gone.
    app.use(
      express.static(dist, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache')
          }
        },
      }),
    )

    // THE SPA FALLBACK. Deep links like /educator/students/:id are routed by
    // React, not by this server, so anything not matched above and not an /api
    // path gets index.html and lets the browser take over. An /api path that
    // reached here is a genuine 404 and says so as JSON, because returning HTML
    // to a fetch() is how a missing endpoint becomes a parse error.
    app.use((req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: `No such endpoint: ${req.path}` })
      }
      res.sendFile(path.join(dist, 'index.html'))
    })
  }
}

/**
 * BOUND TO 0.0.0.0 EXPLICITLY, NOT LEFT TO NODE'S DEFAULT.
 *
 * `app.listen(port)` with no host binds to the unspecified IPv6 address `::`
 * and relies on dual-stack to also accept IPv4. That works on a laptop and is
 * not guaranteed in a container: Render's readiness probe connects over IPv4,
 * and when it cannot reach the socket the deploy fails with
 *
 *   Port scan timeout reached, no open ports detected
 *
 * — while the process itself has already logged that it is listening, which is
 * the confusing part. The server was right and unreachable at the same time.
 * Naming the interface removes the ambiguity.
 *
 * The log line said "localhost" in every environment too, which on a host is
 * simply untrue and made the port message harder to reason about. It now prints
 * the address somebody can actually open.
 */
const HOST = '0.0.0.0'

app.listen(PORT, HOST, () => {
  const shown =
    process.env.NODE_ENV === 'production' ? APP_URL : `http://localhost:${PORT}`
  console.log(`MiZanova API listening on ${HOST}:${PORT} — reachable at ${shown}`)
  console.log('Frontend expects it here. Leave this terminal running.')
  console.log(`Invitation links will point at ${APP_URL}`)
  console.log(`Email: ${mailProvider()}`)

  /*
   * Gmail does not refuse a From it does not own — it rewrites it and delivers.
   * So this cannot be detected from any send result; it has to be said here.
   */
  const mismatch = smtpSenderMismatch()
  if (mismatch) {
    console.error(
      [
        '',
        `MAIL_FROM claims ${mismatch.claimed} but the SMTP login is ${mismatch.actual}.`,
        'Gmail will silently rewrite the sender to the address that logged in,',
        `so recipients will see ${mismatch.actual} whatever this says.`,
        'Set MAIL_FROM to that address to make the code match the inbox.',
        '',
      ].join('\n'),
    )
  }

  /*
   * DEPLOYED AND STILL POINTING AT A LAPTOP is the failure this catches.
   *
   * Every invitation carries a link built from APP_URL. Left at its default on
   * a real host, every one of them says http://localhost:5273 — which resolves,
   * on the tester's machine, to the tester's own machine. The invitation is
   * valid, the email arrives, and the link is useless, and nothing anywhere
   * reports a problem. Said loudly here because there is no later moment where
   * it becomes obvious.
   */
  if (process.env.NODE_ENV === 'production' && APP_URL.includes('localhost')) {
    console.error(
      '\nAPP_URL is still ' +
        APP_URL +
        ' while running in production.\n' +
        'Every invitation link will point at the recipient\'s own machine.\n' +
        'Set APP_URL to the deployed address.\n',
    )
  }

  /*
   * SAID AT STARTUP, WHERE SOMEBODY IS LOOKING.
   *
   * Resend accepts mail from its shared test sender and returns a message id,
   * and receiving providers then filter it — so every check inside this server
   * reports success while nothing arrives. There is no way to detect that from
   * the API response, which is exactly why it has to be said out loud here.
   */
  if (usingTestSender()) {
    console.warn(`
MAIL: sending as Resend's shared test address (onboarding@resend.dev).
      Resend accepts these and most inboxes bin them as spam, so every
      check inside this server reports success while nothing arrives.
      Verify a domain at resend.com/domains and set MAIL_FROM to an
      address on it before anybody relies on email arriving.`)
  }

  if (!ENQUIRIES_TO) {
    console.warn(`
MAIL: no ENQUIRIES_TO set, so nobody is told when an enquiry or a
      specialist application arrives. Both are still recorded and both
      screens still work. Set ENQUIRIES_TO in .env.local.`)
  }
})
