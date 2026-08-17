import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  admin,
  buildSpecialistWorld,
  destroyWorld,
  type SpecialistWorld,
} from '../helpers/world'
import { PUBLISHABLE_KEY, SUPABASE_URL } from '../helpers/env'

/**
 * db/059 — booking an appointment.
 *
 * TWO KINDS OF PROMISE ARE UNDER TEST HERE, and they fail in different ways.
 *
 * The policies decide who may see and change a booking, and a broken one is
 * silent: an UPDATE filtered out by RLS returns success having changed nothing,
 * so every assertion below reads back with the service key rather than trusting
 * the absence of an error.
 *
 * The exclusion constraints decide whether two things can occupy one slot, and
 * a broken one is worse than silent — it looks like a feature working. Booking
 * is only worth having if the DATABASE refuses a clash, because the other tab,
 * the other specialist and the retried request are not asking the browser.
 */

let world: SpecialistWorld

/** Fixed and far future, so a slow run cannot drift into a different day. */
const BASE = new Date('2027-03-01T09:00:00.000Z')
const at = (offsetMinutes: number) =>
  new Date(BASE.getTime() + offsetMinutes * 60_000).toISOString()

async function bookAs(
  actor: SpecialistWorld['specialist'],
  studentId: string,
  startsAt: string,
  durationMinutes = 30,
  specialistId = actor.id,
) {
  return actor.db
    .from('specialist_appointments')
    .insert({
      student_id: studentId,
      specialist_id: specialistId,
      starts_at: startsAt,
      duration_minutes: durationMinutes,
    })
    .select('id')
    .maybeSingle()
}

beforeAll(async () => {
  world = await buildSpecialistWorld()
}, 90_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 90_000)

describe('who may book', () => {
  test('a verified specialist books for a child on their caseload', async () => {
    const { data, error } = await bookAs(world.specialist, world.childA, at(0))

    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })

  test('an unverified specialist cannot, even when assigned', async () => {
    const { error } = await bookAs(
      world.unverifiedSpecialist,
      world.childA,
      at(600),
    )

    // db/029 put this gate on sessions; db/059 inherits the same reasoning.
    // Without it, somebody the school has never confirmed as qualified could
    // fill a child's diary.
    expect(error).not.toBeNull()
  })

  test('a specialist cannot book a child who is not on their caseload', async () => {
    const { error } = await bookAs(world.specialist, world.childB, at(700))

    expect(error).not.toBeNull()
  })

  test('a specialist cannot book on somebody else’s behalf', async () => {
    const { error } = await bookAs(
      world.specialist,
      world.childA,
      at(800),
      30,
      world.otherSpecialist.id,
    )

    // `specialist_id = auth.uid()` in the insert policy. Without it a booking
    // could be planted in a colleague's calendar.
    expect(error).not.toBeNull()
  })

  test('an educator cannot book, and cannot see one', async () => {
    const { error } = await world.verifiedEducator.db
      .from('specialist_appointments')
      .insert({
        student_id: world.childA,
        specialist_id: world.verifiedEducator.id,
        starts_at: at(900),
      })
    expect(error).not.toBeNull()

    const { data } = await world.verifiedEducator.db
      .from('specialist_appointments')
      .select('id')
    expect(data ?? []).toHaveLength(0)
  })
})

describe('who may see one', () => {
  test('a guardian of the child cannot', async () => {
    const { data } = await world.guardianOfA.db
      .from('specialist_appointments')
      .select('id')

    // Deliberate, and the same boundary db/028 draws. Telling a family when
    // their child is seen is a good feature and a different one — it needs a
    // decision about who promises the time.
    expect(data ?? []).toHaveLength(0)
  })

  test('a school administrator cannot', async () => {
    const { data } = await world.schoolAdmin.db
      .from('specialist_appointments')
      .select('id')

    expect(data ?? []).toHaveLength(0)
  })

  test('a colleague on the same caseload can', async () => {
    const { data } = await world.otherSpecialist.db
      .from('specialist_appointments')
      .select('id')

    expect((data ?? []).length).toBeGreaterThan(0)
  })
})

