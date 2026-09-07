import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * db/113 — a guardian reads the advice attached to an incident they were told
 * about, and nothing else.
 *
 * THE GAP THIS CLOSES was measurable rather than theoretical. On the shared
 * database, 136 behaviour logs had been shared with parents and 86 of them
 * carried AI strategies no guardian could read: `ai_strategies` had two select
 * policies, both about staff. The teacher shared the incident and the database
 * kept the advice.
 *
 * THE THREE BOUNDARIES BELOW MATTER MORE THAN THE GRANT. A strategy carries
 * its own `student_id`, denormalised from the log, so a policy written only
 * against that column would read correctly and leak badly: it would hand a
 * family the suggestions attached to every incident about their child,
 * including the ones a teacher chose not to share. "Try a visual timer before
 * transitions" tells you there was a transition that went badly. The advice
 * discloses the incident, so it must not travel further than the incident did.
 */

let world: World
/** A log about ChildA the teacher DID share, carrying settled advice. */
let sharedLogId: string
/** Shared, but its advice is still waiting for a specialist. */
let heldLogId: string
/** Shared, and about somebody else's child. */
let otherChildLogId: string

async function logWithStrategy(
  world: World,
  studentId: string,
  shared: boolean,
  status: 'published' | 'pending_review',
  title: string,
): Promise<string> {
  const { data: log, error: logError } = await admin
    .from('behaviour_logs')
    .insert({
      student_id: studentId,
      logged_by: world.verifiedEducator.id,
      behaviour_type: 'disruptive',
      intensity: 'medium',
      notes: 'Left the room during the transition to maths.',
      shared_with_parents: shared,
    })
    .select('id')
    .single()
  if (logError) throw new Error(logError.message)

  const { error: strategyError } = await admin.from('ai_strategies').insert({
    behaviour_log_id: log.id,
    student_id: studentId,
    title,
    body: 'Give a two-minute warning before the change of activity.',
    confidence: 0.9,
    status,
    anonymised_input: 'A student left the room during a transition.',
  })
  if (strategyError) throw new Error(strategyError.message)

  return log.id
}

beforeAll(async () => {
  world = await buildWorld()

  sharedLogId = await logWithStrategy(
    world,
    world.childA,
    true,
    'published',
    'Warn before transitions',
  )
  heldLogId = await logWithStrategy(
    world,
    world.childA,
    true,
    'pending_review',
    'Held for a specialist',
  )
  otherChildLogId = await logWithStrategy(
    world,
    world.childB,
    true,
    'published',
    'About another family',
  )

  // The world's own private log gets advice too, so the unshared case is
  // tested against a log that was never meant to leave the classroom.
  const { error } = await admin.from('ai_strategies').insert({
    behaviour_log_id: world.privateLogId,
    student_id: world.childA,
    title: 'Advice on an incident nobody was told about',
    body: 'Seat them nearer the door for the first week.',
    confidence: 0.95,
    status: 'published',
    anonymised_input: 'A student was disruptive during quiet reading.',
  })
  if (error) throw new Error(error.message)
}, 120_000)

afterAll(async () => {
  if (world) {
    // Strategies cascade from their log, and the private log belongs to the
    // world, so only the three created here need removing by hand.
    await admin
      .from('behaviour_logs')
      .delete()
      .in('id', [sharedLogId, heldLogId, otherChildLogId].filter(Boolean))
    await destroyWorld(world)
  }
}, 120_000)

describe('the advice goes home with the incident', () => {
  test('a guardian reads a settled strategy on a log that was shared', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('ai_strategies')
      .select('id, title, behaviour_log_id')

    expect(error).toBeNull()
    const titles = (data ?? []).map((s) => s.title)
    expect(titles).toContain('Warn before transitions')
  })

  test('and nothing attached to a log the teacher did not share', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('ai_strategies')
      .select('id, title')
      .eq('behaviour_log_id', world.privateLogId)

    expect(error).toBeNull()
    // The sharp end: this strategy is about their own child, and carries the
    // child's id on its own row. Only the log's sharing flag keeps it back.
    expect(data ?? []).toHaveLength(0)
  })

  test('nor one still waiting for a specialist to look at it', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('ai_strategies')
      .select('id, title')
      .eq('behaviour_log_id', heldLogId)

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  test('nor anything about another family’s child', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('ai_strategies')
      .select('id, title')
      .eq('behaviour_log_id', otherChildLogId)

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  test('a guardian cannot release a held strategy to themselves', async () => {
    // Read is the whole grant. The review queue stays a specialist's, and an
    // update that RLS filters out returns success with zero rows changed —
    // so the refusal is proved by re-reading as somebody who can see it.
    const { error } = await world.guardianOfA.db
      .from('ai_strategies')
      .update({ status: 'published' })
      .eq('behaviour_log_id', heldLogId)

    expect(error).toBeNull()

    const { data: after } = await admin
      .from('ai_strategies')
      .select('status')
      .eq('behaviour_log_id', heldLogId)
      .single()
    expect(after?.status).toBe('pending_review')
  })
})
