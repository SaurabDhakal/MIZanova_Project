import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  admin,
  buildWorld,
  destroyWorld,
  makeActor,
  type Actor,
  type World,
} from '../helpers/world'

/**
 * db/074 — a student can sign in, and almost everything is still shut.
 *
 * THE ASSERTIONS THAT MATTER HERE ARE THE NEGATIVE ONES. Every other role in
 * this project widened who could read records ABOUT children; this one lets a
 * child in. The obvious implementation — "a student is a parent, but for
 * themselves" — would hand a young person the staff observations written about
 * them on their worst day, and a safeguarding flag that may concern their home.
 *
 * So the useful tests are not "a student can see their goals". They are the
 * eight below that check a student sees nothing else, and the two that check
 * the door does not open until both keys are turned.
 */

let world: World
let student: Actor
let studentB: Actor

beforeAll(async () => {
  world = await buildWorld()

  // Two accounts: one for childA who will be given both keys, one for childB
  // who will be linked but never consented to — the difference between them is
  // the whole point of the double lock.
  // Created as a parent then promoted, the same way school_admin is: db/001's
  // `handle_new_user` accepts only the three self-signup roles and downgrades
  // anything else, which is correct — a child does not sign themselves up.
  student = await makeActor(
    'parent',
    world.runId,
    'pupil',
    world.schoolId,
    true,
    'student',
  )
  studentB = await makeActor(
    'parent',
    world.runId,
    'pupilb',
    world.schoolId,
    true,
    'student',
  )

  await admin
    .from('students')
    .update({ profile_id: student.id })
    .eq('id', world.childA)
  await admin
    .from('students')
    .update({ profile_id: studentB.id })
    .eq('id', world.childB)
}, 90_000)

afterAll(async () => {
  if (!world) return
  await admin
    .from('consents')
    .delete()
    .eq('consent_type', 'student_portal_access')
    .in('student_id', [world.childA, world.childB])
  await admin
    .from('students')
    .update({ profile_id: null })
    .in('id', [world.childA, world.childB])
  await destroyWorld(world)
}, 60_000)

async function grantPortalConsent(studentId: string) {
  const { error } = await admin.from('consents').insert({
    student_id: studentId,
    consent_type: 'student_portal_access',
    granted_by: world.guardianOfA.id,
  })
  if (error) throw new Error(error.message)
}

describe('the door needs two keys', () => {
  test('a linked account with no consent gets nothing', async () => {
    // childB is linked but no guardian has agreed. The school alone must not be
    // able to put a child into the product.
    const { data } = await studentB.db.from('students').select('id')

    expect(data ?? []).toEqual([])
  })

  test('once a guardian consents, the student sees their own record', async () => {
    await grantPortalConsent(world.childA)

    const { data, error } = await student.db.from('students').select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].id).toBe(world.childA)
  })

  /*
   * REVOKED THROUGH `revoke_consent`, NOT BY SENDING A TIMESTAMP.
   *
   * The first version of this test set `revoked_at` to `new Date()` from this
   * machine — which is the precise bug db/021 exists to prevent. db/002
   * constrains `revoked_at >= granted_at`, so when the laptop's clock sits
   * behind the server's, revoking a consent granted a moment earlier violates
   * the constraint and fails with 23514.
   *
   * The test did not check that error, so the revoke silently never happened
   * and the assertion below failed for a reason that had nothing to do with
   * what it was testing. It passed for hours and then did not, because clock
   * drift is a moving target — which is exactly how db/021 describes the
   * original.
   *
   * Two changes: it calls the same function the parent screen calls, so the
   * timestamp is the database's; and it ASSERTS THE WRITE HAPPENED before
   * drawing a conclusion from what follows.
   */
  test('revoking the consent closes it again immediately', async () => {
    const { data: row } = await admin
      .from('consents')
      .select('id')
      .eq('student_id', world.childA)
      .eq('consent_type', 'student_portal_access')
      .is('revoked_at', null)
      .single()

    const { error: revokeError } = await admin.rpc('revoke_consent', {
      p_consent_id: row!.id,
    })
    expect(revokeError).toBeNull()

    const check = await admin
      .from('consents')
      .select('revoked_at')
      .eq('id', row!.id)
      .single()
    // Without this, a failed revoke reads as a passing security test.
    expect(check.data?.revoked_at).not.toBeNull()

    const { data } = await student.db.from('students').select('id')

    // The policies read the consent every time rather than copying a flag onto
    // the profile, so withdrawal takes effect without anything being re-run.
    expect(data ?? []).toEqual([])

    await admin
      .from('consents')
      .update({ revoked_at: null })
      .eq('id', row!.id)
  })
})

describe('what a student may see', () => {
  test('their own goals, which is the point of the role', async () => {
    const { data: goal } = await admin
      .from('goals')
      .insert({
        student_id: world.childA,
        title: 'Join group work for a full session',
        description: 'Stay with the group without needing a break.',
        created_by: world.verifiedEducator.id,
      })
      .select('id')
      .single()

    const { data, error } = await student.db
      .from('goals')
      .select('id, title')

    expect(error).toBeNull()
    expect(data?.some((g) => g.id === goal!.id)).toBe(true)
  })

  test('never another child’s goals', async () => {
    await admin.from('goals').insert({
      student_id: world.childB,
      title: 'Somebody else’s goal',
      description: 'Not for this student.',
      created_by: world.verifiedEducator.id,
    })

    const { data } = await student.db.from('goals').select('student_id')

    expect(data?.every((g) => g.student_id === world.childA)).toBe(true)
  })
})

