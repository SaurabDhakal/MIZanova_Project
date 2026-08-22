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

/**
 * db/060. These fail until that script has been run in the SQL editor — they
 * describe rules that do not exist before it.
 *
 * THE LINE THE WHOLE BLOCK IS DRAWING. A draft has never been outside the
 * office: `invoices_select` hides it from the family, no money has moved, and
 * nothing has been claimed of anybody. It can be corrected and thrown away.
 * Everything a family has ever been able to see is a record of something that
 * happened to them, and cannot be deleted, repriced, or walked backwards —
 * only cancelled, which leaves the cancellation visible.
 *
 * The two halves are tested together because the second is what makes the
 * first safe to have.
 */
describe('a draft is not a record, and everything else is', () => {
  /** A fresh draft belonging to childA. Returns its id. */
  async function raiseDraft(description: string): Promise<string> {
    const { data, error } = await world.schoolAdmin.db
      .from('invoices')
      .insert({
        school_id: world.schoolId,
        student_id: world.childA,
        description,
        amount_cents: 12345,
        issued_by: world.schoolAdmin.id,
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    return data!.id
  }

  async function exists(id: string): Promise<boolean> {
    const { data } = await admin.from('invoices').select('id').eq('id', id)
    return (data?.length ?? 0) === 1
  }

  test('a school admin can correct a draft', async () => {
    const id = await raiseDraft('Typo in the desciption')

    const { error } = await world.schoolAdmin.db
      .from('invoices')
      .update({ description: 'Speech therapy, term 4', amount_cents: 50000 })
      .eq('id', id)

    expect(error).toBeNull()

    const { data } = await admin
      .from('invoices')
      .select('description, amount_cents')
      .eq('id', id)
      .single()

    expect(data?.description).toBe('Speech therapy, term 4')
    expect(data?.amount_cents).toBe(50000)
  })

  test('a school admin can discard a draft', async () => {
    const id = await raiseDraft('Raised by mistake')

    await world.schoolAdmin.db.from('invoices').delete().eq('id', id)

    expect(await exists(id)).toBe(false)
  })

  test('a family cannot discard a draft they cannot even see', async () => {
    const id = await raiseDraft('Not the family to decide')

    await world.guardianOfA.db.from('invoices').delete().eq('id', id)

    expect(await exists(id)).toBe(true)
    await admin.from('invoices').delete().eq('id', id)
  })

  test('an issued invoice cannot be deleted', async () => {
    const id = await raiseDraft('Issued, then regretted')
    await world.schoolAdmin.db
      .from('invoices')
      .update({ status: 'open' })
      .eq('id', id)

    await world.schoolAdmin.db.from('invoices').delete().eq('id', id)

    // A delete filtered out by RLS is not an error — it reports success having
    // touched nothing, which is why every caller in src/lib/api.ts counts rows.
    expect(await exists(id)).toBe(true)
  })

  test('an issued invoice cannot be walked back to a draft and then deleted', async () => {
    // The attack the delete policy would otherwise permit: make it a draft
    // again, and the "only drafts" rule stops applying to it.
    const id = await raiseDraft('The way round the rule')
    await world.schoolAdmin.db
      .from('invoices')
      .update({ status: 'open' })
      .eq('id', id)

    const { error } = await world.schoolAdmin.db
      .from('invoices')
      .update({ status: 'draft' })
      .eq('id', id)

    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
    expect(await statusOf(id)).toBe('open')

    await world.schoolAdmin.db.from('invoices').delete().eq('id', id)
    expect(await exists(id)).toBe(true)
  })

  test('an issued invoice cannot be repriced', async () => {
    // Changing what somebody is being asked to pay, with nothing to show it
    // changed, is not a correction. Cancel it and raise a new one.
    const id = await raiseDraft('Priced, issued, then edited')
    await world.schoolAdmin.db
      .from('invoices')
      .update({ status: 'open' })
      .eq('id', id)

    const { error } = await world.schoolAdmin.db
      .from('invoices')
      .update({ amount_cents: 1 })
      .eq('id', id)

    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  test('the wording of an issued invoice can still be corrected', async () => {
    // Deliberately allowed, and db/020 said so before this: a family that
    // cannot tell what they are being charged for is helped by clearer words.
    const id = await raiseDraft('Termly fee')
    await world.schoolAdmin.db
      .from('invoices')
      .update({ status: 'open' })
      .eq('id', id)

    const { error } = await world.schoolAdmin.db
      .from('invoices')
      .update({ description: 'Term 4 fee — speech therapy, 12 sessions' })
      .eq('id', id)

    expect(error).toBeNull()
  })

  test('a cancelled invoice cannot be reopened or deleted', async () => {
    // "We billed this and cancelled it" is the fact db/020 set out to keep.
    const id = await raiseDraft('Billed and cancelled')
    await world.schoolAdmin.db
      .from('invoices')
      .update({ status: 'open' })
      .eq('id', id)
    await world.schoolAdmin.db
      .from('invoices')
      .update({ status: 'void' })
      .eq('id', id)

    const { error } = await world.schoolAdmin.db
      .from('invoices')
      .update({ status: 'open' })
      .eq('id', id)

    expect(error).not.toBeNull()
    expect(await statusOf(id)).toBe('void')

    await world.schoolAdmin.db.from('invoices').delete().eq('id', id)
    expect(await exists(id)).toBe(true)
  })

  test('a paid invoice cannot be deleted', async () => {
    // `draftId` has been paid by the block above. This is the row where the
    // rule matters most: money moved.
    expect(await statusOf(draftId)).toBe('paid')

    await world.schoolAdmin.db.from('invoices').delete().eq('id', draftId)
    await world.guardianOfA.db.from('invoices').delete().eq('id', draftId)

    expect(await exists(draftId)).toBe(true)
  })
})
