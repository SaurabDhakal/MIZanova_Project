import { createHash } from 'node:crypto'
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
 * db/035 – db/038 — how somebody gets into MiZanova.
 *
 * Both objects here hand out access to children's records, and both were
 * exercised by hand a handful of times and never tested. That is the state the
 * clinical records were in when a suite found a missing verification gate, so
 * this is the gap worth closing next.
 *
 * WHAT MATTERS MOST IS THE REFUSALS. An invitation that works is easy to check
 * by clicking. What nobody clicks is a browser trying to mint its own token, a
 * school administrator issuing a code for a child at another school, or a
 * second person redeeming a code that has already been used. Those are the
 * tests below.
 *
 * The tokens are hashed here the same way the server hashes them — SHA-256,
 * hex — because the database only ever sees the hash. A test that inserted a
 * raw token would be testing something the product does not do.
 */

const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex')

/** The server's normalisation: any case, dashes or spaces, all equivalent. */
const normalise = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, '')

let world: World
/** Somebody with an account and no school, ready to be invited. */
let newcomer: Actor

beforeAll(async () => {
  world = await buildWorld()
  newcomer = await makeActor('parent', world.runId, 'newcomer', null, false)
}, 90_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 90_000)

async function issueInvitation(
  email: string,
  role: 'educator' | 'specialist' | 'school_admin',
  rawToken: string,
  schoolId = world.schoolId,
) {
  return admin.rpc('issue_invitation', {
    p_school_id: schoolId,
    p_email: email,
    p_role: role,
    p_token_hash: sha256(rawToken),
    p_invited_by: world.schoolAdmin.id,
  })
}

// ===========================================================================
// Invitations — db/035, db/036
// ===========================================================================

describe('a browser cannot mint an invitation', () => {
  test('there is no insert policy, for anybody', async () => {
    // Generating a token and storing only its hash is not something a browser
    // can be trusted with — it would choose its own, and it would have to be
    // told the hashing scheme. So the table has no insert policy at all.
    for (const [label, actor] of [
      ['school admin', world.schoolAdmin],
      ['platform admin', world.platformAdmin],
      ['educator', world.verifiedEducator],
    ] as const) {
      const { error } = await actor.db.from('invitations').insert({
        school_id: world.schoolId,
        email: 'someone@example.com',
        role: 'educator',
        token_hash: sha256('forged'),
      })
      expect(error, `${label} must not be able to insert`).not.toBeNull()
    }
  })

  test('nor call the function that does', async () => {
    const { error } = await world.schoolAdmin.db.rpc('issue_invitation', {
      p_school_id: world.schoolId,
      p_email: 'someone@example.com',
      p_role: 'educator',
      p_token_hash: sha256('forged'),
      p_invited_by: world.schoolAdmin.id,
    })
    expect(error).not.toBeNull()
  })

  test('an invitation cannot grant platform_admin', async () => {
    // Special Miles staff are made deliberately, by a human with database
    // access. No email should be able to change that.
    const { error } = await issueInvitation(
      'attacker@example.com',
      'platform_admin' as never,
      'nope',
    )
    expect(error).not.toBeNull()
  })
})

describe('who can see invitations', () => {
  beforeAll(async () => {
    const { error } = await issueInvitation('visible@example.com', 'educator', 'see-me')
    if (error) throw new Error(error.message)
  })

  test('the school administrator sees their own school’s', async () => {
    const { data } = await world.schoolAdmin.db.from('invitations').select('email')
    expect(data?.map((i) => i.email)).toContain('visible@example.com')
  })

  test('a platform administrator sees it too', async () => {
    const { data } = await world.platformAdmin.db.from('invitations').select('email')
    expect(data?.map((i) => i.email)).toContain('visible@example.com')
  })

  test('a teacher sees none — inviting staff is not their job', async () => {
    const { data } = await world.verifiedEducator.db.from('invitations').select('id')
    expect(data ?? []).toEqual([])
  })

  test('a parent sees none', async () => {
    const { data } = await world.guardianOfA.db.from('invitations').select('id')
    expect(data ?? []).toEqual([])
  })

  test('an administrator at another school sees none of ours', async () => {
    // The clearest tenancy question there is: can one customer see another's
    // staff list forming.
    const other = await makeActor(
      'parent',
      world.runId,
      'otheradmin',
      world.otherSchoolId,
      true,
      'school_admin',
    )
    const { data } = await other.db.from('invitations').select('email')
    expect(data ?? []).toEqual([])
    await other.db.auth.signOut()
  })
})

