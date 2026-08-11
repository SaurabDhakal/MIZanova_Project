import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * The merged student timeline (db/056).
 *
 * THE WHOLE VIEW IS AN ACCESS-CONTROL CLAIM. It unions five tables that each
 * have different, carefully-written policies, and it re-states none of them —
 * `security_invoker = true` is supposed to make every row arrive already
 * filtered by the table it came from.
 *
 * That claim is exactly the kind that looks true and is not. db/055 was written
 * because the previous view in this product shipped without `security_invoker`,
 * granted itself to `authenticated`, and let a guardian read another school's
 * support hours — while a test asserting the underlying TABLE was protected
 * passed the entire time. It was knocking on the wrong door.
 *
 * So these tests query the VIEW, as each role, and check that what comes back
 * matches what that role could have selected from the tables by hand.
 */

let world: World

beforeAll(async () => {
  world = await buildWorld()
}, 60_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 60_000)

async function timelineFor(actor: World['guardianOfA'], studentId: string) {
  const { data, error } = await actor.db
    .from('student_timeline')
    .select('kind, source_id, occurred_at, detail, is_flagged, shared_with_parents')
    .eq('student_id', studentId)
    .order('occurred_at', { ascending: false })
  return { rows: data ?? [], error }
}

describe('the view inherits every policy rather than restating them', () => {
  test('a parent sees a behaviour log only once it is shared', async () => {
    // buildWorld leaves privateLogId unshared.
    const before = await timelineFor(world.guardianOfA, world.childA)
    expect(before.rows.some((r) => r.source_id === world.privateLogId)).toBe(false)

    await admin
      .from('behaviour_logs')
      .update({ shared_with_parents: true })
      .eq('id', world.privateLogId)

    const after = await timelineFor(world.guardianOfA, world.childA)
    expect(after.rows.some((r) => r.source_id === world.privateLogId)).toBe(true)

    // Put it back, so the rest of the suite sees the world it expects.
    await admin
      .from('behaviour_logs')
      .update({ shared_with_parents: false })
      .eq('id', world.privateLogId)
  })

  test('the teacher sees that same log the whole time', async () => {
    const { rows } = await timelineFor(world.verifiedEducator, world.childA)
    expect(rows.some((r) => r.source_id === world.privateLogId)).toBe(true)
  })

  test("a guardian gets nothing for another family's child", async () => {
    const { rows } = await timelineFor(world.guardianOfA, world.childB)
    expect(rows).toEqual([])
  })

  test('an unverified educator gets nothing, as on every other screen', async () => {
    const { rows } = await timelineFor(world.unverifiedEducator, world.childA)
    expect(rows).toEqual([])
  })
})

describe('what the stream actually contains', () => {
  test('home observations and behaviour arrive in one list, newest first', async () => {
    await admin.from('home_observations').insert({
      student_id: world.childA,
      logged_by: world.guardianOfA.id,
      title: 'Slept badly',
      body: 'Awake from 4am, very tired at breakfast.',
      observed_on: new Date().toISOString().slice(0, 10),
    })

    const { rows } = await timelineFor(world.verifiedEducator, world.childA)

    const kinds = new Set(rows.map((r) => r.kind))
    expect(kinds.has('behaviour')).toBe(true)
    expect(kinds.has('home')).toBe(true)

    // The ordering is the entire point of merging them.
    const times = rows.map((r) => new Date(r.occurred_at).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  test('a milestone tick appears as its own moment', async () => {
    const { data: goal } = await admin
      .from('goals')
      .insert({
        student_id: world.childA,
        title: 'Join the group',
        description: 'Sit with the group for four minutes with one prompt.',
      })
      .select('id')
      .single()

    const { data: milestone } = await admin
      .from('goal_milestones')
      .insert({ goal_id: goal!.id, title: 'Sat for two minutes' })
      .select('id')
      .single()

    await admin
      .from('goal_milestones')
      .update({
        is_done: true,
        done_at: new Date().toISOString(),
        done_by: world.verifiedEducator.id,
      })
      .eq('id', milestone!.id)

    const { rows } = await timelineFor(world.verifiedEducator, world.childA)
    const tick = rows.find((r) => r.source_id === milestone!.id)

    expect(tick?.kind).toBe('milestone')
  })

  test('an unticked milestone is not an event, because nothing happened', async () => {
    const { data: goal } = await admin
      .from('goals')
      .insert({
        student_id: world.childA,
        title: 'Not started',
        description: 'A goal whose steps have not been ticked.',
      })
      .select('id')
      .single()

    const { data: milestone } = await admin
      .from('goal_milestones')
      .insert({ goal_id: goal!.id, title: 'Never done' })
      .select('id')
      .single()

    const { rows } = await timelineFor(world.verifiedEducator, world.childA)
    expect(rows.some((r) => r.source_id === milestone!.id)).toBe(false)
  })

  test('a draft plan is not in the family’s timeline; an agreed one is', async () => {
    const { data: plan } = await admin
      .from('iep_plans')
      .insert({ student_id: world.childA, baseline: 'Where we are starting.' })
      .select('id')
      .single()

    const draft = await timelineFor(world.guardianOfA, world.childA)
    expect(draft.rows.some((r) => r.source_id === plan!.id)).toBe(false)

    await admin.from('iep_plans').update({ status: 'agreed' }).eq('id', plan!.id)

    const agreed = await timelineFor(world.guardianOfA, world.childA)
    expect(agreed.rows.some((r) => r.source_id === plan!.id)).toBe(true)

    await admin.from('iep_plans').delete().eq('id', plan!.id)
  })
})

describe('rows do not claim things that cannot be true of them', () => {
  test('a home observation is not "not flagged" — flagging does not apply', async () => {
    const { rows } = await timelineFor(world.verifiedEducator, world.childA)
    const home = rows.find((r) => r.kind === 'home')

    // null, not false. A screen rendering "not flagged" against a parent's note
    // would be describing a concept that does not exist for that row.
    expect(home?.is_flagged).toBeNull()
  })

  test('a behaviour log does answer the flag question', async () => {
    const { rows } = await timelineFor(world.verifiedEducator, world.childA)
    const behaviour = rows.find((r) => r.kind === 'behaviour')

    expect(typeof behaviour?.is_flagged).toBe('boolean')
  })
})
