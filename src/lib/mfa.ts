// One definition, in ./apiBase — this file used to carry a second copy of it,
// which stayed pointing at localhost after the first was fixed.
import { API_URL } from './apiBase'
import { supabase } from './supabase'

/**
 * Two-factor authentication, wrapped in one place.
 *
 * Supabase calls this MFA and measures it as an "assurance level" on the
 * session:
 *
 *   aal1 — signed in with a password
 *   aal2 — and then passed a second factor
 *
 * `getAssuranceLevel()` returns where you ARE and where you SHOULD be. When
 * `next` is above `current`, the account has an authenticator and this session
 * has not satisfied it yet — that is the signal to challenge, and it is far
 * more reliable than remembering a flag ourselves.
 */

export type TotpFactor = {
  id: string
  friendlyName: string | null
  /** Only a verified factor counts. Enrolment creates an unverified one. */
  verified: boolean
}

export type EnrolmentStart = {
  factorId: string
  /** An SVG data URL from Supabase — safe to put straight in an <img src>. */
  qrCode: string
  /** The same secret in text, for anyone who cannot scan a code. */
  secret: string
}

/**
 * Give up after a few seconds.
 *
 * Every call below goes to Supabase, and supabase-js refreshes the auth token
 * first — retrying that refresh with backoff when there is no network. So a
 * failed call does not reject, it HANGS. Offline that left the app on
 * "Checking your sign-in…" forever, because the thing waiting on it had no way
 * to know the answer was never coming.
 *
 * Four seconds: long enough for a slow school connection, short enough that a
 * teacher is not staring at a spinner. Everything here is safe to abandon — no
 * call in this file changes anything by being read.
 */