describe('redeeming an invitation', () => {
  test('it attaches the account, sets the role, and verifies them', async () => {
    const raw = 'redeem-me-once'
    const { error: issueError } = await issueInvitation(
      newcomer.email,
      'educator',
      raw,
    )
    expect(issueError).toBeNull()

    const { error } = await admin.rpc('redeem_invitation', {
      p_token_hash: sha256(raw),
      p_profile_id: newcomer.id,
    })
    expect(error).toBeNull()

    const { data } = await admin
      .from('profiles')
      .select('school_id, role, is_verified')
      .eq('id', newcomer.id)
      .single()

    expect(data?.school_id).toBe(world.schoolId)
    expect(data?.role).toBe('educator')
    // VERIFIED ON ACCEPTANCE is the whole point. The administrator already
    // said this person works here; a pending queue asks the same question twice.
    expect(data?.is_verified).toBe(true)
  })

  /**
   * THE TEST ABOVE PASSED THROUGHOUT A PERIOD WHEN ACCEPTING AN INVITATION
   * PRODUCED AN ACCOUNT THAT COULD DO NOTHING.
   *
   * Everything it asserts is true and none of it is the promise. db/039 made
   * `my_role()` require a live membership, and `redeem_invitation` was never
   * taught to grant one — so the profile said "educator at this school" and
   * every policy in the database, all of which ask `my_role()`, answered null.
   * db/046 is the fix; this is the question that should have been asked.
   *
   * It signs in as the invited person rather than reading their row, because
   * "the row says educator" and "they can teach" turned out to be different
   * statements, and only one of them is what a school was promised.
   */
  test('and the invited person can actually do the job', async () => {
    const { data: role } = await newcomer.db.rpc('my_role')
    const { data: school } = await newcomer.db.rpc('my_school_id')
    const { data: memberships } = await newcomer.db.rpc('my_memberships')

    expect(role).toBe('educator')
    expect(school).toBe(world.schoolId)

    // What they MAY be — db/039. Without this row the two answers above are
    // null however tidy the profile looks.
    expect(memberships).toHaveLength(1)

    /*
     * And now the thing an educator is FOR.
     *
     * The assertion here was first written as "they can see some students",
     * which failed — correctly. Employment is not access in this product:
     * `can_staff_view_student` reaches a child through `is_assigned_staff_for`,
     * so a teacher who has been given no class sees nobody, and should.
     *
     * So the test assigns one child and asks again. That is the real chain —
     * membership makes `my_role()` answer, `my_role()` makes the policy run,
     * the policy finds the assignment — and before db/046 it broke at the first
     * link while the profile row looked perfect.
     */
    await admin.from('student_educators').insert({
      student_id: world.childB,
      profile_id: newcomer.id,
      assignment: 'class_teacher',
    })

    const { data: students } = await newcomer.db.from('students').select('id')
    expect(students?.map((s) => s.id)).toEqual([world.childB])

    // Left as it was found: the db/036 regression below starts by asserting
    // this person has no assignments, and it is entitled to.
    await admin
      .from('student_educators')
      .delete()
      .eq('profile_id', newcomer.id)
      .eq('student_id', world.childB)
  })

  test('the same token cannot be used again', async () => {
    const { error } = await admin.rpc('redeem_invitation', {
      p_token_hash: sha256('redeem-me-once'),
      p_profile_id: world.guardianOfB.id,
    })
    expect(error?.message).toMatch(/already been used/i)
  })

  test('a revoked invitation is refused', async () => {
    const raw = 'revoked-token'
    await issueInvitation('revoked@example.com', 'educator', raw)
    await admin
      .from('invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', sha256(raw))

    const { error } = await admin.rpc('redeem_invitation', {
      p_token_hash: sha256(raw),
      p_profile_id: world.guardianOfB.id,
    })
    expect(error?.message).toMatch(/withdrawn/i)
  })

  test('an expired invitation is refused', async () => {
    const raw = 'expired-token'
    await issueInvitation('expired@example.com', 'educator', raw)
    await admin
      .from('invitations')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('token_hash', sha256(raw))

    const { error } = await admin.rpc('redeem_invitation', {
      p_token_hash: sha256(raw),
      p_profile_id: world.guardianOfB.id,
    })
    expect(error?.message).toMatch(/expired/i)
  })

  test('a token nobody issued is refused', async () => {
    const { error } = await admin.rpc('redeem_invitation', {
      p_token_hash: sha256('never-existed'),
      p_profile_id: world.guardianOfB.id,
    })
    expect(error).not.toBeNull()
  })
})

