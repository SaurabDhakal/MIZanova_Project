/**
 * Is the payment webhook forgery-proof?
 *
 *   node --env-file=.env.local scripts/webhook-check.mjs
 *
 * The webhook marks invoices paid. If it accepted an unsigned request it would
 * be a public URL that clears anyone's bill — so this proves it does not, by
 * actually trying.
 *
 * It sends a CORRECTLY signed request too, computing the signature the same
 * way Stripe does. That is the half a forged request cannot prove: refusing
 * everything is easy if the endpoint is simply broken. The signed request
 * names an invoice id that does not exist, so a working endpoint accepts the
 * signature and then finds nothing to pay — changing no data either way.
 *
 * Requires the API server to be running.
 */
import { createHmac } from 'node:crypto'

const URL_BASE = process.env.API_URL ?? 'http://localhost:8887'
const ENDPOINT = `${URL_BASE}/api/billing/webhook`
const secret = process.env.STRIPE_WEBHOOK_SECRET

const payload = JSON.stringify({
  id: 'evt_probe',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_probe_not_a_real_session',
      payment_status: 'paid',
      // An id that cannot match anything. Even a fully accepted request
      // therefore pays nothing.
      metadata: { invoiceId: '00000000-0000-0000-0000-000000000000' },
    },
  },
})

async function post(headers) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: payload,
    })
    return { status: res.status, body: await res.text() }
  } catch (err) {
    return { status: 0, body: `could not reach ${ENDPOINT} — ${err.message}` }
  }
}

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok ' : '***'} ${label.padEnd(46)} ${detail}`)
}

console.log('Payment webhook — forgery attempts\n')

if (!secret) {
  const noSig = await post({})
  console.log(
    '  STRIPE_WEBHOOK_SECRET is not set, so the webhook is switched off.\n' +
      '  It refuses everything, which is the right default — but the signature\n' +
      '  check itself is UNTESTED until the secret is configured.\n',
  )
  check('refuses when not configured', noSig.status === 503, `${noSig.status}`)
  console.log(
    '\n  Set it up:\n' +
      '    stripe listen --forward-to localhost:8887/api/billing/webhook\n' +
      '    put the whsec_… value in .env.local as STRIPE_WEBHOOK_SECRET\n' +
      '    restart `npm run server`, then run this again.',
  )
  process.exit(failures === 0 ? 0 : 1)
}

// --- 1. No signature at all -------------------------------------------------
const unsigned = await post({})
check('unsigned request refused', unsigned.status === 400, `${unsigned.status}`)

// --- 2. A made-up signature -------------------------------------------------
const garbage = await post({ 'stripe-signature': 't=1,v1=deadbeef' })
check('forged signature refused', garbage.status === 400, `${garbage.status}`)

// --- 3. A real signature over DIFFERENT bytes -------------------------------
// The attack the raw-body rule exists to stop: sign something innocuous, then
// send something else.
const t = Math.floor(Date.now() / 1000)
const wrongBody = createHmac('sha256', secret)
  .update(`${t}.${JSON.stringify({ hello: 'world' })}`)
  .digest('hex')
const mismatched = await post({ 'stripe-signature': `t=${t},v1=${wrongBody}` })
check('signature over other bytes refused', mismatched.status === 400, `${mismatched.status}`)

// --- 4. A correctly signed request ------------------------------------------
// Proves the endpoint is refusing because verification WORKS, not because it
// is broken. Pays nothing: the invoice id does not exist.
const good = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
const signed = await post({ 'stripe-signature': `t=${t},v1=${good}` })
check('correctly signed request accepted', signed.status === 200, `${signed.status} ${signed.body}`)

console.log(
  failures === 0
    ? '\nPASS — the webhook accepts Stripe and nobody else.'
    : `\nFAIL — ${failures} problem(s) above. Do not take payments.`,
)
process.exit(failures === 0 ? 0 : 1)