async function withTimeout<T>(work: () => Promise<T>, label: string): Promise<T> {
  // The browser is certain there is no network. Do not spend two seconds
  // proving it — every guarded page waits on these checks before it renders,
  // so that wait is the whole app pausing on arrival.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(`${label} — you appear to be offline.`)
  }

  let timer: ReturnType<typeof setTimeout>
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out — you may be offline.`)),
      2000,
    )
  })

  try {
    return await Promise.race([work(), expired])
  } finally {
    clearTimeout(timer!)
  }
}

export async function listTotpFactors(): Promise<TotpFactor[]> {
  const { data, error } = await withTimeout(
    () => supabase.auth.mfa.listFactors(),
    'Reading your security settings',
  )
  if (error) throw new Error(error.message)

  return (data?.all ?? [])
    .filter((factor) => factor.factor_type === 'totp')
    .map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? null,
      verified: factor.status === 'verified',
    }))
}

/**
 * Begin enrolment. Creates an UNVERIFIED factor and returns the QR code.
 *
 * Nothing is protected yet: the factor only counts once a code from the app
 * has been checked by `confirmEnrolment` below. Someone who scans the QR and
 * then closes the tab is exactly as unprotected as before, which is why
 * `discardUnverifiedFactors` exists.
 */
export async function startEnrolment(): Promise<EnrolmentStart> {
  // Supabase rejects a duplicate friendly name, and a half-finished attempt
  // from five minutes ago would otherwise block every retry.
  await discardUnverifiedFactors()

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
  })
  if (error) throw new Error(error.message)

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  }
}

/**
 * Check the six digits and turn the factor on.
 *
 * Two calls, not one: `challenge` asks Supabase to start a specific attempt,
 * `verify` answers it. Keeping them paired means a code cannot be replayed
 * against a different challenge later.
 */
export async function confirmEnrolment(
  factorId: string,
  code: string,
): Promise<void> {
  const { data: challenge, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId })
  if (challengeError) throw new Error(challengeError.message)

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.replace(/\s/g, ''),
  })
  if (error) throw new Error(friendlyCodeError(error.message))
}

/** Satisfy an existing factor during sign-in. Raises the session to aal2. */
export async function verifyExistingFactor(
  factorId: string,
  code: string,
): Promise<void> {
  await confirmEnrolment(factorId, code)
}

/**
 * Remove an authenticator.
 *
 * Supabase requires the session to already be at aal2 to do this, which is
 * correct and occasionally surprising: someone who has LOST their phone cannot
 * use this. That case is what recovery codes and db/016 are for.
 */
export async function removeFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw new Error(error.message)
}

/** Clean up abandoned enrolments, which otherwise pile up and block retries. */
export async function discardUnverifiedFactors(): Promise<void> {
  const factors = await listTotpFactors()
  for (const factor of factors) {
    if (!factor.verified) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
  }
}

export type AssuranceLevel = {
  current: string | null
  next: string | null
  /** This session has an authenticator to satisfy and has not done it yet. */
  challengeRequired: boolean
}

export async function getAssuranceLevel(): Promise<AssuranceLevel> {
  const { data, error } = await withTimeout(
    () => supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    'Checking your sign-in',
  )
  if (error) throw new Error(error.message)

  return {
    current: data.currentLevel,
    next: data.nextLevel,
    challengeRequired:
      data.nextLevel === 'aal2' && data.currentLevel !== 'aal2',
  }
}

/**
 * Ten single-use codes, returned once and never again — only hashes are kept.
 * Generating a set destroys the previous one. See db/016.
 */
export async function generateRecoveryCodes(): Promise<string[]> {
  const { data, error } = await supabase.rpc('generate_recovery_codes')
  if (error) throw new Error(error.message)
  return (data ?? []) as string[]
}

export async function recoveryCodesRemaining(): Promise<number> {
  const { data, error } = await supabase.rpc('recovery_codes_remaining')
  if (error) throw new Error(error.message)
  return (data ?? 0) as number
}


/**
 * Spend a recovery code to remove a lost authenticator.
 *
 * Goes through the API server because the browser is not allowed to do either
 * half: `redeem_recovery_code` is granted to service_role only (db/016), and
 * Supabase refuses to let a user remove their own factor unless they have
 * already passed it — which someone holding a recovery code, by definition,
 * has not.
 *
 * Only the code is sent. Which account it applies to is taken from the access
 * token on the server, never from anything this function could set.
 */
export async function redeemRecoveryCode(code: string): Promise<number> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('You are not signed in.')

  const res = await fetch(`${API_URL}/api/mfa/recover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code }),
  }).catch(() => {
    throw new Error(
      'Could not reach the API server. Is it running? Start it with `npm run server` in a second terminal.',
    )
  })

  const body = await res.json().catch(() => ({}))

  if (res.status === 404) {
    // Our own server answered, and does not know this route. That is not a
    // missing recovery code — it is an API server started before this endpoint
    // existed. `node` does not hot-reload, so an unrestarted server keeps
    // serving yesterday's code and reports it as a plain 404.
    throw new Error(
      'The API server does not have the recovery endpoint. Stop it and run `npm run server` again — it does not pick up changes on its own.',
    )
  }

  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`)
  return (body.removed ?? 0) as number
}

export type StaffMfaStatus = {
  hasAuthenticator: boolean
  codesRemaining: number
}

/**
 * Platform Admin only: who has an authenticator, keyed by profile id.
 *
 * Returns no secrets — not the factor id, not a code, not the shared key. Only
 * whether one exists and how many recovery codes are unused, which is what an
 * administrator needs to judge whether a reset is warranted.
 */
export async function fetchStaffMfaStatus(): Promise<
  Record<string, StaffMfaStatus>
> {
  const { data, error } = await supabase.rpc('staff_mfa_status')
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as {
    profile_id: string
    has_authenticator: boolean
    codes_remaining: number
  }[]

  return Object.fromEntries(
    rows.map((row) => [
      row.profile_id,
      {
        hasAuthenticator: row.has_authenticator,
        codesRemaining: row.codes_remaining,
      },
    ]),
  )
}

/**
 * Platform Admin only: clear someone else's two-factor authentication.
 *
 * For the case recovery codes cannot reach — phone gone AND codes gone. Their
 * authenticator and every recovery code stop working, and they must enrol
 * again before any student record opens for them.
 *
 * The server takes the ADMIN's identity from their own token; this only says
 * who it is being done to. The database re-checks the role regardless, so a
 * mistake here cannot grant anyone the power.
 */
export async function adminResetMfa(
  userId: string,
): Promise<{ name: string; removed: number }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('You are not signed in.')

  const res = await fetch(`${API_URL}/api/mfa/admin-reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userId }),
  }).catch(() => {
    throw new Error(
      'Could not reach the API server. Is it running? Start it with `npm run server` in a second terminal.',
    )
  })

  const body = await res.json().catch(() => ({}))

  if (res.status === 404) {
    throw new Error(
      'The API server does not have this endpoint. Stop it and run `npm run server` again — it does not pick up changes on its own.',
    )
  }
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`)

  return { name: body.name ?? 'that account', removed: body.removed ?? 0 }
}

/**
 * Supabase says "Invalid TOTP code entered", which does not tell someone the
 * one thing that actually fixes it nine times out of ten.
 */
function friendlyCodeError(message: string): string {
  if (/invalid|incorrect/i.test(message) && /totp|code/i.test(message)) {
    return 'That code was not accepted. Codes change every 30 seconds — wait for a fresh one and type it straight away. If it keeps failing, the clock on your phone may be out of sync.'
  }
  return message
}