describe('nobody is in two places at once', () => {
  test('the same specialist cannot double-book themselves', async () => {
    const start = at(2000)
    const first = await bookAs(world.specialist, world.childA, start, 60)
    expect(first.error).toBeNull()

    // Starts 30 minutes in, so it overlaps without sharing a start time — the
    // case a naive uniqueness check on (specialist_id, starts_at) would miss.
    const clash = await bookAs(world.specialist, world.childA, at(2030), 30)

    expect(clash.error).not.toBeNull()
    expect(clash.error?.code).toBe('23P01')
  })

  test('two specialists cannot book the same child at the same time', async () => {
    const start = at(3000)
    const first = await bookAs(world.specialist, world.childA, start, 30)
    expect(first.error).toBeNull()

    const clash = await bookAs(world.otherSpecialist, world.childA, start, 30)

    // Each of them is looking at their own calendar, so this is the collision
    // neither would see coming.
    expect(clash.error).not.toBeNull()
    expect(clash.error?.code).toBe('23P01')
  })

  test('cancelling frees the slot', async () => {
    const start = at(4000)
    const booked = await bookAs(world.specialist, world.childA, start, 30)
    expect(booked.error).toBeNull()

    const { error: cancelError } = await world.specialist.db
      .from('specialist_appointments')
      .update({ status: 'cancelled' })
      .eq('id', booked.data!.id)
    expect(cancelError).toBeNull()

    const again = await bookAs(world.specialist, world.childA, start, 30)

    // The constraints are partial — `where (status = 'scheduled')`. If they
    // were not, a cancelled appointment would block its own slot forever.
    expect(again.error).toBeNull()
  })
})

describe('changing one', () => {
  test('a colleague may read a booking but not move it', async () => {
    const booked = await bookAs(world.specialist, world.childA, at(5000), 30)
    expect(booked.error).toBeNull()
    const id = booked.data!.id

    await world.otherSpecialist.db
      .from('specialist_appointments')
      .update({ duration_minutes: 90 })
      .eq('id', id)

    // Read back with the service key. The update above returns success with
    // zero rows changed when RLS filters it, so the absence of an error proves
    // nothing at all.
    const { data } = await admin
      .from('specialist_appointments')
      .select('duration_minutes')
      .eq('id', id)
      .single()

    expect(data?.duration_minutes).toBe(30)
  })

  test('completing without a session is refused', async () => {
    const booked = await bookAs(world.specialist, world.childA, at(6000), 30)
    expect(booked.error).toBeNull()

    const { error } = await world.specialist.db
      .from('specialist_appointments')
      .update({ status: 'completed' })
      .eq('id', booked.data!.id)

    // Otherwise "delivered minutes" counts appointments nobody wrote up, and
    // the figure cannot be reconciled against specialist_sessions.
    expect(error).not.toBeNull()
  })

  test('completing with a session for a different child is refused', async () => {
    const booked = await bookAs(world.specialist, world.childA, at(7000), 30)
    expect(booked.error).toBeNull()

    const { data: session } = await admin
      .from('specialist_sessions')
      .insert({
        student_id: world.childB,
        specialist_id: world.specialist.id,
        duration_minutes: 30,
      })
      .select('id')
      .single()

    const { error } = await world.specialist.db
      .from('specialist_appointments')
      .update({ status: 'completed', session_id: session!.id })
      .eq('id', booked.data!.id)

    expect(error).not.toBeNull()
  })

  test('completing with its own session succeeds', async () => {
    const booked = await bookAs(world.specialist, world.childA, at(8000), 30)
    expect(booked.error).toBeNull()

    const { data: session } = await admin
      .from('specialist_sessions')
      .insert({
        student_id: world.childA,
        specialist_id: world.specialist.id,
        duration_minutes: 30,
      })
      .select('id')
      .single()

    const { error } = await world.specialist.db
      .from('specialist_appointments')
      .update({ status: 'completed', session_id: session!.id })
      .eq('id', booked.data!.id)

    expect(error).toBeNull()

    const { data } = await admin
      .from('specialist_appointments')
      .select('status, session_id')
      .eq('id', booked.data!.id)
      .single()

    expect(data?.status).toBe('completed')
    expect(data?.session_id).toBe(session!.id)
  })
})

describe('a visitor holding only the publishable key', () => {
  test('sees nothing, because anon has no grant at all', async () => {
    const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await anon
      .from('specialist_appointments')
      .select('id')

    // `revoke all ... from anon` in db/059. A missing grant and an empty table
    // look the same from here, so both outcomes are accepted — what must never
    // happen is a row coming back.
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })
})
