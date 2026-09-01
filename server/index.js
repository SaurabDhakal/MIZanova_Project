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
import { buildAnonymousPayload } from './anonymise.js'
import {
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
    ]
    if (!handled.includes(event.type)) {
      return res.json({ received: true, ignored: event.type })
    }

    const session = event.data.object
    if (session.payment_status !== 'paid') {
      // A completed session that has not been paid: a delayed method still
      // clearing, or a failure. Not our business until it succeeds.
      return res.json({ received: true, unpaid: true })
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
const DEV_ORIGINS = ['http://localhost:5273', 'http://127.0.0.1:5273', 'http://localhost:4273']
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
app.get('/api/health', async (_req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  const checks = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    supabase: false,
    stripe_key_present: Boolean(stripeKey),
    stripe_key_looks_right: Boolean(stripeKey?.startsWith('sk_')),
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
  const complete = healthy && checks.stripe_key_looks_right && checks.stripe_webhook_configured

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

    if (logError) return res.status(500).json({ error: logError.message })
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
      return res.status(503).json({
        error:
          'AI suggestions are currently switched off by Special Miles. Contact your specialist for support.',
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

    if (insertError) return res.status(500).json({ error: insertError.message })

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

    if (logError) return res.status(500).json({ error: logError.message })
    if (!logs || logs.length === 0) return res.json({ logs: {} })

    const { data: rows, error: rowError } = await admin
      .from('ai_strategies')
      .select('behaviour_log_id, status, review_note, reviewed_at')
      .in(
        'behaviour_log_id',
        logs.map((l) => l.id),
      )

    if (rowError) return res.status(500).json({ error: rowError.message })

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

    if (invoiceError) return res.status(500).json({ error: invoiceError.message })
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
      console.error('Reading a check failed:', error.message)
      return res.status(400).json({ error: error.message })
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
