import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  admin,
  buildSpecialistWorld,
  destroyWorld,
  type SpecialistWorld,
} from '../helpers/world'

/**
 * db/115 — a family may ask their child's specialist for a time, and may ask
 * for nothing else.
 *
 * THE GRANT IS ONE LINE AND THE REFUSALS ARE THE POINT. A guardian writing
 * directly to `specialist_appointments` could otherwise confirm their own
 * booking, put a clinician they have never met into their child's diary, or
 * write a row against somebody else's child — the table has carried a
 * specialist-only insert policy since db/059 precisely because it is a
 * clinician's working day.
 *
 * The last test is the one that would have shipped broken. Both overlap
 * constraints in db/059 apply to `status = 'scheduled'`, so a request reserves
 * nothing on purpose and several families may ask for the same half hour. But
 * `free_slots` excluded appointments with `status <> 'cancelled'` — a negative
 * list written when 'cancelled' was the only status that did not occupy the
 * diary. Left alone, one unanswered request would have removed a slot from the
 * calendar it was asked from, and a family could have emptied a specialist's
 * availability for everybody else by asking for everything.
 */

let world: SpecialistWorld
let slot: string

beforeAll(async () => {
  world = await buildSpecialistWorld()

  // A working day for the specialist, on a weekday a fortnight out so the
  // window `free_slots` looks at always contains it.
  const day = new Date(Date.now() + 14 * 86_400_000)
  const { error: availabilityError } = await admin
    .from('specialist_availability')
    .insert({
      specialist_id: world.specialist.id,
      weekday: day.getDay(),
      starts_at: '09:00',
      ends_at: '15:00',
    })
  if (availabilityError) throw new Error(availabilityError.message)

  const { data: slots, error: slotsError } = await admin.rpc('free_slots', {
    p_specialist: world.specialist.id,
    p_from: new Date().toISOString().slice(0, 10),
    p_to: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
    p_minutes: 45,
  })
  if (slotsError) throw new Error(slotsError.message)
  slot = (slots as { slot: string }[])[0].slot
}, 180_000)

afterAll(async () => {
  if (world) {
    await admin
      .from('specialist_appointments')
      .delete()
      .eq('specialist_id', world.specialist.id)
    await admin
      .from('specialist_availability')
      .delete()
      .eq('specialist_id', world.specialist.id)
    await destroyWorld(world)
  }
}, 120_000)

const ask = (status: string, studentId: string, specialistId: string, when: string) => ({
  student_id: studentId,
  specialist_id: specialistId,
  starts_at: when,
  duration_minutes: 45,
  ends_at: new Date(new Date(when).getTime() + 45 * 60_000).toISOString(),
  status,
  purpose: 'Mornings have been hard.',
})

describe('a family can ask their own child’s specialist for a time', () => {
  test('and the request is written', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('specialist_appointments')
      .insert(ask('requested', world.childA, world.specialist.id, slot))
      .select('id, status')

    expect(error).toBeNull()
    expect(data?.[0]?.status).toBe('requested')
  })

  test('but cannot write themselves a confirmed booking', async () => {
    const later = new Date(new Date(slot).getTime() + 3 * 3_600_000).toISOString()
    const { error } = await world.guardianOfA.db
      .from('specialist_appointments')
      .insert(ask('scheduled', world.childA, world.specialist.id, later))

    expect(error).not.toBeNull()
  })

  test('nor book a specialist the school has not verified', async () => {
    /*
     * THIS TEST FOUND THE BUG IT NOW GUARDS. The migration's header claimed it
     * checked verification and the policy did not — and `buildSpecialistWorld`
     * puts the unverified specialist ON ChildA's caseload, so the assertion
     * would have passed for the wrong reason if it had been written as "not on
     * the caseload". A specialist cannot create their own appointment while
     * unverified (db/059); a family must not be able to create one for them.
     */
    const later = new Date(new Date(slot).getTime() + 4 * 3_600_000).toISOString()
    const { error } = await world.guardianOfA.db
      .from('specialist_appointments')
      .insert(
        ask('requested', world.childA, world.unverifiedSpecialist.id, later),
      )

    expect(error).not.toBeNull()
  })

  test('nor book their child’s class teacher as though they were one', async () => {
    // On the caseload, and verified — but `assignment` is 'class_teacher' and
    // the role is 'educator'. P05 says assigned SPECIALISTS.
    const later = new Date(new Date(slot).getTime() + 6 * 3_600_000).toISOString()
    const { error } = await world.guardianOfA.db
      .from('specialist_appointments')
      .insert(ask('requested', world.childA, world.verifiedEducator.id, later))

    expect(error).not.toBeNull()
  })

  test('nor ask on behalf of another family’s child', async () => {
    const later = new Date(new Date(slot).getTime() + 5 * 3_600_000).toISOString()
    const { error } = await world.guardianOfA.db
      .from('specialist_appointments')
      .insert(ask('requested', world.childB, world.specialist.id, later))

    expect(error).not.toBeNull()
  })

  test('nor confirm the request they made', async () => {
    /*
     * REFUSED LOUDLY, WHICH IS BETTER THAN THE USUAL CASE. This was written
     * expecting the ordinary RLS shape — an update filtered to zero rows,
     * returning success and changing nothing, the trap `assertChanged` exists
     * for. It raises instead, because db/115's withdraw policy pins the
     * DESTINATION in its `with check`: 'cancelled' and nothing else. An update
     * to 'scheduled' is therefore a row the policy rejects rather than a row
     * it cannot see, and Postgres says so.
     *
     * The row is read back anyway. An error is a claim about what did not
     * happen, and the only proof is the status that is still there.
     */
    const { error } = await world.guardianOfA.db
      .from('specialist_appointments')
      .update({ status: 'scheduled' })
      .eq('student_id', world.childA)
      .eq('status', 'requested')

    expect(error).not.toBeNull()

    const { data: after } = await admin
      .from('specialist_appointments')
      .select('status')
      .eq('student_id', world.childA)
      .eq('starts_at', slot)
      .single()
    expect(after?.status).toBe('requested')
  })

  test('and may take back a request nobody has answered', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('specialist_appointments')
      .update({ status: 'cancelled' })
      .eq('student_id', world.childA)
      .eq('starts_at', slot)
      .select('id')

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(1)
  })
})

describe('a request reserves nothing until it is agreed', () => {
  test('the slot stays on offer while it is only requested, and goes when it is not', async () => {
    const countFree = async () => {
      const { data, error } = await admin.rpc('free_slots', {
        p_specialist: world.specialist.id,
        p_from: new Date().toISOString().slice(0, 10),
        p_to: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
        p_minutes: 45,
      })
      if (error) throw new Error(error.message)
      return (data as unknown[]).length
    }

    const before = await countFree()

    const { data: requested, error: askError } = await world.guardianOfA.db
      .from('specialist_appointments')
      .insert(ask('requested', world.childA, world.specialist.id, slot))
      .select('id')
    expect(askError).toBeNull()

    // THE ASSERTION THIS FILE EXISTS FOR.
    expect(await countFree()).toBe(before)

    const { error: agreeError } = await world.specialist.db
      .from('specialist_appointments')
      .update({ status: 'scheduled' })
      .eq('id', requested![0].id)
    expect(agreeError).toBeNull()

    expect(await countFree()).toBe(before - 1)
  })
})
