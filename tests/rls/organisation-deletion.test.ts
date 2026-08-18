import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * db/060 — an organisation may only be deleted when nothing belongs to it.
 *
 * FOUR OF THESE ARE NEGATIVE TESTS, because a delete guard is only proved by
 * what it stops. The positive case — an empty organisation goes — would pass
 * just as happily with no guard at all.
 *
 * The one that matters most is the last. A school administrator's delete is
 * refused by RLS, and an RLS refusal is NOT an error: PostgREST returns success
 * having changed nothing. Without asserting on the returned rows, a policy that
 * had been dropped would look exactly like one that is working.
 */

let world: World

/*
 * A fresh organisation per test, never one shared between them. The first
 * draft used a single spare, and when the guard was missing the test that
 * expected a REFUSAL deleted it — so the next test failed reporting "already
 * gone" and said nothing about the thing it was checking. One broken guard
 * should produce one clear failure, not a cascade that hides its own cause.
 */
async function spareOrganisation(label: string): Promise<string> {
  const { data, error } = await admin
    .from('schools')
    .insert({ name: `RLS Spare ${label} ${world.runId}` })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

async function discard(id: string): Promise<void> {
  await admin.from('memberships').delete().eq('organisation_id', id)
  await admin.from('schools').delete().eq('id', id)
}

beforeAll(async () => {
  world = await buildWorld()
}, 120_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 120_000)

describe('db/060 — deleting an organisation', () => {
  test('a school with students and staff cannot be deleted at all', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('schools')
      .delete()
      .eq('id', world.schoolId)
      .select('id')

    // `students.school_id` and `profiles.school_id` are on delete restrict, so
    // this is a real database error rather than a quiet no-op.
    expect(error).not.toBeNull()
    expect(data).toBeNull()

    const { data: still } = await admin
      .from('schools')
      .select('id')
      .eq('id', world.schoolId)
    expect(still).toHaveLength(1)
  })

  test('a live membership blocks it, even with nothing else attached', async () => {
    const id = await spareOrganisation('live')
    try {
      const { error: insertError } = await admin.from('memberships').insert({
        profile_id: world.verifiedEducator.id,
        organisation_id: id,
        role: 'educator',
      })
      expect(insertError).toBeNull()

      const { error } = await world.platformAdmin.db
        .from('schools')
        .delete()
        .eq('id', id)
        .select('id')

      // Nothing else points at this row: no students, no profiles, no
      // invoices. Only db/060's trigger stands between this and a membership
      // cascading away with no record that it ever existed.
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/membership/i)

      const { data: survived } = await admin
        .from('schools')
        .select('id')
        .eq('id', id)
      expect(survived).toHaveLength(1)
    } finally {
      await discard(id)
    }
  })

  test('a membership that has ENDED does not block it', async () => {
    const id = await spareOrganisation('ended')

    await admin.from('memberships').insert({
      profile_id: world.verifiedEducator.id,
      organisation_id: id,
      role: 'educator',
      ended_at: new Date().toISOString(),
    })

    const { data, error } = await world.platformAdmin.db
      .from('schools')
      .delete()
      .eq('id', id)
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    const { data: gone } = await admin.from('schools').select('id').eq('id', id)
    expect(gone).toHaveLength(0)
  })

  test('a school administrator deleting one is refused, and told nothing', async () => {
    const id = await spareOrganisation('rls')
    try {
      const { data, error } = await world.schoolAdmin.db
        .from('schools')
        .delete()
        .eq('id', id)
        .select('id')

      // THE WHOLE POINT. No error — RLS filtered the row out, so this reads as
      // a success that changed nothing, which is why every policy-dependent
      // mutation in src/lib/api.ts goes through assertChanged().
      expect(error).toBeNull()
      expect(data).toHaveLength(0)

      const { data: survived } = await admin
        .from('schools')
        .select('id')
        .eq('id', id)
      expect(survived).toHaveLength(1)
    } finally {
      await discard(id)
    }
  })

  test('organisation_deletability counts what is in the way', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('organisation_deletability')
      .select('id, students, people, memberships')
      .eq('id', world.schoolId)
      .single()

    expect(error).toBeNull()
    expect(data!.students).toBeGreaterThan(0)
    expect(data!.people).toBeGreaterThan(0)
  })
})
