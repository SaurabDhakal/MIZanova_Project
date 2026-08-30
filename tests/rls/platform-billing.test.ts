import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * db/072 — what a school pays Special Miles.
 *
 * A SECOND KIND OF MONEY, WITH A DIFFERENT AUDIENCE. `invoices` is a school
 * billing a family for a named child. These two tables are Special Miles
 * billing the school for the platform, and almost every mistake available here
 * is a disclosure: a parent seeing a commercial agreement, one school seeing
 * another's rate, or a customer seeing a charge that is still being drafted.
 *
 * The rule that needs asserting rather than assuming is the middle one. A
 * school admin is DELIBERATELY allowed to read their own agreement and their
 * own issued invoices — hiding them would make every question an email — and a
 * read policy that generous is exactly the kind that gets written slightly too
 * wide.
 */

let world: World

beforeAll(async () => {
  world = await buildWorld()
}, 60_000)

afterAll(async () => {
  if (!world) return
  // These tables are not in cleanupStrays: nothing wrote to them before today.
  await admin.from('platform_invoices').delete().eq('school_id', world.schoolId)
  await admin.from('platform_invoices').delete().eq('school_id', world.otherSchoolId)
  await admin.from('platform_subscriptions').delete().eq('school_id', world.schoolId)
  await admin.from('platform_subscriptions').delete().eq('school_id', world.otherSchoolId)
  await admin
    .from('admin_audit_events')
    .delete()
    .in('action', ['subscription.agreed', 'subscription.changed', 'platform_invoice.issued'])
    .eq('school_id', world.schoolId)
  await admin
    .from('admin_audit_events')
    .delete()
    .in('action', ['subscription.agreed', 'subscription.changed', 'platform_invoice.issued'])
    .eq('school_id', world.otherSchoolId)

  await destroyWorld(world)
}, 60_000)

