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
 * db/049 — telling a school HOW a specialist reached them.
 *
 * A specialist arrives by one of two routes. Special Miles vetted them at gate
 * 1 and a school then engaged them, or the school invited them directly and
 * nobody checked anything. Both are allowed. Until now they looked identical in
 * the directory, so "verified" read as one thing while meaning two.
 *
 * THE FAILURE THIS GUARDS AGAINST IS A CONFIDENT WRONG ANSWER. The obvious
 * implementation is a view with `security_invoker`, which reads
 * `specialist_applications` as the caller — and a school admin has no policy on
 * that table, so every specialist would come back un-vetted. Not an error: a
 * safeguarding label, wrong in the direction that makes a checked person look
 * unchecked. So the first test below is that a school admin gets a TRUE answer
 * about a table they cannot read.
 */

let world: World
/** A specialist at the world's school who came through gate 1. */
let vetted: Actor
/** A specialist at the same school the school invited directly. */
let unvetted: Actor

beforeAll(async () => {
  world = await buildWorld()

  vetted = await makeActor(
    'specialist',
    world.runId,
    'vettedspec',
    world.schoolId,
    true,
  )
  unvetted = await makeActor(
    'specialist',
    world.runId,
    'ownspec',
    world.schoolId,
    true,
  )

  // Only one of them applied and was approved.
  const { data } = await admin
    .from('specialist_applications')
    .insert({
      full_name: 'Vetted Specialist',
      email: vetted.email,
      date_of_birth: '1987-02-02',
      profession: 'occupational_therapist',
      wwcc_state: 'NSW',
      wwcc_number: 'WWC7777777E',
      wwcc_expiry: '2030-01-01',
    })
    .select('id')
    .single()

  await admin
    .from('specialist_applications')
    .update({ status: 'approved' })
    .eq('id', data!.id)
}, 120_000)

afterAll(async () => {
  if (world) {
    await admin
      .from('specialist_applications')
      .delete()
      .like('email', `%${world.runId}%`)
    await admin.from('staff_screening').delete().like('email', `%${world.runId}%`)
    if (vetted) await admin.auth.admin.deleteUser(vetted.id)
    if (unvetted) await admin.auth.admin.deleteUser(unvetted.id)
    await destroyWorld(world)
  }
}, 120_000)

describe('a school admin learns who was vetted, without reading the applications', () => {
  test('the application table itself stays closed to them', async () => {
    // The premise. If this ever starts returning rows, db/047's whole point —
    // that a date of birth and a WWCC number are Special Miles' business — has
    // quietly stopped being true.
    const { data } = await world.schoolAdmin.db
      .from('specialist_applications')
      .select('id')

    expect(data ?? []).toHaveLength(0)
  })

  test('and yet they get a true answer about their own staff', async () => {
    const { data, error } = await world.schoolAdmin.db.rpc('my_staff_vetting')

    expect(error).toBeNull()

    const ids = (data ?? []).map((row: { staff_id: string }) => row.staff_id)
    expect(ids).toContain(vetted.id)
    // The one their school invited directly is absent, which is the whole
    // distinction the label draws.
    expect(ids).not.toContain(unvetted.id)
  })

  test('the answer is a date and nothing else', async () => {
    const { data } = await world.schoolAdmin.db.rpc('my_staff_vetting')
    const row = (data ?? []).find(
      (r: { staff_id: string }) => r.staff_id === vetted.id,
    )

    // Not the WWCC number, not the date of birth, not the application id.
    // "Vetted, and when" is the whole of what a school needs.
    expect(Object.keys(row ?? {}).sort()).toEqual(['staff_id', 'vetted_on'])
    expect(row.vetted_on).not.toBeNull()
  })
})

describe('it answers about your own staff and nobody else', () => {
  test('an admin at another school learns nothing about them', async () => {
    // Otherwise this is a way to ask "is this person a vetted specialist?"
    // about anybody on the platform — a directory of practitioners that
    // nobody agreed to publish.
    const other = await makeActor(
      'parent',
      world.runId,
      'otherschooladmin',
      world.otherSchoolId,
      true,
      'school_admin',
    )

    const { data } = await other.db.rpc('my_staff_vetting')
    const ids = (data ?? []).map((row: { staff_id: string }) => row.staff_id)

    expect(ids).not.toContain(vetted.id)
    await other.db.auth.signOut()
    await admin.auth.admin.deleteUser(other.id)
  }, 60_000)

  test('a parent gets nothing at all', async () => {
    const { data } = await world.guardianOfA.db.rpc('my_staff_vetting')
    expect(data ?? []).toHaveLength(0)
  })

  test('an educator at the school sees the same labels their admin does', async () => {
    // Not a leak: they already see these colleagues in the directory, and
    // knowing who checked the specialist writing clinical notes about their
    // student is the point.
    const { data } = await world.verifiedEducator.db.rpc('my_staff_vetting')
    const ids = (data ?? []).map((row: { staff_id: string }) => row.staff_id)

    expect(ids).toContain(vetted.id)
  })
})

describe('vetting follows the person, not the application', () => {
  test('a later decline does not un-vet somebody already engaged', async () => {
    // db/047 keeps `approved_at` when a status moves on, so a school that
    // engaged them in April is not retroactively told nobody checked.
    await admin
      .from('specialist_applications')
      .update({ status: 'declined', review_note: 'Registration lapsed since.' })
      .eq('email', vetted.email)

    const { data } = await world.schoolAdmin.db.rpc('my_staff_vetting')
    const ids = (data ?? []).map((row: { staff_id: string }) => row.staff_id)

    expect(ids).toContain(vetted.id)
  })
})
