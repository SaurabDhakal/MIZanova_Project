import { afterAll, describe, expect, test } from 'vitest'
import { admin, cleanupStrays } from '../helpers/world'

/**
 * THE CLEANUP'S OWN REGRESSION TEST.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS EXISTS FOR
 * ---------------------------------------------------------------------------
 * `cleanupStrays()` chose schools by the school's age and users by the user's
 * age. A world creates its school and then its accounts a few seconds later,
 * so for a window of seconds each hour the school is past the one-hour cutoff
 * and its members are not: the school is selected for deletion, everybody
 * attached to it is skipped, and db/060's guard refuses with
 *
 *     This organisation still has N live staff membership(s).
 *
 * On 8 September that took main red on the merge of #37 — three files died in
 * cleanupStrays on 1, 2 and 4 memberships, and a fourth
 * (onboarding.test.ts:223) failed with a null school id as collateral, because
 * rows were removed from under a run that was still using them. The pull
 * request had been green an hour earlier, which is what makes this shape of
 * failure expensive: it trains everybody to re-run rather than to read.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS TESTED BY BACKDATING RATHER THAN BY WAITING
 * ---------------------------------------------------------------------------
 * The window is a few seconds wide and opens an hour after a world is built.
 * Waiting for it is not a test. So this manufactures exactly that state — an
 * old school with a young member — and asserts the cleanup copes.
 *
 * Everything here is created by this file and removed by it. It touches no
 * world any other suite builds: the school is named with its own random suffix
 * and the account carries this file's own label.
 */

const suffix = `zzstray${Math.random().toString(16).slice(2, 8)}`
const SCHOOL_NAME = `RLS Test School ${suffix}`
const EMAIL = `rls-${suffix}-cleanupprobe@example.invalid`

let schoolId: string | null = null
let userId: string | null = null

afterAll(async () => {
  // Belt and braces: if an assertion failed, do not leave the probe behind.
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {})
  if (schoolId) await admin.from('organisations').delete().eq('id', schoolId)
}, 120_000)

describe('a stray school older than its own members', () => {
  test('is removed, members and all, instead of throwing', async () => {
    // An organisation backdated past the cutoff.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data: org, error: orgError } = await admin
      .from('organisations')
      .insert({ name: SCHOOL_NAME, kind: 'school', created_at: twoHoursAgo })
      .select('id')
      .single()
    expect(orgError).toBeNull()
    schoolId = org!.id

    // A member created NOW — the half the old code skipped.
    const { data: made, error: userError } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: `Probe!${suffix}2026`,
      email_confirm: true,
      user_metadata: { first_name: 'Cleanup', last_name: 'Probe' },
    })
    expect(userError).toBeNull()
    userId = made!.user.id

    await admin.from('profiles').update({ role: 'educator', school_id: schoolId }).eq('id', userId)
    const { error: memberError } = await admin
      .from('memberships')
      .insert({ profile_id: userId, organisation_id: schoolId, role: 'educator' })
    expect(memberError).toBeNull()

    // The exact state that used to throw.
    const { data: before } = await admin
      .from('memberships')
      .select('id')
      .eq('organisation_id', schoolId)
      .is('ended_at', null)
    expect((before ?? []).length).toBe(1)

    // Old behaviour: rejects, because the member was skipped for being young.
    // New behaviour: the member belongs to a doomed school, so it goes too.
    await expect(cleanupStrays()).resolves.not.toThrow()

    const { data: orgGone } = await admin.from('organisations').select('id').eq('id', schoolId)
    expect(orgGone ?? []).toEqual([])

    const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 })
    expect((users?.users ?? []).some((u) => u.email === EMAIL)).toBe(false)

    // Nothing left to tidy in afterAll.
    schoolId = null
    userId = null
  }, 180_000)
})
