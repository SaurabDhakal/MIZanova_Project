import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  admin,
  buildSpecialistWorld,
  destroyWorld,
  type SpecialistWorld,
} from '../helpers/world'

/**
 * db/073 — a family can see a booking, and a session fee can be billed.
 *
 * TWO THINGS ARE BEING ASSERTED AND THEY FAIL DIFFERENTLY.
 *
 * The read side is a widening: db/059 admitted only the assigned specialist and
 * a platform admin, so a child could be booked and nobody at home was told. A
 * guardian policy fixes that, and the way a widening goes wrong is by admitting
 * one guardian too many.
 *
 * The write side is `raise_appointment_invoice`, which is `security definer`
 * and therefore runs with the privileges of its owner. db/020 lets only a
 * school administrator create invoices; this function is the narrow exception
 * for a specialist billing their own session. The way THAT goes wrong is a
 * specialist billing a family they have no business billing, and a definer
 * function will do it happily unless the checks inside are right.
 */

let world: SpecialistWorld

beforeAll(async () => {
  world = await buildSpecialistWorld()
}, 90_000)

afterAll(async () => {
  if (!world) return
  await admin.from('invoices').delete().eq('school_id', world.schoolId)
  await destroyWorld(world)
}, 60_000)

/*
 * EVERY BOOKING GETS ITS OWN HOUR. db/059 carries gist exclusion constraints so
 * one specialist cannot hold two appointments at once — which is correct, and
 * means a helper that reuses one timestamp fails on the second call for a
 * reason that has nothing to do with what is being tested.
 */
let slot = 0
function nextStart(): string {
  slot += 1
  return new Date(Date.now() + slot * 3_600_000).toISOString()
}

/** A booking with the given specialist, at a fee. */
async function bookFor(
  studentId: string,
  specialistId: string,
  feeCents: number | null,
) {
  const { data, error } = await admin
    .from('specialist_appointments')
    .insert({
      student_id: studentId,
      specialist_id: specialistId,
      starts_at: nextStart(),
      duration_minutes: 45,
      purpose: 'Articulation — R sounds',
      fee_cents: feeCents,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return data.id as string
}

describe('who can see a booking', () => {
  test('the child’s guardian can, which they could not before', async () => {
    await bookFor(world.childA, world.specialist.id, 9500)

    const { data, error } = await world.guardianOfA.db
      .from('specialist_appointments')
      .select('id, purpose, fee_cents')

    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
    expect(data?.[0].purpose).toBe('Articulation — R sounds')
  })

  test('another family’s guardian cannot', async () => {
    const { data, error } = await world.guardianOfB.db
      .from('specialist_appointments')
      .select('student_id')

    expect(error).toBeNull()
    // childB has no appointment; the point is that guardianOfB sees none of
    // childA's rather than an error.
    expect(data?.some((r) => r.student_id === world.childA)).toBe(false)
  })

  test('a guardian cannot move or cancel one', async () => {
    const { data: appt } = await admin
      .from('specialist_appointments')
      .select('id')
      .eq('student_id', world.childA)
      .order('starts_at')
      .limit(1)
      .single()

    await world.guardianOfA.db
      .from('specialist_appointments')
      .update({ status: 'cancelled' })
      .eq('id', appt!.id)

    const after = await admin
      .from('specialist_appointments')
      .select('status')
      .eq('id', appt!.id)
      .single()

    // Knowing when your child is seen is ordinary. Rearranging a clinician's
    // calendar is not.
    expect(after.data?.status).toBe('scheduled')
  })
})

describe('billing a session', () => {
  test('the specialist who booked it can raise an invoice', async () => {
    const { data: appt } = await admin
      .from('specialist_appointments')
      .select('id')
      .eq('student_id', world.childA)
      .order('starts_at')
      .limit(1)
      .single()

    const { data, error } = await world.specialist.db.rpc(
      'raise_appointment_invoice',
      { p_appointment_id: appt!.id },
    )

    expect(error).toBeNull()
    expect(data).toBeTruthy()

    const invoice = await admin
      .from('invoices')
      .select('amount_cents, status, student_id, description')
      .eq('id', data as string)
      .single()

    expect(invoice.data?.amount_cents).toBe(9500)
    // A DRAFT, not a demand. The school's name is on a family invoice, so the
    // school decides what its families are asked to pay.
    expect(invoice.data?.status).toBe('draft')
    expect(invoice.data?.student_id).toBe(world.childA)
    expect(invoice.data?.description).toContain('Articulation')
  })

  test('the same session cannot be billed twice', async () => {
    const { data: appt } = await admin
      .from('specialist_appointments')
      .select('id')
      .eq('student_id', world.childA)
      .order('starts_at')
      .limit(1)
      .single()

    const { error } = await world.specialist.db.rpc('raise_appointment_invoice', {
      p_appointment_id: appt!.id,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/already been billed/i)
  })

  /*
   * The one that matters most. `security definer` means the function writes
   * with its owner's rights, so every check that keeps a specialist from
   * billing a stranger lives inside it rather than in a policy.
   */
  test('a specialist cannot bill for somebody else’s appointment', async () => {
    const id = await bookFor(world.childB, world.specialist.id, 5000)

    const { error } = await world.otherSpecialist.db.rpc(
      'raise_appointment_invoice',
      { p_appointment_id: id },
    )

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/only the specialist who booked it/i)

    const invoices = await admin
      .from('invoices')
      .select('id')
      .eq('student_id', world.childB)

    expect(invoices.data).toEqual([])
  })

  test('an unverified specialist cannot bill at all', async () => {
    const id = await bookFor(world.childA, world.unverifiedSpecialist.id, 4000)

    const { error } = await world.unverifiedSpecialist.db.rpc(
      'raise_appointment_invoice',
      { p_appointment_id: id },
    )

    expect(error).not.toBeNull()
  })

  test('a parent cannot raise an invoice against their own child', async () => {
    const id = await bookFor(world.childA, world.specialist.id, 7000)

    const { error } = await world.guardianOfA.db.rpc(
      'raise_appointment_invoice',
      { p_appointment_id: id },
    )

    expect(error).not.toBeNull()
  })

  test('an appointment with no fee cannot be billed', async () => {
    // Null is the normal case: most school-based therapy is inside what the
    // school already pays, so billing must be the deliberate exception.
    const id = await bookFor(world.childB, world.specialist.id, null)

    const { error } = await world.specialist.db.rpc('raise_appointment_invoice', {
      p_appointment_id: id,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/no fee/i)
  })

  test('a cancelled session cannot be billed', async () => {
    const id = await bookFor(world.childB, world.specialist.id, 8000)
    await admin
      .from('specialist_appointments')
      .update({ status: 'cancelled', cancelled_reason: 'Child unwell' })
      .eq('id', id)

    const { error } = await world.specialist.db.rpc('raise_appointment_invoice', {
      p_appointment_id: id,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/cancelled/i)
  })

  test('the family sees the invoice only once the school issues it', async () => {
    const { data: draft } = await admin
      .from('invoices')
      .select('id')
      .eq('student_id', world.childA)
      .eq('status', 'draft')
      .limit(1)
      .single()

    const hidden = await world.guardianOfA.db
      .from('invoices')
      .select('id')
      .eq('id', draft!.id)

    expect(hidden.data).toEqual([])

    await admin.from('invoices').update({ status: 'open' }).eq('id', draft!.id)

    const shown = await world.guardianOfA.db
      .from('invoices')
      .select('id, amount_cents')
      .eq('id', draft!.id)

    expect(shown.data).toHaveLength(1)
  })
})
