import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * Who opened which child's record (db/023).
 *
 * An access log is only worth having if three things are true: it records the
 * right person, nobody can add a false entry, and nobody can remove a true
 * one. All three are asserted here, because a log that fails any of them is
 * worse than no log — it produces confident answers that are wrong.
 */

let world: World

beforeAll(async () => {
  world = await buildWorld()
}, 60_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 60_000)

async function entriesFor(studentId: string) {
  const { data } = await admin
    .from('student_access_events')
    .select('id, actor_id, student_id, context, occurred_at')
    .eq('student_id', studentId)
    .order('occurred_at', { ascending: false })
  return data ?? []
}

describe('recording', () => {
  test('opening a record is recorded against the person who opened it', async () => {
    const { error } = await world.verifiedEducator.db.rpc('log_student_access', {
      p_student_id: world.childA,
    })
    expect(error).toBeNull()

    const rows = await entriesFor(world.childA)
    expect(rows.length).toBe(1)
    expect(rows[0].actor_id).toBe(world.verifiedEducator.id)
    expect(rows[0].context).toBe('student_record')
  })

  test('the actor cannot be forged, because it is never supplied', async () => {
    // The function reads auth.uid(). There is no argument to lie in — the only
    // way to appear as somebody else is to be them.
    const { error } = await world.schoolAdmin.db.rpc('log_student_access', {
      p_student_id: world.childA,
      p_context: 'admin_review',
    })
    expect(error).toBeNull()

    const rows = await entriesFor(world.childA)
    const admins = rows.filter((r) => r.context === 'admin_review')
    expect(admins.length).toBe(1)
    expect(admins[0].actor_id).toBe(world.schoolAdmin.id)
  })

  test('repeat views within five minutes are recorded once', async () => {
    // Opening a page fires several queries and React refetches on focus.
    // Without this the useful signal drowns in duplicates.
    for (let i = 0; i < 4; i++) {
      await world.verifiedEducator.db.rpc('log_student_access', {
        p_student_id: world.childA,
      })
    }

    const rows = await entriesFor(world.childA)
    const educatorRows = rows.filter(
      (r) => r.actor_id === world.verifiedEducator.id && r.context === 'student_record',
    )
    expect(educatorRows.length).toBe(1)
  })

  test('a different child is recorded separately', async () => {
    await world.schoolAdmin.db.rpc('log_student_access', {
      p_student_id: world.childB,
    })

    expect((await entriesFor(world.childB)).length).toBe(1)
  })
})

describe('who can read it', () => {
  test('a school administrator can see access to their own students', async () => {
    const { data, error } = await world.schoolAdmin.db
      .from('student_access_events')
      .select('id')
      .eq('student_id', world.childA)

    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  /**
   * db/024. A school admin is responsible for the staff below them and is not
   * exempt from being watched themselves — they are simply watched from one
   * level up, by Special Miles, rather than by their own screen.
   *
   * Before this they could read every row for their school, and their own
   * reads are rows for their school. The role with the most access to
   * children's records was the only one able to check what had been noticed
   * about it.
   */
  test('a school administrator cannot see their OWN accesses', async () => {
    const { data } = await world.schoolAdmin.db
      .from('student_access_events')
      .select('actor_id')

    expect((data ?? []).length).toBeGreaterThan(0)
    expect((data ?? []).some((r) => r.actor_id === world.schoolAdmin.id)).toBe(
      false,
    )
  })

  test('the staff member whose reads are recorded cannot see the log', async () => {
    // An audit trail its subject can inspect for gaps is a map of where to
    // hide. The educator has read records here and can see none of them.
    const { data } = await world.verifiedEducator.db
      .from('student_access_events')
      .select('id')

    expect(data ?? []).toEqual([])
  })

  /**
   * The top of the chain. Staff are visible to their school, and the school is
   * visible to Special Miles — which is only true if this holds, including for
   * the accesses a school admin cannot see themselves.
   */
  test('a platform administrator sees everything, including a school admin’s own', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('student_access_events')
      .select('actor_id')

    expect(error).toBeNull()

    const actors = (data ?? []).map((r) => r.actor_id)
    expect(actors).toContain(world.verifiedEducator.id)
    // The row the school admin is deliberately blind to.
    expect(actors).toContain(world.schoolAdmin.id)
  })

  test('a guardian cannot see who has been reading their child’s record', async () => {
    // Arguably they should, one day, and that would be a deliberate feature
    // with its own policy. Today they cannot, and the test says which it is.
    const { data } = await world.guardianOfA.db
      .from('student_access_events')
      .select('id')

    expect(data ?? []).toEqual([])
  })
})

describe('what nobody can do', () => {
  test('nobody can write a false entry directly', async () => {
    const { error } = await world.schoolAdmin.db
      .from('student_access_events')
      .insert({
        actor_id: world.verifiedEducator.id,
        student_id: world.childA,
        context: 'planted',
      })

    expect(error).not.toBeNull()

    const rows = await entriesFor(world.childA)
    expect(rows.some((r) => r.context === 'planted')).toBe(false)
  })

  test('nobody can alter an entry', async () => {
    const before = await entriesFor(world.childA)
    const target = before[0]

    await world.schoolAdmin.db
      .from('student_access_events')
      .update({ actor_id: world.guardianOfA.id })
      .eq('id', target.id)

    const after = await entriesFor(world.childA)
    expect(after.find((r) => r.id === target.id)?.actor_id).toBe(target.actor_id)
  })

  test('nobody can delete an entry', async () => {
    const before = await entriesFor(world.childA)

    await world.schoolAdmin.db
      .from('student_access_events')
      .delete()
      .eq('student_id', world.childA)
    await world.verifiedEducator.db
      .from('student_access_events')
      .delete()
      .eq('student_id', world.childA)

    const after = await entriesFor(world.childA)
    expect(after.length).toBe(before.length)
  })
})
