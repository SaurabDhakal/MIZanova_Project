import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  admin,
  buildSpecialistWorld,
  destroyWorld,
  type SpecialistWorld,
} from '../helpers/world'

/**
 * db/117 — FR24's parent half: "request specialist progress reviews".
 *
 * The grant is one insert. What the tests are for is everything a family must
 * NOT be able to do with a row they are allowed to create: write it already
 * answered, answer it themselves afterwards, or open a second one and turn a
 * specialist's queue into a list of the same question.
 */

let world: SpecialistWorld
let goalId: string

beforeAll(async () => {
  world = await buildSpecialistWorld()

  const { data: goal, error } = await admin
    .from('goals')
    .insert({
      student_id: world.childA,
      title: 'Join group work for a full session',
      description: 'Will stay with the group for a whole session, with a warning before transitions.',
      category: 'social_communication',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  goalId = goal.id
}, 180_000)

afterAll(async () => {
  if (world) {
    await admin.from('goal_review_requests').delete().eq('student_id', world.childA)
    await admin.from('goals').delete().eq('id', goalId)
    await destroyWorld(world)
  }
}, 120_000)

const ask = (studentId: string, status = 'open') => ({
  goal_id: goalId,
  student_id: studentId,
  requested_by: undefined as unknown as string,
  note: 'It has been at the same point since term 3.',
  status,
})

describe('a family can ask for a second look', () => {
  test('and the request is written, open', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('goal_review_requests')
      .insert({ ...ask(world.childA), requested_by: world.guardianOfA.id })
      .select('id, status')

    expect(error).toBeNull()
    expect(data?.[0]?.status).toBe('open')
  })

  test('but not twice on the same goal while one is open', async () => {
    // db/117's partial unique index. Without it, one anxious evening becomes
    // nine identical rows and a specialist learns to skim the queue.
    const { error } = await world.guardianOfA.db
      .from('goal_review_requests')
      .insert({ ...ask(world.childA), requested_by: world.guardianOfA.id })

    expect(error).not.toBeNull()
    expect(error?.code).toBe('23505')
  })

  test('nor already answered, with a response they wrote themselves', async () => {
    const { error } = await world.guardianOfA.db
      .from('goal_review_requests')
      .insert({
        ...ask(world.childA, 'answered'),
        requested_by: world.guardianOfA.id,
        response: 'A specialist definitely said this was fine.',
      })

    expect(error).not.toBeNull()
  })

  test('nor about another family’s child', async () => {
    const { error } = await world.guardianOfA.db
      .from('goal_review_requests')
      .insert({ ...ask(world.childB), requested_by: world.guardianOfA.id })

    expect(error).not.toBeNull()
  })

  test('nor answer the question they asked', async () => {
    const { error } = await world.guardianOfA.db
      .from('goal_review_requests')
      .update({
        status: 'answered',
        answered_by: world.guardianOfA.id,
        answered_at: new Date().toISOString(),
        response: 'All fine.',
      })
      .eq('student_id', world.childA)

    // Refused rather than silently filtered: the `with check` pins the
    // destination, so this is a row the policy rejects.
    expect(error).not.toBeNull()

    const { data: after } = await admin
      .from('goal_review_requests')
      .select('status')
      .eq('student_id', world.childA)
      .single()
    expect(after?.status).toBe('open')
  })
})

describe('the specialist assigned to the child answers it', () => {
  test('sees it in their queue', async () => {
    const { data, error } = await world.specialist.db
      .from('goal_review_requests')
      .select('id, note')
      .eq('status', 'open')

    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  test('and an unverified specialist on the same caseload cannot answer', async () => {
    // db/059 makes verification the line for writing about a child's care.
    // Reading is not the same permission as answering.
    const { data: before } = await admin
      .from('goal_review_requests')
      .select('id')
      .eq('student_id', world.childA)
      .eq('status', 'open')
      .single()

    const { error } = await world.unverifiedSpecialist.db
      .from('goal_review_requests')
      .update({
        status: 'answered',
        answered_by: world.unverifiedSpecialist.id,
        answered_at: new Date().toISOString(),
        response: 'Looks fine to me.',
      })
      .eq('id', before!.id)

    expect(error).not.toBeNull()
  })

  test('the verified one can, and the family may then ask again', async () => {
    const { data: open } = await admin
      .from('goal_review_requests')
      .select('id')
      .eq('student_id', world.childA)
      .eq('status', 'open')
      .single()

    const { data, error } = await world.specialist.db
      .from('goal_review_requests')
      .update({
        status: 'answered',
        answered_by: world.specialist.id,
        answered_at: new Date().toISOString(),
        response: 'I will watch this in Thursday’s session.',
      })
      .eq('id', open!.id)
      .select('id')

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(1)

    // The index is partial, so a closed question does not block a new one.
    const { error: againError } = await world.guardianOfA.db
      .from('goal_review_requests')
      .insert({ ...ask(world.childA), requested_by: world.guardianOfA.id })
    expect(againError).toBeNull()
  })
})