describe('an agreement is Special Miles to write and the school to read', () => {
  test('a platform admin can agree a rate', async () => {
    const { error } = await world.platformAdmin.db
      .from('platform_subscriptions')
      .insert({
        school_id: world.schoolId,
        plan_label: 'Mid-size schools',
        rate_cents: 240000,
        period: 'annual',
      })

    expect(error).toBeNull()
  })

  test('the school can read what it agreed to pay', async () => {
    const { data, error } = await world.schoolAdmin.db
      .from('platform_subscriptions')
      .select('plan_label, rate_cents')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].rate_cents).toBe(240000)
  })

  /*
   * The whole point of the write policy. A customer who could edit this could
   * set their own price to nothing, and the read access above is what makes it
   * tempting to get the write side wrong.
   */
  test('the school cannot change its own price', async () => {
    const { data } = await admin
      .from('platform_subscriptions')
      .select('id')
      .eq('school_id', world.schoolId)
      .single()

    const { error } = await world.schoolAdmin.db
      .from('platform_subscriptions')
      .update({ rate_cents: 0 })
      .eq('id', data!.id)
      .select('id')

    // RLS filters rather than refuses, so the update matches no row and returns
    // an empty set. Either an error or nothing changed is a pass; a changed row
    // is not.
    const after = await admin
      .from('platform_subscriptions')
      .select('rate_cents')
      .eq('id', data!.id)
      .single()

    expect(error ?? after.data?.rate_cents).not.toBe(0)
    expect(after.data?.rate_cents).toBe(240000)
  })

  test('a school cannot read another school’s agreement', async () => {
    await admin.from('platform_subscriptions').insert({
      school_id: world.otherSchoolId,
      plan_label: 'Large schools',
      rate_cents: 500000,
    })

    const { data, error } = await world.schoolAdmin.db
      .from('platform_subscriptions')
      .select('school_id')

    expect(error).toBeNull()
    expect(data?.every((r) => r.school_id === world.schoolId)).toBe(true)
  })

  test('a teacher sees no commercial agreement at all', async () => {
    const { data, error } = await world.verifiedEducator.db
      .from('platform_subscriptions')
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('a parent sees no commercial agreement at all', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('platform_subscriptions')
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('a school can only have one live agreement', async () => {
    const { error } = await admin.from('platform_subscriptions').insert({
      school_id: world.schoolId,
      plan_label: 'A second live one',
      rate_cents: 1,
    })

    expect(error).not.toBeNull()
  })

  test('an ended agreement does not block a new one, so history survives', async () => {
    await admin
      .from('platform_subscriptions')
      .update({ ends_on: new Date().toISOString().slice(0, 10) })
      .eq('school_id', world.schoolId)

    const { error } = await admin.from('platform_subscriptions').insert({
      school_id: world.schoolId,
      plan_label: 'Renewed',
      rate_cents: 260000,
    })

    expect(error).toBeNull()

    const { data } = await admin
      .from('platform_subscriptions')
      .select('id')
      .eq('school_id', world.schoolId)

    // Both rows are kept. What a school used to pay answers most billing
    // questions, so ending an agreement must never delete it.
    expect(data).toHaveLength(2)
  })
})

describe('a platform invoice', () => {
  test('a draft is not visible to the school it is about', async () => {
    await admin.from('platform_invoices').insert({
      school_id: world.schoolId,
      period_start: '2026-01-01',
      period_end: '2026-03-31',
      description: 'Term 1 platform access',
      amount_cents: 60000,
      status: 'draft',
    })

    const { data, error } = await world.schoolAdmin.db
      .from('platform_invoices')
      .select('id, status')

    expect(error).toBeNull()
    // A charge still being considered is not yet a charge.
    expect(data).toEqual([])
  })

  test('the school sees it once it is issued', async () => {
    await admin
      .from('platform_invoices')
      .update({ status: 'open', issued_at: new Date().toISOString() })
      .eq('school_id', world.schoolId)
      .eq('period_start', '2026-01-01')

    const { data, error } = await world.schoolAdmin.db
      .from('platform_invoices')
      .select('amount_cents, status')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].amount_cents).toBe(60000)
  })

  test('a parent never sees a platform invoice', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('platform_invoices')
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('the same period cannot be billed twice', async () => {
    const { error } = await admin.from('platform_invoices').insert({
      school_id: world.schoolId,
      period_start: '2026-01-01',
      period_end: '2026-03-31',
      description: 'Term 1 again',
      amount_cents: 60000,
    })

    // A manual "raise this period" button makes double-raising easy, and a
    // duplicate charge is the billing error a customer never forgets.
    expect(error).not.toBeNull()
  })

  /*
   * db/020's rule, applied to the second kind of money. 'paid' is a claim that
   * money moved, and a browser is never in a position to know that. Asserted
   * from a signed-in platform admin — the most privileged person who still
   * holds no payment key — because a direct database connection has no
   * auth.uid() and is deliberately exempt.
   */
  test('not even a platform admin can mark one paid from a browser', async () => {
    const { error } = await world.platformAdmin.db
      .from('platform_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('school_id', world.schoolId)
      .eq('period_start', '2026-01-01')
      .select('id')

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/not from a browser/i)
  })

  test('a school cannot mark its own invoice paid either', async () => {
    const { error } = await world.schoolAdmin.db
      .from('platform_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('school_id', world.schoolId)
      .select('id')

    const after = await admin
      .from('platform_invoices')
      .select('status')
      .eq('school_id', world.schoolId)
      .eq('period_start', '2026-01-01')
      .single()

    expect(error ?? after.data?.status).not.toBe('paid')
    expect(after.data?.status).toBe('open')
  })
})

describe('the totals view', () => {
  test('a school admin sees only their own school in it', async () => {
    await admin.from('platform_invoices').insert({
      school_id: world.otherSchoolId,
      period_start: '2026-01-01',
      period_end: '2026-03-31',
      description: 'Somebody else',
      amount_cents: 99900,
      status: 'open',
    })

    const { data, error } = await world.schoolAdmin.db
      .from('platform_revenue_totals')
      .select('school_id, outstanding_cents')

    expect(error).toBeNull()
    // An aggregate is the easiest place to leak another customer's revenue,
    // because nothing on screen looks like somebody else's row.
    expect(data?.every((r) => r.school_id === world.schoolId)).toBe(true)
  })

  test('a platform admin sees every school in it', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('platform_revenue_totals')
      .select('school_id')

    expect(error).toBeNull()
    const ids = (data ?? []).map((r) => r.school_id)
    expect(ids).toContain(world.schoolId)
    expect(ids).toContain(world.otherSchoolId)
  })

  test('an undated invoice is counted apart from an overdue one', async () => {
    const { data } = await world.platformAdmin.db
      .from('platform_revenue_totals')
      .select('outstanding_cents, overdue_cents, no_due_date_cents')
      .eq('school_id', world.otherSchoolId)
      .single()

    // db/071's lesson carried over: no due date means it can never be overdue,
    // so it needs its own column or it vanishes from every chase.
    expect(data?.no_due_date_cents).toBe(99900)
    expect(data?.overdue_cents).toBe(0)
  })
})
