import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  admin,
  buildSpecialistWorld,
  makeActor,
  type Actor,
  type SpecialistWorld,
} from '../helpers/world'

/**
 * db/112 — a specialist can name the person who booked them.
 *
 * THE BOUNDARY IS THE POINT, NOT THE ACCESS. Every other select policy on
 * `profiles` is built around a school, and this is the first one that admits
 * somebody from outside one. So what matters is not that a booked specialist
 * can read a name — it is that nothing else moved: an individual who has not
 * booked them stays invisible, and the access ends when the booking does.
 */

let world: SpecialistWorld
let individual: Actor
let stranger: Actor
let bookingId: string | null = null

beforeAll(async () => {
  world = await buildSpecialistWorld()
  individual = await makeActor('parent', world.runId, 'booked-ind', null, false, 'individual')
  stranger = await makeActor('parent', world.runId, 'unbooked-ind', null, false, 'individual')

  const start = new Date(Date.now() + 3 * 24 * 3600 * 1000)
  const { data } = await admin
    .from('individual_bookings')
    .insert({
      profile_id: individual.id,
      specialist_id: world.specialist.id,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 45 * 60000).toISOString(),
      duration_minutes: 45,
      status: 'accepted',
    })
    .select('id')
    .single()
  bookingId = data?.id ?? null
}, 90_000)

afterAll(async () => {
  if (bookingId) await admin.from('individual_bookings').delete().eq('id', bookingId)
  for (const id of [individual?.id, stranger?.id].filter(Boolean)) {
    await admin.auth.admin.deleteUser(id as string)
  }
}, 90_000)

describe('a specialist can name who they have agreed to meet', () => {
  test('the person who booked them is readable', async () => {
    const { data } = await world.specialist.db
      .from('profiles')
      .select('id, full_name')
      .eq('id', individual.id)

    expect(data ?? []).toHaveLength(1)
  })

  test('an individual who has not booked them is not', async () => {
    // The whole policy in one assertion: it is scoped to a booking, not to
    // "specialists may read individuals".
    const { data } = await world.specialist.db
      .from('profiles')
      .select('id')
      .eq('id', stranger.id)

    expect(data ?? []).toHaveLength(0)
  })

  test('a different specialist cannot read them either', async () => {
    const { data } = await world.otherSpecialist.db
      .from('profiles')
      .select('id')
      .eq('id', individual.id)

    expect(data ?? []).toHaveLength(0)
  })

  test('the access ends when the booking does', async () => {
    await admin
      .from('individual_bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId!)

    const { data } = await world.specialist.db
      .from('profiles')
      .select('id')
      .eq('id', individual.id)

    expect(data ?? []).toHaveLength(0)

    await admin
      .from('individual_bookings')
      .update({ status: 'accepted' })
      .eq('id', bookingId!)
  })

  test('and the individual gains nothing over the specialist in return', async () => {
    /* The policy is one-directional. An individual already meets a specialist
       through `bookable_specialists`, which is a directory of people who chose
       to publish hours — this must not have widened into reading their row. */
    const { data } = await individual.db
      .from('profiles')
      .select('id')
      .eq('id', world.otherSpecialist.id)

    expect(data ?? []).toHaveLength(0)
  })
})
