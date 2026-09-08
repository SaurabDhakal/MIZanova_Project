import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { PUBLISHABLE_KEY, SERVICE_KEY, SUPABASE_URL } from '../helpers/env'

/*
 * vitest.config.ts sets 20s, which is right for a suite that asks the database
 * one question. Every assertion here can instead spend up to 41s waiting out
 * an auth rate limit rather than reporting a throttled request as a result.
 */
vi.setConfig({ testTimeout: 90_000 })

/**
 * Changing a password ends every other session on the account.
 *
 * ---------------------------------------------------------------------------
 * WHY A TEST FOR SOMETHING NOBODY HERE WROTE
 * ---------------------------------------------------------------------------
 * This is Supabase's behaviour, not ours. `updateUser({ password })` revokes
 * the other sessions by itself — no `signOut` call anywhere in this codebase.
 *
 * It is tested because two screens make a promise that depends on it and there
 * is nothing in this repository that would notice if it stopped being true.
 * ResetPassword tells somebody their other devices now need the new password.
 * Security says changing it signs you out everywhere else. If a Supabase
 * upgrade or a project setting changed that, both would go on saying it, and
 * the person reading them is the one who thinks their password was stolen.
 *
 * The screens used to say the opposite — "changing it here does not sign you
 * out of other devices" — which was false in the direction that does harm. It
 * was corrected by measuring, and this is the measurement, kept.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CONTROL IS NOT OPTIONAL
 * ---------------------------------------------------------------------------
 * A dead refresh token proves nothing on its own: it would also be dead if the
 * sign-in had failed, if the token were never valid, or if some unrelated
 * cleanup had removed the user. The control signs a second device in and does
 * NOT change the password, so the suite can tell revocation apart from a
 * session that was never alive. Without it this file would pass against a
 * Supabase that revoked nothing.
 *
 * Follows tests/helpers/world.ts conventions: an address at the reserved
 * .invalid TLD that can never receive mail, passwords that exist only in
 * memory for the length of one run, and the accounts deleted afterwards.
 */

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Each one is a separate device: its own session, never written to disk. */
const device = (): SupabaseClient =>
  createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The free tier rate-limits sign-ins, and this file signs in four times.
 * vitest.config.ts already explains what an unretried sign-in does to a suite:
 * it fails somewhere unrelated and looks like a policy bug.
 */
async function signIn(client: SupabaseClient, email: string, password: string) {
  let last = ''
  for (const wait of [0, 3000, 6000, 12000, 20000]) {
    if (wait) await sleep(wait)
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (data?.session) return data.session
    last = error?.message ?? 'no session returned'
    // A wrong password is not worth waiting out; only the limit is.
    if (!rateLimited(last)) break
  }
  throw new Error(`Could not sign in as ${email}: ${last}`)
}

/**
 * Whether these credentials are refused for the RIGHT reason.
 *
 * Same trap as `canStillRefresh`: a rate-limited sign-in also comes back
 * without a session, so a suite that only checked for absence would call a
 * throttled request "the old password was rejected" and pass without evidence.
 */
async function passwordRejected(email: string, password: string): Promise<boolean> {
  for (const wait of [0, 3000, 6000, 12000, 20000]) {
    if (wait) await sleep(wait)
    const { data, error } = await device().auth.signInWithPassword({ email, password })
    if (data?.session) return false
    const message = error?.message ?? ''
    if (!rateLimited(message)) return /invalid login credentials/i.test(message)
  }
  throw new Error('Rate limited throughout — the old password never got an answer.')
}

type Account = {
  id: string
  email: string
  password: string
}

const created: string[] = []

async function makeAccount(label: string): Promise<Account> {
  const email = `rls-${randomUUID().slice(0, 8)}-${label}@mizanova-test.invalid`
  const password = randomBytes(18).toString('base64url')

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: label, last_name: 'Test' },
  })
  if (error) throw new Error(`Could not create ${label}: ${error.message}`)

  created.push(data.user.id)
  return { id: data.user.id, email, password }
}

const rateLimited = (message: string) => /rate limit|too many/i.test(message)

/**
 * Whether a refresh token can still mint a new access token.
 *
 * RATE LIMITING IS NOT REVOCATION, AND THIS FILE CANNOT AFFORD TO CONFUSE THEM.
 * The free tier answers "Request rate limit reached" to a perfectly valid
 * token, which reads as a dead session and would make this suite report the
 * security property as HOLDING when it had measured nothing at all — a green
 * test for an assertion never made. It waits the limit out instead, and only
 * a real token error counts as revoked.
 */
async function canStillRefresh(refreshToken: string): Promise<boolean> {
  let last = ''
  for (const wait of [0, 3000, 6000, 12000, 20000]) {
    if (wait) await sleep(wait)
    const { data, error } = await device().auth.refreshSession({
      refresh_token: refreshToken,
    })
    if (!error && data.session) return true
    last = error?.message ?? 'no session returned'
    if (!rateLimited(last)) return false
  }
  throw new Error(`Rate limited throughout — refresh never got an answer: ${last}`)
}

/** Whether an already-issued access token is still accepted. */
async function accessTokenAccepted(accessToken: string): Promise<boolean> {
  for (const wait of [0, 3000, 6000, 12000, 20000]) {
    if (wait) await sleep(wait)
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` },
    })
    if (res.status !== 429) return res.ok
  }
  throw new Error('Rate limited throughout — the access token never got an answer.')
}

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id)
})

describe('a second device, when nothing happens to the password', () => {
  let refreshToken = ''
  let accessToken = ''

  beforeAll(async () => {
    const account = await makeAccount('control')
    await signIn(device(), account.email, account.password)
    const second = await signIn(device(), account.email, account.password)
    refreshToken = second.refresh_token
    accessToken = second.access_token
  })

  test('keeps its refresh token', async () => {
    expect(await canStillRefresh(refreshToken)).toBe(true)
  })

  test('keeps its access token', async () => {
    expect(await accessTokenAccepted(accessToken)).toBe(true)
  })
})

describe('a second device, after the password is changed on the first', () => {
  let refreshToken = ''
  let accessToken = ''
  let account: Account

  beforeAll(async () => {
    account = await makeAccount('revoked')

    const first = device()
    await signIn(first, account.email, account.password)

    const second = await signIn(device(), account.email, account.password)
    // Captured before the change: this is what an intruder would be holding.
    refreshToken = second.refresh_token
    accessToken = second.access_token

    // THE PRODUCTION PATH. AuthProvider's setNewPassword and changePassword
    // both reduce to exactly this call — no signOut, deliberately.
    const { error } = await first.auth.updateUser({
      password: randomBytes(18).toString('base64url'),
    })
    if (error) throw new Error(`Password change failed: ${error.message}`)
  })

  test('can no longer mint a new access token', async () => {
    // A refresh token is what makes a stolen session permanent. This is the
    // assertion the two screens' promise rests on.
    expect(await canStillRefresh(refreshToken)).toBe(false)
  })

  test('cannot even use the access token it already had', async () => {
    // Stronger than required, and worth pinning: a stateless JWT could have
    // stayed valid until it expired, leaving an intruder up to an hour of
    // access after the owner believed they had shut the door.
    expect(await accessTokenAccepted(accessToken)).toBe(false)
  })

  test('the old password no longer signs anybody in', async () => {
    expect(await passwordRejected(account.email, account.password)).toBe(true)
  })
})