describe('regression — db/036, moving school ends the old access', () => {
  test('assignments to children left behind are removed', async () => {
    // THE BUG THIS GUARDS. redeem_invitation set school, role and verification
    // and left student_educators alone — and `is_assigned_staff_for()` never
    // looks at anybody's school. A teacher who moved kept every assignment at
    // the school they had left, and nothing on any screen showed it.
    const { data: before } = await admin
      .from('student_educators')
      .select('student_id')
      .eq('profile_id', newcomer.id)
    expect(before?.length, 'newcomer should start with no assignments').toBe(0)

    await admin.from('student_educators').insert({
      student_id: world.childA,
      profile_id: newcomer.id,
      assignment: 'class_teacher',
    })

    const raw = 'moving-schools'
    await issueInvitation(newcomer.email, 'educator', raw, world.otherSchoolId)
    const { error } = await admin.rpc('redeem_invitation', {
      p_token_hash: sha256(raw),
      p_profile_id: newcomer.id,
    })
    expect(error).toBeNull()

    const { data: after } = await admin
      .from('student_educators')
      .select('student_id')
      .eq('profile_id', newcomer.id)

    expect(after ?? [], 'ChildA is at the old school and must be released').toEqual([])
  })
})

// ===========================================================================
// Guardian access codes — db/037, db/038
// ===========================================================================

async function issueCode(
  studentId: string,
  email: string,
  rawCode: string,
) {
  return admin.rpc('issue_guardian_code', {
    p_student_id: studentId,
    p_email: email,
    p_relationship: 'guardian',
    p_code_hash: sha256(normalise(rawCode)),
    p_issued_by: world.schoolAdmin.id,
  })
}

describe('a browser cannot mint a guardian code', () => {
  test('there is no insert policy', async () => {
    const { error } = await world.schoolAdmin.db
      .from('guardian_access_codes')
      .insert({
        student_id: world.childA,
        guardian_email: 'forger@example.com',
        code_hash: sha256('FORGED'),
      })
    expect(error).not.toBeNull()
  })

  test('nor call issue, peek or redeem', async () => {
    // All three are service_role only. Peek especially: it is rate limited on
    // the server, and a browser calling it directly would walk around that.
    for (const fn of [
      ['issue_guardian_code', { p_student_id: world.childA, p_email: 'a@b.com', p_relationship: 'guardian', p_code_hash: 'x', p_issued_by: world.schoolAdmin.id }],
      ['peek_guardian_code', { p_code_hash: 'x' }],
      ['redeem_guardian_code', { p_code_hash: 'x', p_profile_id: world.guardianOfB.id, p_profile_email: 'a@b.com' }],
    ] as const) {
      const { error } = await world.schoolAdmin.db.rpc(fn[0], fn[1] as never)
      expect(error, `${fn[0]} must be refused`).not.toBeNull()
    }
  })
})

describe('who can see guardian codes', () => {
  beforeAll(async () => {
    const { error } = await issueCode(world.childA, 'family@example.com', 'AAAA-BBBB-CCCC')
    if (error) throw new Error(error.message)
  })

  test('the school administrator can, so they can answer a family', async () => {
    const { data } = await world.schoolAdmin.db
      .from('guardian_access_codes')
      .select('guardian_email')
    expect(data?.map((c) => c.guardian_email)).toContain('family@example.com')
  })

  test('a teacher cannot — issuing family access is an office decision', async () => {
    const { data } = await world.verifiedEducator.db
      .from('guardian_access_codes')
      .select('id')
    expect(data ?? []).toEqual([])
  })

  test('a guardian cannot see codes, including their own child’s', async () => {
    const { data } = await world.guardianOfA.db
      .from('guardian_access_codes')
      .select('id')
    expect(data ?? []).toEqual([])
  })

  test('the hash is never a working code even to somebody who can read it', async () => {
    // A school admin reading their own school's rows sees hashes, not codes.
    // Hashing is one-way, which is why letting them read the row is safe.
    const { data } = await world.schoolAdmin.db
      .from('guardian_access_codes')
      .select('*')
      .limit(1)
      .single()
    expect(Object.keys(data ?? {})).not.toContain('code')
  })
})

