import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  admin,
  buildSpecialistWorld,
  destroyWorld,
  type SpecialistWorld,
} from '../helpers/world'

/**
 * db/039 and db/040 — one identity, many memberships, one active context.
 *
 * These two scripts changed the foundation everything else stands on, and
 * neither had a test until now. The distinction they rest on is easy to state
 * and easy to get wrong:
 *
 *   memberships               what you MAY be
 *   profiles.role/school_id   what you currently ARE
 *
 * db/040 exists because the second half was not being enforced anywhere. The
 * context switcher moved the pointer correctly and every screen carried on
 * showing the previous school's children, because `is_assigned_staff_for()`
 * asks whether a link exists and has no opinion about where anybody is
 * working. That is what the middle describe below holds in place.
 */

let world: SpecialistWorld

beforeAll(async () => {
  world = await buildSpecialistWorld()

  // The specialist genuinely works at both schools — the case that could not
  // be represented at all before db/039.
  const { error: membershipError } = await admin.from('memberships').insert({
    profile_id: world.specialist.id,
    organisation_id: world.otherSchoolId,
    role: 'specialist',
  })
  if (membershipError) throw new Error(membershipError.message)

  const { error: assignError } = await admin.from('student_educators').insert({
    student_id: world.outsiderChild,
    profile_id: world.specialist.id,
    assignment: 'specialist',
  })
  if (assignError) throw new Error(assignError.message)
}, 90_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 90_000)

/** What the caseload screen asks for, through the signed-in user's own client. */
async function visibleStudents(actor: SpecialistWorld['specialist']) {
  const { data } = await actor.db.from('students').select('id')
  return (data ?? []).map((s) => s.id)
}

describe('what a person may be', () => {
  test('the specialist holds two memberships', async () => {
    const { data } = await world.specialist.db.rpc('my_memberships')
    expect(data?.length).toBe(2)
  })

  test('a single-school teacher holds exactly one', async () => {
    const { data } = await world.verifiedEducator.db.rpc('my_memberships')
    expect(data?.length).toBe(1)
  })

  test('a parent holds none, and that is not an oversight', async () => {
    // A guardian belongs to a CHILD through student_guardians, not to a school.
    const { data } = await world.guardianOfA.db.rpc('my_memberships')
    expect(data ?? []).toEqual([])
  })

  test('a parent still sees their own child without one', async () => {
    const seen = await visibleStudents(world.guardianOfA)
    expect(seen).toEqual([world.childA])
  })
})

describe('regression — db/040, context scopes what staff can see', () => {
  test('at their first school, the specialist sees that school’s children only', async () => {
    const seen = await visibleStudents(world.specialist)
    expect(seen).toContain(world.childA)
    expect(seen).not.toContain(world.outsiderChild)
  })

  test('switching moves them, and the other school’s child appears', async () => {
    const { error } = await world.specialist.db.rpc('switch_context', {
      p_organisation_id: world.otherSchoolId,
      p_role: 'specialist',
    })
    expect(error).toBeNull()

    const seen = await visibleStudents(world.specialist)
    expect(seen).toContain(world.outsiderChild)
  })

  test('AND the first school’s children are gone', async () => {
    // THE ONE THAT MATTERS. Before db/040 this failed: the specialist kept
    // every child they were assigned to, at every school, whichever one they
    // were notionally working at. The screen said otherwise, which is worse
    // than saying nothing.
    const seen = await visibleStudents(world.specialist)
    expect(seen).not.toContain(world.childA)
    expect(seen).not.toContain(world.childB)
  })

  test('switching back restores them', async () => {
    await world.specialist.db.rpc('switch_context', {
      p_organisation_id: world.schoolId,
      p_role: 'specialist',
    })

    const seen = await visibleStudents(world.specialist)
    expect(seen).toContain(world.childA)
    expect(seen).not.toContain(world.outsiderChild)
  })
})

describe('switching is not a way in', () => {
  test('a teacher cannot switch to a school they do not belong to', async () => {
    const { error } = await world.verifiedEducator.db.rpc('switch_context', {
      p_organisation_id: world.otherSchoolId,
      p_role: 'educator',
    })

    expect(error).not.toBeNull()
  })

  test('and their context is unchanged afterwards', async () => {
    // The refusal has to be real, not just an error message. Postgres reports
    // success on a filtered UPDATE, so the row is read back with the service key.
    const { data } = await admin
      .from('profiles')
      .select('school_id')
      .eq('id', world.verifiedEducator.id)
      .single()

    expect(data?.school_id).toBe(world.schoolId)
  })

  test('nobody can promote themselves by switching role', async () => {
    // A membership is per role. Holding 'specialist' at a school says nothing
    // about being able to administer it.
    const { error } = await world.specialist.db.rpc('switch_context', {
      p_organisation_id: world.schoolId,
      p_role: 'school_admin',
    })

    expect(error).not.toBeNull()

    const { data } = await admin
      .from('profiles')
      .select('role')
      .eq('id', world.specialist.id)
      .single()
    expect(data?.role).toBe('specialist')
  })
})

describe('ending a membership ends the access', () => {
  test('a staff member with no live membership is nobody', async () => {
    // The tightening db/039 brought. Before it, profiles.role was trusted on
    // its own, so somebody who left kept their role and their school for ever
    // and nothing ever checked again.
    const { error } = await admin
      .from('memberships')
      .update({ ended_at: new Date().toISOString() })
      .eq('profile_id', world.unverifiedEducator.id)

    expect(error).toBeNull()

    const { data: role } = await world.unverifiedEducator.db.rpc('my_role')
    expect(role).toBeNull()
  })
})
