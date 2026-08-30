import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'
import { createHash, randomBytes } from 'node:crypto'

/**
 * db/076 — a school can give a student an account.
 *
 * db/074 created the role and then said in its own footer that nothing could
 * grant it. This closes that, by widening the ONE mechanism that already knew
 * how to hand somebody an account safely.
 *
 * Widening an invitation is the sort of change where the danger is not the new
 * path but the old one. Two things are asserted that have nothing to do with
 * students: that `issue_invitation` still refuses to mint a platform admin, and
 * that a staff invitation cannot name a child — which would attach a teacher's
 * account to a child record and would read as a typo rather than an attack.
 */

let world: World

const token = () => {
  const raw = randomBytes(32).toString('base64url')
  return { raw, hash: createHash('sha256').update(raw).digest('hex') }
}

beforeAll(async () => {
  world = await buildWorld()
}, 60_000)

afterAll(async () => {
  if (!world) return
  await admin.from('invitations').delete().eq('school_id', world.schoolId)
  await admin.from('invitations').delete().eq('school_id', world.otherSchoolId)
  await admin
    .from('students')
    .update({ profile_id: null })
    .in('id', [world.childA, world.childB])
  await destroyWorld(world)
}, 60_000)

describe('what an invitation may now grant', () => {
  test('a student, naming the child it is for', async () => {
    const t = token()
    const { data, error } = await admin.rpc('issue_invitation', {
      p_school_id: world.schoolId,
      p_email: 'pupil@school.invalid',
      p_role: 'student',
      p_token_hash: t.hash,
      p_invited_by: world.schoolAdmin.id,
      p_student_id: world.childA,
    })

    expect(error).toBeNull()
    expect(data).toBeTruthy()
  })

  test('still not a platform administrator', async () => {
    const t = token()
    const { error } = await admin.rpc('issue_invitation', {
      p_school_id: world.schoolId,
      p_email: 'nope@school.invalid',
      p_role: 'platform_admin',
      p_token_hash: t.hash,
      p_invited_by: world.schoolAdmin.id,
    })

    // db/035: "there is no email in the world that should be able to change
    // that." Widening the list must not have loosened this.
    expect(error).not.toBeNull()
  })

  test('a student invitation with no child is refused', async () => {
    const t = token()
    const { error } = await admin.rpc('issue_invitation', {
      p_school_id: world.schoolId,
      p_email: 'nochild@school.invalid',
      p_role: 'student',
      p_token_hash: t.hash,
      p_invited_by: world.schoolAdmin.id,
    })

    expect(error).not.toBeNull()
  })

  test('a STAFF invitation naming a child is refused', async () => {
    const t = token()
    const { error } = await admin.rpc('issue_invitation', {
      p_school_id: world.schoolId,
      p_email: 'teacher@school.invalid',
      p_role: 'educator',
      p_token_hash: t.hash,
      p_invited_by: world.schoolAdmin.id,
      p_student_id: world.childA,
    })

    // The half of the pairing constraint that is easy to leave out, and the
    // one that would attach a teacher's account to a child record.
    expect(error).not.toBeNull()
  })

  test('a child at another school is refused', async () => {
    const t = token()
    const { error } = await admin.rpc('issue_invitation', {
      p_school_id: world.schoolId,
      p_email: 'crosstenant@school.invalid',
      p_role: 'student',
      p_token_hash: t.hash,
      p_invited_by: world.schoolAdmin.id,
      p_student_id: world.outsiderChild,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/not at this school/i)
  })

  test('exactly one issue_invitation exists, not an overload', async () => {
    // `create or replace` matches on the argument list, so adding a parameter
    // would have left db/035's five-argument version alive beside this one —
    // still granted, still able to issue without any of the new checks.
    const { data, error } = await admin.rpc('issue_invitation', {
      p_school_id: world.schoolId,
      p_email: 'ambiguous@school.invalid',
      p_role: 'educator',
      p_token_hash: token().hash,
      p_invited_by: world.schoolAdmin.id,
    })

    // If two overloads existed, PostgREST would refuse this call as ambiguous
    // rather than resolving it.
    expect(error).toBeNull()
    expect(data).toBeTruthy()
  })
})

describe('redeeming one', () => {
  test('links the child and marks the invitation used', async () => {
    const t = token()
    await admin.rpc('issue_invitation', {
      p_school_id: world.schoolId,
      p_email: 'link@school.invalid',
      p_role: 'student',
      p_token_hash: t.hash,
      p_invited_by: world.schoolAdmin.id,
      p_student_id: world.childB,
    })

    // Redeemed against an existing profile, which is what the signup flow does
    // once the account is created.
    const { error } = await admin.rpc('redeem_invitation', {
      p_token_hash: t.hash,
      p_profile_id: world.guardianOfB.id,
    })
    expect(error).toBeNull()

    const linked = await admin
      .from('students')
      .select('profile_id')
      .eq('id', world.childB)
      .single()
    expect(linked.data?.profile_id).toBe(world.guardianOfB.id)

    // No consent was granted, so db/074's second key is still unturned and the
    // account is linked but shows nothing.
    //
    // THAT IS ASSERTED IN student-account.test.ts, NOT HERE, and the difference
    // matters. This suite redeems against `guardianOfB`, who can read childB's
    // goals as a GUARDIAN whatever their student link says — so any assertion
    // here about what they can see would pass for the wrong reason and look
    // like proof. The other suite uses a purpose-made student account with no
    // other route to the child, which is the only way to test it honestly.
    const invitation = await admin
      .from('invitations')
      .select('accepted_at, accepted_by')
      .eq('token_hash', t.hash)
      .single()

    expect(invitation.data?.accepted_at).not.toBeNull()
    expect(invitation.data?.accepted_by).toBe(world.guardianOfB.id)
  })

  test('the same child cannot be linked twice', async () => {
    const t = token()
    const { error: issueError } = await admin.rpc('issue_invitation', {
      p_school_id: world.schoolId,
      p_email: 'again@school.invalid',
      p_role: 'student',
      p_token_hash: t.hash,
      p_invited_by: world.schoolAdmin.id,
      p_student_id: world.childB,
    })

    // Refused at ISSUE rather than at redemption, so nobody is sent a link that
    // will fail when they try to use it.
    expect(issueError).not.toBeNull()
    expect(issueError?.message).toMatch(/already has an account/i)
  })
})
