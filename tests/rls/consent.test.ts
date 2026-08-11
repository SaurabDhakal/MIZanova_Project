import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * Consent, and the gate it controls (FR25).
 *
 * `has_active_consent` is the single thing standing between a child's
 * behaviour notes and an AI service. `server/index.js` calls it before any
 * text is anonymised or sent, and refuses on false. So these tests call it the
 * same way the server does — through the service key, which is what makes it
 * see every row rather than only the caller's.
 *
 * The consent table went through a period of being enforced and unreachable:
 * the gate worked and no human could open it. These cover both halves — that
 * the gate holds, and that the people entitled to open it can.
 */

let world: World

beforeAll(async () => {
  world = await buildWorld()
}, 60_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 60_000)

/** Exactly the call the API server makes before contacting Anthropic. */
async function aiConsentFor(studentId: string): Promise<boolean> {
  const { data, error } = await admin.rpc('has_active_consent', {
    p_student_id: studentId,
    p_type: 'ai_strategy_generation',
  })
  if (error) throw new Error(error.message)
  return data === true
}

describe('the gate itself', () => {
  test('a child with no consent record is refused', async () => {
    expect(await aiConsentFor(world.childA)).toBe(false)
  })

  test('granting consent opens it', async () => {
    const { error } = await world.guardianOfA.db.from('consents').insert({
      student_id: world.childA,
      consent_type: 'ai_strategy_generation',
      granted_by: world.guardianOfA.id,
    })

    expect(error).toBeNull()
    expect(await aiConsentFor(world.childA)).toBe(true)
  })

  /**
   * The promise made on the parent's Privacy screen: withdrawing stops AI
   * suggestions immediately. "Immediately" is what this asserts.
   */
  /**
   * Withdrawal goes through `revoke_consent`, which is what the app calls.
   *
   * The first version of this test wrote `revoked_at: new Date()` by hand and
   * passed — then failed the next morning with a check-constraint violation,
   * because the machine had drifted 1.1 seconds behind the database and
   * `revoked_at` landed before the `granted_at` the server had just written.
   * That was a real defect in `revokeConsent`, not in the test: a parent on a
   * slow clock could not withdraw consent at all. See db/021.
   *
   * Testing the path the product actually uses is what caught it.
   */
  test('withdrawing closes it again', async () => {
    const { data: rows } = await world.guardianOfA.db
      .from('consents')
      .select('id')
      .eq('student_id', world.childA)
      .eq('consent_type', 'ai_strategy_generation')
      .is('revoked_at', null)

    expect(rows?.length).toBe(1)

    const { data: withdrew, error } = await world.guardianOfA.db.rpc(
      'revoke_consent',
      { p_consent_id: rows![0].id },
    )

    expect(error).toBeNull()
    expect(withdrew).toBe(true)
    expect(await aiConsentFor(world.childA)).toBe(false)
  })

  test('withdrawing the same consent twice reports false, not an error', async () => {
    const { data: rows } = await admin
      .from('consents')
      .select('id')
      .eq('student_id', world.childA)
      .eq('consent_type', 'ai_strategy_generation')

    const { data: again, error } = await world.guardianOfA.db.rpc(
      'revoke_consent',
      { p_consent_id: rows![0].id },
    )

    expect(error).toBeNull()
    expect(again).toBe(false)
  })

  test('another family cannot withdraw a consent that is not theirs', async () => {
    const { data: rows } = await admin
      .from('consents')
      .select('id')
      .eq('student_id', world.childA)
      .eq('consent_type', 'data_processing')
      .is('revoked_at', null)

    if ((rows?.length ?? 0) > 0) {
      const { data: withdrew } = await world.guardianOfB.db.rpc(
        'revoke_consent',
        { p_consent_id: rows![0].id },
      )
      expect(withdrew).toBe(false)
    }
  })

  test('a withdrawn consent is kept, not deleted', async () => {
    // "Given on the 4th and withdrawn on the 9th" is itself the record the
    // Australian Privacy Principles require to be provable. db/002 says so;
    // this is the assertion that it stays true.
    const { data } = await admin
      .from('consents')
      .select('id, revoked_at')
      .eq('student_id', world.childA)

    expect(data?.length).toBe(1)
    expect(data?.[0].revoked_at).not.toBeNull()
  })

  test('consent for one child does not open the gate for another', async () => {
    await world.guardianOfB.db.from('consents').insert({
      student_id: world.childB,
      consent_type: 'ai_strategy_generation',
      granted_by: world.guardianOfB.id,
    })

    expect(await aiConsentFor(world.childB)).toBe(true)
    expect(await aiConsentFor(world.childA)).toBe(false)
  })

  test('consent of a different type does not open the AI gate', async () => {
    await world.guardianOfA.db.from('consents').insert({
      student_id: world.childA,
      consent_type: 'data_processing',
      granted_by: world.guardianOfA.id,
    })

    expect(await aiConsentFor(world.childA)).toBe(false)
  })
})

describe('who may record consent', () => {
  test('a guardian cannot give consent for another family’s child', async () => {
    const { error } = await world.guardianOfA.db.from('consents').insert({
      student_id: world.childB,
      consent_type: 'photo_media',
      granted_by: world.guardianOfA.id,
    })

    expect(error).not.toBeNull()
  })

  test('a guardian cannot record consent as if it came from someone else', async () => {
    // `granted_by = auth.uid()` in the insert policy. Without it, a guardian
    // could file a consent attributed to the other parent.
    const { error } = await world.guardianOfA.db.from('consents').insert({
      student_id: world.childA,
      consent_type: 'specialist_referral',
      granted_by: world.guardianOfB.id,
    })

    expect(error).not.toBeNull()
  })

  test('a school admin can record a consent given on paper', async () => {
    const { error } = await world.schoolAdmin.db.from('consents').insert({
      student_id: world.childA,
      consent_type: 'parent_portal_access',
      granted_by: world.schoolAdmin.id,
      notes: 'Recorded by school staff from a consent given outside MiZanova.',
    })

    expect(error).toBeNull()
  })

  test('a classroom educator cannot record consent', async () => {
    // Teaching a child is not the same authority as recording what their
    // family agreed to.
    const { error } = await world.verifiedEducator.db.from('consents').insert({
      student_id: world.childA,
      consent_type: 'photo_media',
      granted_by: world.verifiedEducator.id,
    })

    expect(error).not.toBeNull()
  })

  test('two live consents of the same type cannot exist for one child', async () => {
    // A child cannot simultaneously have consent and not have it. The partial
    // unique index in db/002 is what prevents the contradiction.
    const { error } = await world.guardianOfB.db.from('consents').insert({
      student_id: world.childB,
      consent_type: 'ai_strategy_generation',
      granted_by: world.guardianOfB.id,
    })

    expect(error).not.toBeNull()
    expect(error?.code).toBe('23505')
  })
})

describe('what a guardian can see', () => {
  test('a guardian cannot read another family’s consents', async () => {
    const { data } = await world.guardianOfA.db
      .from('consents')
      .select('id')
      .eq('student_id', world.childB)

    expect(data).toEqual([])
  })
})