describe('a student is a real role, not a half-configured one — db/077', () => {
  /*
   * my_role() returns a role only for parent/platform_admin or somebody holding
   * a live membership, and `memberships.role` refuses 'student'. So every
   * student account answered NULL and the account still looked fine, because
   * db/074's own policies use my_student_id() and are independent of it.
   *
   * What broke silently was every ORDINARY role check. db/075's Academy matches
   * `my_role() = any (audiences)`, so a course published for students reached
   * no student at all — and no test noticed, because the academy suite
   * exercises parents and educators.
   */
  test('my_role answers student rather than null', async () => {
    const { data, error } = await student.db.rpc('my_role')

    expect(error).toBeNull()
    expect(data).toBe('student')
  })

  test('my_school_id answers their school', async () => {
    const { data } = await student.db.rpc('my_school_id')

    expect(data).toBe(world.schoolId)
  })

  test('a course published for students actually reaches one', async () => {
    const { data: course } = await admin
      .from('courses')
      .insert({
        title: `Study skills ${world.runId}`,
        summary: 'Written for students.',
        audiences: ['student'],
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    const { data, error } = await student.db.from('courses').select('id')

    expect(error).toBeNull()
    expect(data?.some((c) => c.id === course!.id)).toBe(true)

    await admin.from('courses').delete().eq('id', course!.id)
  })

  test('and a course for staff still does not', async () => {
    const { data: course } = await admin
      .from('courses')
      .insert({
        title: `Staff only ${world.runId}`,
        summary: 'Written about families, for educators.',
        audiences: ['educator'],
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    const { data } = await student.db.from('courses').select('id')

    // Widening my_role() must not have widened what it unlocks.
    expect(data?.some((c) => c.id === course!.id)).toBe(false)

    await admin.from('courses').delete().eq('id', course!.id)
  })
})

describe('what a student must never see', () => {
  /*
   * A behaviour log is a staff observation written for other staff. A child
   * reading their own — "meltdown during transitions, high intensity" — is a
   * wellbeing incident, not a feature. buildWorld creates one about childA
   * carrying a private note, so this is a real row being refused rather than an
   * empty table passing by luck.
   */
  test('their own behaviour logs', async () => {
    const { data } = await student.db.from('behaviour_logs').select('id')

    expect(data ?? []).toEqual([])
  })

  test('the private note on one, through any column', async () => {
    const { data } = await student.db
      .from('behaviour_logs')
      .select('notes, is_risk_flagged')

    expect(data ?? []).toEqual([])
  })

  test('messages between the adults in their care team', async () => {
    const { data } = await student.db.from('messages').select('id')

    expect(data ?? []).toEqual([])
  })

  test('their own IEP documents', async () => {
    // Often names a diagnosis a family may not have discussed with the child.
    // That conversation belongs to them, not to a login screen.
    const { data } = await student.db.from('iep_documents').select('id')

    expect(data ?? []).toEqual([])
  })

  test('invoices — a child is not the payer', async () => {
    const { data } = await student.db.from('invoices').select('id')

    expect(data ?? []).toEqual([])
  })

  test('who has been reading their file', async () => {
    const { data } = await student.db.from('student_access_events').select('id')

    expect(data ?? []).toEqual([])
  })

  test('the consents held about them', async () => {
    const { data } = await student.db.from('consents').select('id')

    expect(data ?? []).toEqual([])
  })

  test('any other student at their school', async () => {
    const { data } = await student.db.from('students').select('id')

    expect(data?.every((s) => s.id === world.childA)).toBe(true)
  })
})

describe('a student may not write', () => {
  test('they cannot change their own goal', async () => {
    const { data: goal } = await admin
      .from('goals')
      .select('id, status')
      .eq('student_id', world.childA)
      .limit(1)
      .single()

    await student.db
      .from('goals')
      .update({ status: 'achieved' })
      .eq('id', goal!.id)

    const after = await admin
      .from('goals')
      .select('status')
      .eq('id', goal!.id)
      .single()

    // Marking your own goal achieved is a claim about progress, and progress is
    // recorded by the people teaching them.
    expect(after.data?.status).toBe(goal!.status)
  })

  test('they cannot write a behaviour log about themselves', async () => {
    const { error } = await student.db.from('behaviour_logs').insert({
      student_id: world.childA,
      logged_by: student.id,
      behaviour_type: 'disruptive',
      intensity: 'low',
    })

    expect(error).not.toBeNull()
  })

  test('they cannot unlink themselves from the school', async () => {
    await student.db
      .from('students')
      .update({ school_id: world.otherSchoolId })
      .eq('id', world.childA)

    const after = await admin
      .from('students')
      .select('school_id')
      .eq('id', world.childA)
      .single()

    expect(after.data?.school_id).toBe(world.schoolId)
  })
})
