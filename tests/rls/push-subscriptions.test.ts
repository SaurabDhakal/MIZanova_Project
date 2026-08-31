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
 * db/081 — a device's address belongs to one person and to nobody else.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS TESTED ROLE BY ROLE RATHER THAN ONCE
 * ---------------------------------------------------------------------------
 * The screen that turns notifications on is at /account/profile, which every
 * role reaches — `allow={[...ROLES]}` — so a parent, a teacher, a specialist,
 * a school administrator, a platform administrator and a student all meet the
 * same switch. A
 * policy that happened to work for the account it was written against would
 * leave the rest of them with a control that silently does nothing, and this
 * project has shipped exactly that before.
 *
 * All six are exercised, including the student — the newest role, and the one
 * most likely to have been forgotten by a policy written before db/074.
 *
 * ---------------------------------------------------------------------------
 * AN ENDPOINT IS A CAPABILITY, NOT A PREFERENCE
 * ---------------------------------------------------------------------------
 * Anyone holding a push endpoint and the VAPID private key can put a
 * notification on that person's screen. So the interesting assertions here are
 * the ones about NOT reading somebody else's — including the platform
 * administrator, who reads almost everything else in this product and is
 * deliberately shut out of this. The server sends with the service key, which
 * bypasses RLS by design; nothing else needs to see these rows at all.
 */

let world: World

/*
 * Built here rather than taken from the shared world, which does not carry
 * them. An earlier version of this file tested four roles and argued the other
 * two followed "by construction" — true, since every policy on the table is
 * `profile_id = auth.uid()` with no role condition, but an argument is not a
 * test and the switch is on a screen all six of them reach.
 *
 * The student is made as a parent and promoted, the way db/074 requires: a
 * child does not sign themselves up.
 */
let specialist: Actor
let student: Actor

/* Endpoints are unique, so every row needs its own. Shaped like the real thing
   — a push service URL — because a test that inserts 'x' proves nothing about
   a column that will hold 300 characters of opaque token. */
const endpointFor = (who: string) =>
  `https://fcm.googleapis.com/fcm/send/${who}-${Math.random().toString(36).slice(2)}`

beforeAll(async () => {
  world = await buildWorld()

  specialist = await makeActor(
    'specialist',
    world.runId,
    'push-spec',
    world.schoolId,
    true,
  )
  student = await makeActor(
    'parent',
    world.runId,
    'push-pupil',
    world.schoolId,
    true,
    'student',
  )
}, 90_000)

afterAll(async () => {
  if (world) {
    await admin
      .from('push_subscriptions')
      .delete()
      .in('profile_id', [
        world.guardianOfA.id,
        world.verifiedEducator.id,
        world.schoolAdmin.id,
        world.platformAdmin.id,
        specialist.id,
        student.id,
      ])
    await destroyWorld(world)
  }
}, 60_000)

/** All six roles that meet the switch, and the id each should be tied to. */
function everyone() {
  return [
    ['a parent', world.guardianOfA],
    ['a teacher', world.verifiedEducator],
    ['a specialist', specialist],
    ['a school administrator', world.schoolAdmin],
    ['a platform administrator', world.platformAdmin],
    ['a student', student],
  ] as const
}

describe('every role can register their own device', () => {
  test('each of the six can subscribe and read it back', async () => {
    for (const [label, actor] of everyone()) {
      const endpoint = endpointFor(label.replace(/\s/g, '-'))

      const { data, error } = await actor.db
        .from('push_subscriptions')
        .insert({
          profile_id: actor.id,
          endpoint,
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-secret',
          user_agent: `test agent for ${label}`,
        })
        .select('id')

      expect(error, `${label} could not subscribe`).toBeNull()
      expect(data, `${label} got no row back`).toHaveLength(1)

      const { data: back } = await actor.db
        .from('push_subscriptions')
        .select('endpoint')
        .eq('endpoint', endpoint)

      expect(back, `${label} could not read their own`).toHaveLength(1)
    }
  })

  test('and none of them can register a device against somebody else', async () => {
    // The server writes subscriptions with the service key precisely so the
    // browser never names the profile. This is the second lock behind that.
    for (const [label, actor] of everyone()) {
      const { error } = await actor.db.from('push_subscriptions').insert({
        profile_id: world.guardianOfB.id,
        endpoint: endpointFor('stolen'),
        p256dh: 'test-p256dh-key',
        auth: 'test-auth-secret',
      })

      expect(error, `${label} was allowed to subscribe as someone else`).not.toBeNull()
    }
  })
})

describe('a device address is not readable by anyone else', () => {
  test('nobody sees another person’s subscription — not even the platform admin', async () => {
    const endpoint = endpointFor('parent-private')
    const { error: seedError } = await admin.from('push_subscriptions').insert({
      profile_id: world.guardianOfA.id,
      endpoint,
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-secret',
    })
    expect(seedError).toBeNull()

    for (const [label, actor] of everyone()) {
      if (actor.id === world.guardianOfA.id) continue

      const { data } = await actor.db
        .from('push_subscriptions')
        .select('endpoint')
        .eq('endpoint', endpoint)

      expect(data ?? [], `${label} could see somebody else's device`).toEqual([])
    }
  })

  test('and cannot delete one either', async () => {
    const endpoint = endpointFor('parent-undeletable')
    await admin.from('push_subscriptions').insert({
      profile_id: world.guardianOfA.id,
      endpoint,
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-secret',
    })

    // Knowing an endpoint must not be enough to switch somebody's
    // notifications off — which is why the unsubscribe endpoint scopes its
    // delete by profile_id as well as by endpoint.
    await world.schoolAdmin.db
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)

    const { count } = await admin
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('endpoint', endpoint)

    expect(count).toBe(1)
  })
})

describe('turning it off works from the device you are holding', () => {
  test('each role can delete their own', async () => {
    for (const [label, actor] of everyone()) {
      const endpoint = endpointFor('to-remove')
      await admin.from('push_subscriptions').insert({
        profile_id: actor.id,
        endpoint,
        p256dh: 'test-p256dh-key',
        auth: 'test-auth-secret',
      })

      const { data } = await actor.db
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint)
        .select('id')

      expect(data, `${label} could not remove their own device`).toHaveLength(1)
    }
  })
})

describe('there is no update policy, deliberately', () => {
  test('a subscription cannot be edited, only replaced', async () => {
    const endpoint = endpointFor('immutable')
    await admin.from('push_subscriptions').insert({
      profile_id: world.guardianOfA.id,
      endpoint,
      p256dh: 'original-key',
      auth: 'test-auth-secret',
    })

    await world.guardianOfA.db
      .from('push_subscriptions')
      .update({ p256dh: 'rewritten-key' })
      .eq('endpoint', endpoint)

    const { data } = await admin
      .from('push_subscriptions')
      .select('p256dh')
      .eq('endpoint', endpoint)
      .single()

    /* db/081 omits an update policy on purpose: a browser that re-subscribes
       produces fresh keys against the same endpoint and the server upserts it.
       Nothing should be editing these in place, so the absence is asserted
       rather than left to be noticed. */
    expect(data?.p256dh).toBe('original-key')
  })
})