describe('redeeming a guardian code', () => {
  test('the wrong address is refused, and the attempt is counted', async () => {
    // THE PART WORTH DEFENDING. Family separation and contested custody are
    // ordinary here; a code that works for whoever holds the paper works for a
    // parent a court has excluded.
    const raw = 'DDDD-EEEE-FFFF'
    await issueCode(world.childB, 'right@example.com', raw)

    const { data: outcome } = await admin.rpc('redeem_guardian_code', {
      p_code_hash: sha256(normalise(raw)),
      p_profile_id: world.guardianOfB.id,
      p_profile_email: 'wrong@example.com',
    })
    expect(outcome?.[0]?.ok).toBe(false)
    expect(outcome?.[0]?.message).toMatch(/different email/i)

    // THE ASSERTION THAT FOUND db/043. The increment used to sit before a
    // RAISE, which rolled it back — so this counter could never leave zero,
    // and the "failed attempts" line on the Family access screen was a
    // permanent lie.
    const { data: row } = await admin
      .from('guardian_access_codes')
      .select('attempts, redeemed_at')
      .eq('code_hash', sha256(normalise(raw)))
      .single()

    expect(row?.attempts).toBe(1)
    expect(row?.redeemed_at, 'a refused attempt must not spend the code').toBeNull()
  })

  test('the right address links the child', async () => {
    const raw = 'GGGG-HHHH-JJJJ'
    await issueCode(world.childB, world.guardianOfA.email, raw)

    const { data, error } = await admin.rpc('redeem_guardian_code', {
      p_code_hash: sha256(normalise(raw)),
      p_profile_id: world.guardianOfA.id,
      p_profile_email: world.guardianOfA.email,
    })
    expect(error).toBeNull()
    expect(data?.[0]?.ok).toBe(true)
    // The display name, not the full one — enough to know it is the right
    // child, not a full identity handed to whoever holds a code.
    expect(data?.[0]?.child_name).toMatch(/^ChildB B\.$/)

    const { data: link } = await admin
      .from('student_guardians')
      .select('student_id')
      .eq('profile_id', world.guardianOfA.id)
      .eq('student_id', world.childB)
    expect(link?.length).toBe(1)
  })

  test('case and dashes do not matter', async () => {
    // It gets read off paper, down a phone line, by somebody holding a toddler.
    const raw = 'KKKK-LLLL-MMMM'
    await issueCode(world.childA, 'casing@example.com', raw)

    const { data } = await admin.rpc('redeem_guardian_code', {
      p_code_hash: sha256(normalise('  kkkk llll mmmm  ')),
      p_profile_id: world.guardianOfB.id,
      p_profile_email: 'casing@example.com',
    })
    expect(data?.[0]?.ok).toBe(true)
  })

  test('a code works once', async () => {
    const raw = 'NNNN-PPPP-QQQQ'
    await issueCode(world.childA, 'oncecode@example.com', raw)

    const first = await admin.rpc('redeem_guardian_code', {
      p_code_hash: sha256(normalise(raw)),
      p_profile_id: world.guardianOfB.id,
      p_profile_email: 'oncecode@example.com',
    })
    expect(first.data?.[0]?.ok).toBe(true)

    const second = await admin.rpc('redeem_guardian_code', {
      p_code_hash: sha256(normalise(raw)),
      p_profile_id: world.guardianOfB.id,
      p_profile_email: 'oncecode@example.com',
    })
    expect(second.data?.[0]?.message).toMatch(/already been used/i)
  })

  test('a withdrawn code is refused', async () => {
    const raw = 'RRRR-SSSS-TTTT'
    await issueCode(world.childA, 'withdrawn@example.com', raw)
    await admin
      .from('guardian_access_codes')
      .update({ revoked_at: new Date().toISOString() })
      .eq('code_hash', sha256(normalise(raw)))

    const { data } = await admin.rpc('redeem_guardian_code', {
      p_code_hash: sha256(normalise(raw)),
      p_profile_id: world.guardianOfB.id,
      p_profile_email: 'withdrawn@example.com',
    })
    expect(data?.[0]?.message).toMatch(/withdrawn/i)
  })

  test('an expired code is refused', async () => {
    const raw = 'UUUU-VVVV-WWWW'
    await issueCode(world.childA, 'expiredcode@example.com', raw)
    await admin
      .from('guardian_access_codes')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('code_hash', sha256(normalise(raw)))

    const { data } = await admin.rpc('redeem_guardian_code', {
      p_code_hash: sha256(normalise(raw)),
      p_profile_id: world.guardianOfB.id,
      p_profile_email: 'expiredcode@example.com',
    })
    expect(data?.[0]?.message).toMatch(/expired/i)
  })
})

describe('codes and invitations are records, not fields', () => {
  test('nobody can delete a guardian code', async () => {
    const { data: before } = await admin
      .from('guardian_access_codes')
      .select('id')
      .limit(1)
      .single()

    await world.schoolAdmin.db
      .from('guardian_access_codes')
      .delete()
      .eq('id', before!.id)
    await world.platformAdmin.db
      .from('guardian_access_codes')
      .delete()
      .eq('id', before!.id)

    const { data: after } = await admin
      .from('guardian_access_codes')
      .select('id')
      .eq('id', before!.id)
    expect(after?.length, 'that a code was issued is what an audit asks about').toBe(1)
  })

  test('nobody can delete an invitation', async () => {
    const { data: before } = await admin
      .from('invitations')
      .select('id')
      .limit(1)
      .single()

    await world.schoolAdmin.db.from('invitations').delete().eq('id', before!.id)

    const { data: after } = await admin
      .from('invitations')
      .select('id')
      .eq('id', before!.id)
    expect(after?.length).toBe(1)
  })
})
