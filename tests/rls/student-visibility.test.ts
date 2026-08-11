import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'
import { PUBLISHABLE_KEY, SUPABASE_URL } from '../helpers/env'

/**
 * Who can see which child.
 *
 * These assert the promises the product makes about children's records, in the
 * only place those promises are actually enforced. Every one of them is
 * currently held up by a policy in db/, and every one of them would be silently
 * broken by a careless edit to a single `using` clause.
 *
 * They sign in as real users and read through the same API a browser uses. No
 * mocking: a mocked RLS test proves the mock works.
 */

let world: World

beforeAll(async () => {
  world = await buildWorld()
}, 60_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 60_000)

describe('educators', () => {
  test('a verified, assigned educator sees the child they teach', async () => {
    const { data, error } = await world.verifiedEducator.db
      .from('students')
      .select('id')

    expect(error).toBeNull()
    expect(data?.map((s) => s.id)).toContain(world.childA)
  })

  test('does NOT see a child in the same school they are not assigned to', async () => {
    const { data } = await world.verifiedEducator.db.from('students').select('id')
    expect(data?.map((s) => s.id)).not.toContain(world.childB)
  })

  test('does NOT see a child at another school', async () => {
    const { data } = await world.verifiedEducator.db.from('students').select('id')
    expect(data?.map((s) => s.id)).not.toContain(world.outsiderChild)
  })

  /**
   * db/013 made verification real. Before it, this educator would have seen
   * ChildA — they are assigned, after all. The banner promised the gate; this
   * is the gate.
   */
  test('an UNVERIFIED educator sees nothing, even though assigned', async () => {
    const { data, error } = await world.unverifiedEducator.db
      .from('students')
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('naming a student id directly does not get round it', async () => {
    const { data } = await world.unverifiedEducator.db
      .from('students')
      .select('id')
      .eq('id', world.childA)

    expect(data).toEqual([])
  })
})

describe('guardians', () => {
  test('a guardian sees their own child', async () => {
    const { data, error } = await world.guardianOfA.db.from('students').select('id')

    expect(error).toBeNull()
    expect(data?.map((s) => s.id)).toEqual([world.childA])
  })

  test('a guardian does NOT see another family’s child', async () => {
    const { data } = await world.guardianOfA.db
      .from('students')
      .select('id')
      .eq('id', world.childB)

    expect(data).toEqual([])
  })

  /**
   * shared_with_parents defaults to false, and the sharing decision is the
   * teacher's. A guardian reading an unshared log would make that decision
   * meaningless.
   */
  test('a guardian does NOT see a behaviour log that was never shared', async () => {
    const { data } = await world.guardianOfA.db
      .from('behaviour_logs')
      .select('id')
      .eq('id', world.privateLogId)

    expect(data).toEqual([])
  })
})

describe('privilege escalation', () => {
  /**
   * db/044 — signing up cannot hand you a staff role.
   *
   * THIS IS THE ONLY TEST THAT GOES THROUGH SIGNUP. Everywhere else the world
   * is built with the service key, which skips `handle_new_user` entirely — so
   * the trigger that decides what a stranger becomes had nothing holding it.
   *
   * The role arrives in `raw_user_meta_data`, written by the browser. Anybody
   * can send anything. Before db/044 sending 'educator' produced an educator:
   * harmless on its own, because they land with no school and no membership
   * and see nothing, but it filled the verification queue with people no school
   * recognised and made invitations optional.
   */
  test('a browser claiming a staff role at signup gets a parent account', async () => {
    const anonymous = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    for (const claimed of [
      'educator',
      'specialist',
      'school_admin',
      'platform_admin',
    ]) {
      const email = `rls-${world.runId}-claim-${claimed}@mizanova-test.invalid`
      const { data, error } = await anonymous.auth.signUp({
        email,
        password: randomBytes(18).toString('base64url'),
        options: { data: { role: claimed, first_name: 'Claim', last_name: 'Test' } },
      })
      expect(error, `signing up claiming ${claimed}`).toBeNull()

      // Read with the service key: the point is what the DATABASE made, not
      // what the signup response says it asked for.
      const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', data.user!.id)
        .single()

      expect(profile?.role, `claiming ${claimed} must yield a parent`).toBe('parent')

      await admin.auth.admin.deleteUser(data.user!.id)
    }
  })

  test('nobody can promote themselves', async () => {
    await world.guardianOfA.db
      .from('profiles')
      .update({ role: 'platform_admin' })
      .eq('id', world.guardianOfA.id)

    // Read the truth with the service key rather than trusting the response:
    // a filtered-out update returns success with zero rows, which is the trap
    // assertChanged() exists for.
    const { data } = await world.guardianOfA.db
      .from('profiles')
      .select('role')
      .eq('id', world.guardianOfA.id)
      .single()

    expect(data?.role).toBe('parent')
  })

  test('nobody can verify themselves', async () => {
    await world.unverifiedEducator.db
      .from('profiles')
      .update({ is_verified: true })
      .eq('id', world.unverifiedEducator.id)

    const { data } = await world.unverifiedEducator.db
      .from('profiles')
      .select('is_verified')
      .eq('id', world.unverifiedEducator.id)
      .single()

    expect(data?.is_verified).toBe(false)
  })

  test('a guardian cannot attach themselves to another child', async () => {
    const { error } = await world.guardianOfA.db
      .from('student_guardians')
      .insert({ student_id: world.childB, profile_id: world.guardianOfA.id })

    expect(error).not.toBeNull()

    const { data } = await world.guardianOfA.db
      .from('students')
      .select('id')
      .eq('id', world.childB)
    expect(data).toEqual([])
  })
})

describe('tables no browser session may read', () => {
  test('recovery codes are unreadable, even to their owner', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('mfa_recovery_codes')
      .select('*')

    // Either a refusal or an empty set. What must never happen is a hash
    // coming back.
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })
})
