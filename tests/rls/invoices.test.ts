import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * Billing rules (M11).
 *
 * The one that matters most: nobody holding a browser session can mark an
 * invoice paid — not the family who owe it, and not the school who issued it.
 * Only the API server can, after Stripe has confirmed the money moved.
 *
 * That rule is about to carry more weight than it does today. The webhook
 * being built next writes payments from outside any user session, so this is
 * the guard that stops the same door being opened from the inside.
 */

let world: World
let draftId: string

beforeAll(async () => {
  world = await buildWorld()
}, 60_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 60_000)

async function statusOf(id: string): Promise<string | null> {
  const { data } = await admin
    .from('invoices')
    .select('status')
    .eq('id', id)
    .single()
  return data?.status ?? null
}

describe('issuing', () => {
  test('a school admin can raise a draft invoice', async () => {
    const { data, error } = await world.schoolAdmin.db
      .from('invoices')
      .insert({
        school_id: world.schoolId,
        student_id: world.childA,
        description: 'Speech therapy, 12 sessions, term 3',
        amount_cents: 96000,
        issued_by: world.schoolAdmin.id,
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    draftId = data!.id
    expect(await statusOf(draftId)).toBe('draft')
  })

  test('a family cannot see a draft', async () => {
    // An amount somebody is still deciding is not a bill.
    const { data } = await world.guardianOfA.db
      .from('invoices')
      .select('id')
      .eq('id', draftId)

    expect(data).toEqual([])
  })

  test('issuing it makes it visible to the family', async () => {
    const { error } = await world.schoolAdmin.db
      .from('invoices')
      .update({ status: 'open' })
      .eq('id', draftId)

    expect(error).toBeNull()

    const { data } = await world.guardianOfA.db
      .from('invoices')
      .select('id, amount_cents')
      .eq('id', draftId)

    expect(data?.length).toBe(1)
    expect(data?.[0].amount_cents).toBe(96000)
  })

  test('another family cannot see it', async () => {
    const { data } = await world.guardianOfB.db
      .from('invoices')
      .select('id')
      .eq('id', draftId)

    expect(data).toEqual([])
  })

  test('a classroom educator cannot see invoices at all', async () => {
    // Teaching a child is no reason to know what their family is billed.
    const { data } = await world.verifiedEducator.db.from('invoices').select('id')
    expect(data).toEqual([])
  })

  test('a family cannot raise an invoice against themselves', async () => {
    const { error } = await world.guardianOfA.db.from('invoices').insert({
      school_id: world.schoolId,
      student_id: world.childA,
      description: 'Invented by a parent',
      amount_cents: 100,
    })

    expect(error).not.toBeNull()
  })

  test('an invoice cannot be for nothing or for a negative amount', async () => {
    for (const amount of [0, -500]) {
      const { error } = await world.schoolAdmin.db.from('invoices').insert({
        school_id: world.schoolId,
        student_id: world.childA,
        description: 'Nonsense amount',
        amount_cents: amount,
      })
      expect(error).not.toBeNull()
    }
  })
})

describe('who may say something is paid', () => {
  /**
   * The family and the school are stopped by two DIFFERENT mechanisms, and the
   * difference is worth knowing when reading a failure here.
   *
   * A guardian is not in `invoices_update` at all, so RLS filters the row out
   * before anything else happens: no error, nothing changed. The first version
   * of this test expected an error and failed — the rule was working, the
   * assertion was describing the wrong layer.
   *
   * A school admin IS allowed to update the row, so their attempt reaches the
   * trigger, which refuses the transition explicitly.
   */
  test('the family cannot mark their own invoice paid', async () => {
    await world.guardianOfA.db
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', draftId)

    // Read it back. A filtered update reports success and changes nothing.
    expect(await statusOf(draftId)).toBe('open')
  })

  test('the school that issued it cannot mark it paid either', async () => {
    // The school has every other power over this row. Not this one: payment is
    // a fact about money moving, not a decision anybody gets to record.
    const { error } = await world.schoolAdmin.db
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', draftId)

    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
    expect(await statusOf(draftId)).toBe('open')
  })

  test('the function that records payment is not callable from a browser', async () => {
    const { error } = await world.guardianOfA.db.rpc('mark_invoice_paid', {
      p_invoice_id: draftId,
      p_session_id: 'cs_forged',
      p_payment_intent_id: 'pi_forged',
    })

    expect(error).not.toBeNull()
    expect(await statusOf(draftId)).toBe('open')
  })

  test('the server can record it, and only once', async () => {
    const { data: first, error } = await admin.rpc('mark_invoice_paid', {
      p_invoice_id: draftId,
      p_session_id: 'cs_test_123',
      p_payment_intent_id: 'pi_test_123',
    })

    expect(error).toBeNull()
    expect(first).toBe(true)
    expect(await statusOf(draftId)).toBe('paid')

    // Stripe can report the same payment more than once, and the webhook will
    // make that far more likely. Paying twice for one invoice must not be
    // recordable.
    const { data: second } = await admin.rpc('mark_invoice_paid', {
      p_invoice_id: draftId,
      p_session_id: 'cs_test_123',
      p_payment_intent_id: 'pi_test_123',
    })

    expect(second).toBe(false)
  })

  test('a paid invoice carries the moment it was paid', async () => {
    const { data } = await admin
      .from('invoices')
      .select('paid_at, stripe_session_id')
      .eq('id', draftId)
      .single()

    expect(data?.paid_at).not.toBeNull()
    expect(data?.stripe_session_id).toBe('cs_test_123')
  })
})

describe('what cannot be undone', () => {
  test('nobody can delete an invoice', async () => {
    // "We billed this and cancelled it" is a fact somebody may need to
    // demonstrate. There is no delete policy at all.
    await world.schoolAdmin.db.from('invoices').delete().eq('id', draftId)
    await world.guardianOfA.db.from('invoices').delete().eq('id', draftId)

    const { data } = await admin.from('invoices').select('id').eq('id', draftId)
    expect(data?.length).toBe(1)
  })
})
