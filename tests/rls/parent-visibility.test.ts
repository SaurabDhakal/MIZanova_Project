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
 * db/052 — which parents a school administrator can see.
 *
 * THE BUG THIS GUARDS AGAINST IS A SHORTER LIST, which is the kind of wrong
 * nobody notices. `profiles_select_school_admin` asked whether the PROFILE
 * carried the school's id. That is right for staff and asks about the wrong
 * thing for a parent — db/039 said so in its own backfill: a parent belongs to
 * a child, through `student_guardians`, not to a school.
 *
 * On the real database all three parents had children at one school and only
 * one carried that school's id. The other two arrived through `/link`, which
 * is the actual route, and nothing in redeeming a guardian code sets a school
 * — nor should it. So an administrator saw one parent in three, and the "link
 * a guardian to this child" control could not find the rest.
 */

let world: World
/** A guardian of ChildA whose profile carries no school at all. */
let unattached: Actor

beforeAll(async () => {
  world = await buildWorld()

  // Exactly the shape `/link` produces: a parent account with no school_id,
  // connected to a child by a guardian row and nothing else.
  unattached = await makeActor('parent', world.runId, 'codeparent', null, false)

  await admin.from('student_guardians').insert({
    student_id: world.childA,
    profile_id: unattached.id,
    relationship: 'parent',
  })
}, 120_000)

afterAll(async () => {
  if (world) {
    if (unattached) {
      await admin
        .from('student_guardians')
        .delete()
        .eq('profile_id', unattached.id)
      await admin.auth.admin.deleteUser(unattached.id)
    }
    await destroyWorld(world)
  }
}, 120_000)

describe('a school administrator sees the parents of their students', () => {
  test('including one whose profile carries no school at all', async () => {
    // The whole defect in one assertion. Before db/052 this parent was
    // invisible to the administrator of the school their child attends.
    const { data, error } = await world.schoolAdmin.db
      .from('profiles')
      .select('id')
      .eq('role', 'parent')

    expect(error).toBeNull()
    expect((data ?? []).map((p) => p.id)).toContain(unattached.id)
  })

  test('and the guardian-linking control can therefore find them', async () => {
    // What the defect actually cost: an administrator could not connect a
    // second child to a parent who had joined by code, because the parent was
    // not in the list to choose from.
    const { data } = await world.schoolAdmin.db
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'parent')
      .order('full_name')

    expect((data ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('and no more than that', () => {
  test('an administrator at another school cannot see them', async () => {
    // The parent is visible in respect of the child that makes it true, and
    // nowhere else.
    const other = await makeActor(
      'parent',
      world.runId,
      'otherschooladmin2',
      world.otherSchoolId,
      true,
      'school_admin',
    )

    const { data } = await other.db.from('profiles').select('id').eq('role', 'parent')
    expect((data ?? []).map((p) => p.id)).not.toContain(unattached.id)

    await other.db.auth.signOut()
    await admin.auth.admin.deleteUser(other.id)
  }, 60_000)

  test('a teacher sees only the guardians of their own students', async () => {
    /*
     * WRITTEN WRONG FIRST, and worth keeping the correction visible.
     *
     * This originally asserted a teacher sees NO parents, on the strength of
     * db/004's comment that parent rows are "deliberately excluded" from the
     * staff directory. That was true when db/004 was written and db/009
     * narrowly widened it: messaging needs a teacher to see the guardians OF
     * STUDENTS THEY ARE ASSIGNED TO, by name, or the feature cannot exist.
     *
     * So the real rule is not "none" — it is "exactly those". Asserting the
     * stale version would have failed honestly today and, worse, could have
     * been "fixed" by narrowing a policy that messaging depends on.
     */
    const { data: visible } = await world.verifiedEducator.db
      .from('profiles')
      .select('id')
      .eq('role', 'parent')

    // What the rule says they should see, computed independently.
    const { data: mine } = await admin
      .from('student_educators')
      .select('student_id')
      .eq('profile_id', world.verifiedEducator.id)

    const { data: guardians } = await admin
      .from('student_guardians')
      .select('profile_id')
      .in(
        'student_id',
        (mine ?? []).map((row) => row.student_id),
      )

    const expected = new Set((guardians ?? []).map((g) => g.profile_id))
    const actual = new Set((visible ?? []).map((p) => p.id))

    expect([...actual].sort()).toEqual([...expected].sort())
  })

  test('one parent still cannot see another', async () => {
    const { data } = await world.guardianOfA.db
      .from('profiles')
      .select('id')
      .eq('role', 'parent')

    // Only themselves, through profiles_select_own.
    expect((data ?? []).map((p) => p.id)).toEqual([world.guardianOfA.id])
  })
})

/*
 * ---------------------------------------------------------------------------
 * A PARENT MAY CORRECT THEIR OWN NOTE. THE SCHOOL MAY NOT.
 * ---------------------------------------------------------------------------
 * db/007 states it plainly: "Authors may correct their own. Staff may not edit
 * what a parent wrote — altering someone else's account of their own child is
 * not a power the school should have."
 *
 * The policy had never been exercised by anything. No screen offered the
 * correction until now, and no test asserted the refusal, so the sentence
 * above was a comment rather than a guarantee. The second test is the one that
 * matters: an educator who can READ the observation, and can edit plenty of
 * other records about the same child, must not be able to touch this one.
 */
describe('who may correct a home observation — db/007', () => {
  let observationId: string

  beforeAll(async () => {
    const { data, error } = await admin
      .from('home_observations')
      .insert({
        student_id: world.childA,
        logged_by: world.guardianOfA.id,
        title: 'Slept badly',
        body: 'Awake from three. Original wording.',
        category: 'social_emotional',
        observed_on: '2026-08-20',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    observationId = data.id
  })

  async function bodyOnRecord() {
    const { data } = await admin
      .from('home_observations')
      .select('body')
      .eq('id', observationId)
      .single()
    return data?.body ?? null
  }

  test('the parent who wrote it can', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('home_observations')
      .update({ body: 'Awake from three. Settled after a story.' })
      .eq('id', observationId)
      .select('id')

    expect(error).toBeNull()
    // The row came back, which is what assertChanged in the app reads.
    expect(data).toHaveLength(1)
    expect(await bodyOnRecord()).toBe('Awake from three. Settled after a story.')
  })

  test('a teacher who can read it cannot change it', async () => {
    const before = await bodyOnRecord()

    const { data, error } = await world.verifiedEducator.db
      .from('home_observations')
      .update({ body: 'Rewritten by the school.' })
      .eq('id', observationId)
      .select('id')

    // No error — RLS filters the row out rather than refusing, which is why
    // the app calls assertChanged on an empty array.
    expect(error).toBeNull()
    expect(data).toEqual([])
    expect(await bodyOnRecord()).toBe(before)
  })

  test('nor can another parent', async () => {
    const { data } = await world.guardianOfB.db
      .from('home_observations')
      .update({ body: 'Rewritten by somebody else’s parent.' })
      .eq('id', observationId)
      .select('id')

    expect(data ?? []).toEqual([])
  })

  test('and nobody can delete it — db/007 writes no delete policy', async () => {
    await world.guardianOfA.db
      .from('home_observations')
      .delete()
      .eq('id', observationId)
    await world.verifiedEducator.db
      .from('home_observations')
      .delete()
      .eq('id', observationId)

    // An observation the school has read, and may have acted on, is corrected
    // rather than made to disappear.
    const { data } = await admin
      .from('home_observations')
      .select('id')
      .eq('id', observationId)
    expect(data).toHaveLength(1)
  })
})
