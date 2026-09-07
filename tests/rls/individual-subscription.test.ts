import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  admin,
  anonClient,
  buildWorld,
  destroyWorld,
  makeActor,
  type Actor,
  type World,
} from '../helpers/world'

/**
 * db/111 — an individual can subscribe.
 *
 * ---------------------------------------------------------------------------
 * THE ONE THAT MATTERS IS THE WRITE
 * ---------------------------------------------------------------------------
 * `individual_subscriptions` decides `my_ai_tier()`, which decides which model
 * answers somebody and how many times a day they may ask. A browser that could
 * insert a row saying 'active' would subscribe itself to the paid tier for
 * nothing, forever, and nothing downstream would notice — the row looks
 * exactly like one Stripe produced.
 *
 * db/109 is why this is asserted rather than assumed. There, granting select
 * looked like it narrowed a table and did not: Supabase's default privileges
 * had already given `authenticated` insert, update and delete, so the only
 * thing protecting the rows was RLS having no policy — which held right up
 * until db/108 added one, and then thirteen rows of the model's own words
 * became editable by the person reading them.
 *
 * So the checks here are the ones that caught that: not "is there a policy"
 * but "does the write actually fail".
 */

let world: World
let subscriber: Actor
let bystander: Actor

/* ------------------------------------------------------------------------
   THE PLAN IS A SINGLETON AND IT IS SPECIAL MILES' LIVE CONFIGURATION.
   ------------------------------------------------------------------------
   This suite has to put a price on it to test the write path, and the first
   version then "cleaned up" by setting everything back to null — the values it
   shipped with. That is not cleanup, it is deletion: Saurab had set $12 with a
   7-day trial and a Stripe id through the admin screen, and running the tests
   silently took it away. It did not even leave a trace, because the reset did
   not touch `updated_at`, so the row still carried the timestamp of HIS change.

   There is one database and these tests run against it — §2.4 of the
   architecture review, and the reason the CI job is serialised. A test that
   destroys real configuration is worse than a test that fails.

   So the row is read before anything touches it and put back exactly as found.
   ------------------------------------------------------------------------ */
type PlanRow = {
  price_cents: number | null
  currency: string
  bill_every: string
  trial_days: number | null
  stripe_price_id: string | null
  is_offered: boolean
  updated_at: string
}
let planBefore: PlanRow | null = null

beforeAll(async () => {
  const { data: existing } = await admin
    .from('individual_plan')
    .select(
      'price_cents, currency, bill_every, trial_days, stripe_price_id, is_offered, updated_at',
    )
    .eq('id', 1)
    .single()
  planBefore = (existing ?? null) as PlanRow | null

  world = await buildWorld()
  subscriber = await makeActor(
    'parent',
    world.runId,
    'individual-sub',
    null,
    false,
    'individual',
  )
  bystander = await makeActor(
    'parent',
    world.runId,
    'individual-other',
    null,
    false,
    'individual',
  )
}, 90_000)

afterAll(async () => {
  if (!world) return
  for (const id of [subscriber?.id, bystander?.id].filter(Boolean)) {
    await admin.from('individual_subscriptions').delete().eq('profile_id', id)
  }
  /* Back to whatever it was, not back to empty. `is_offered` goes false first
     because the check constraint refuses a row that is on sale without both a
     price and a Stripe id — restoring in one statement can trip over its own
     intermediate state. */
  if (planBefore) {
    await admin.from('individual_plan').update({ is_offered: false }).eq('id', 1)
    await admin.from('individual_plan').update(planBefore).eq('id', 1)
  }
  await destroyWorld(world)
}, 90_000)

describe('a subscription is written by the server and nobody else', () => {
  test('an individual cannot insert one for themselves', async () => {
    const { error } = await subscriber.db
      .from('individual_subscriptions')
      .insert({
        profile_id: subscriber.id,
        amount_cents: 1,
        bill_every: 'month',
        status: 'active',
      })

    // If this ever succeeds, anybody can have the paid tier for one cent that
    // was never charged.
    expect(error).not.toBeNull()
  })

  test('an individual cannot promote their own cancelled subscription', async () => {
    const { data: row } = await admin
      .from('individual_subscriptions')
      .insert({
        profile_id: subscriber.id,
        amount_cents: 1200,
        bill_every: 'month',
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    const { error, count } = await subscriber.db
      .from('individual_subscriptions')
      .update({ status: 'active' }, { count: 'exact' })
      .eq('id', row!.id)

    /* REFUSED EITHER WAY, and both ways have to be spelled out. A missing
       grant produces an error; a policy that admits no rows produces success
       with a count of zero. Collapsing those into one truthiness check is how
       the first version of this test managed to FAIL on the secure outcome —
       zero is falsy. It is the same trap `assertChanged()` exists for. */
    if (error) expect(error).not.toBeNull()
    else expect(count).toBe(0)

    // The property, rather than the mechanism: it is still cancelled.
    const { data: after } = await admin
      .from('individual_subscriptions')
      .select('status')
      .eq('id', row!.id)
      .single()
    expect(after!.status).toBe('canceled')

    await admin.from('individual_subscriptions').delete().eq('id', row!.id)
  })

  test('one person cannot read another person’s subscription', async () => {
    const { data: row } = await admin
      .from('individual_subscriptions')
      .insert({
        profile_id: subscriber.id,
        amount_cents: 1200,
        bill_every: 'month',
        status: 'active',
      })
      .select('id')
      .single()

    const { data: seen } = await bystander.db
      .from('individual_subscriptions')
      .select('id')
      .eq('id', row!.id)

    expect(seen ?? []).toHaveLength(0)

    await admin.from('individual_subscriptions').delete().eq('id', row!.id)
  })
})

describe('the price is Special Miles’ to set', () => {
  test('an individual cannot price the plan', async () => {
    const { error, count } = await subscriber.db
      .from('individual_plan')
      .update({ price_cents: 1 }, { count: 'exact' })
      .eq('id', 1)

    /* This one takes the zero-rows path, because db/111 deliberately GRANTS
       update on these columns to `authenticated` and then lets the policy
       decide who. So there is no error to catch — only a count — and the
       first version of this test failed precisely because it was refused
       correctly. */
    if (error) expect(error).not.toBeNull()
    else expect(count).toBe(0)

    /* UNCHANGED, not null. This asserted `toBeNull()`, which held only while
       nobody had set a price — so the first time Special Miles configured the
       plan through the admin screen, this test began failing with "expected
       1200 to be null" under the heading "an individual cannot price the
       plan". A red tick that reads like a security breach and is nothing of
       the kind sends somebody hunting through their own diff for a fault that
       is not there, which is the exact failure mode the CI file warns about.

       What the test is actually for is that the write did not land. So compare
       against what the row held before it was attempted. */
    const { data: plan } = await admin
      .from('individual_plan')
      .select('price_cents')
      .eq('id', 1)
      .single()
    expect(plan!.price_cents).toBe(planBefore?.price_cents ?? null)
  })

  test('a platform admin can, which is the half that has to work too', async () => {
    /* The Subscriptions screen writes exactly this. Without it the price could
       only be set by an UPDATE statement typed into a database client, which
       is no use to the person whose decision it is. */
    const { error, count } = await world.platformAdmin.db
      .from('individual_plan')
      .update(
        {
          price_cents: 1234,
          bill_every: 'month',
          trial_days: 7,
          stripe_price_id: 'price_test_admin_can_write',
          is_offered: true,
        },
        { count: 'exact' },
      )
      .eq('id', 1)

    expect(error).toBeNull()
    expect(count).toBe(1)

    const { data: after } = await admin
      .from('individual_plan')
      .select('price_cents, is_offered, trial_days')
      .eq('id', 1)
      .single()
    expect(after!.price_cents).toBe(1234)
    expect(after!.is_offered).toBe(true)
    expect(after!.trial_days).toBe(7)

    // Back to what it was, via not-for-sale so the constraint cannot refuse an
    // intermediate state. afterAll restores it again; this keeps the rows sane
    // for the tests that run between here and there.
    await admin.from('individual_plan').update({ is_offered: false }).eq('id', 1)
    if (planBefore) {
      await admin.from('individual_plan').update(planBefore).eq('id', 1)
      await admin.from('individual_plan').update({ is_offered: false }).eq('id', 1)
    }
  })

  test('a plan cannot go on sale without a price and a Stripe id', async () => {
    // The check constraint, not a policy — this is the one that stops a
    // half-configured plan showing a Subscribe button that cannot work.
    const { error } = await admin
      .from('individual_plan')
      .update({ is_offered: true, price_cents: null, stripe_price_id: null })
      .eq('id', 1)

    expect(error).not.toBeNull()
  })

  test('the price list is readable signed out', async () => {
    // db/098's reason: a pricing page is read by people without accounts.
    const { data, error } = await anonClient()
      .from('individual_plan_public')
      .select('name, price_cents, is_offered')
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })

  test('the public view carries no Stripe id', async () => {
    // An integration detail is not a price and has no business on a poster.
    const { error } = await anonClient()
      .from('individual_plan_public')
      .select('stripe_price_id')

    expect(error).not.toBeNull()
  })
})

describe('my_ai_tier gains the branch db/099 said it would', () => {
  test('free with no subscription and no purchase', async () => {
    const { data, error } = await subscriber.db.rpc('my_ai_tier')
    expect(error).toBeNull()
    expect(data).toBe('free')
  })

  test('paid while the subscription is live', async () => {
    const { data: row } = await admin
      .from('individual_subscriptions')
      .insert({
        profile_id: subscriber.id,
        amount_cents: 1200,
        bill_every: 'month',
        status: 'active',
      })
      .select('id')
      .single()

    const { data } = await subscriber.db.rpc('my_ai_tier')
    expect(data).toBe('paid')

    await admin.from('individual_subscriptions').delete().eq('id', row!.id)
  })

  test('a trial counts as paid, because a trial nobody can use is not a trial', async () => {
    const { data: row } = await admin
      .from('individual_subscriptions')
      .insert({
        profile_id: subscriber.id,
        amount_cents: 1200,
        bill_every: 'month',
        status: 'trialing',
        trial_ends_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      })
      .select('id')
      .single()

    const { data } = await subscriber.db.rpc('my_ai_tier')
    expect(data).toBe('paid')

    await admin.from('individual_subscriptions').delete().eq('id', row!.id)
  })

  test('past_due still counts, because an expired card is not a decision', async () => {
    const { data: row } = await admin
      .from('individual_subscriptions')
      .insert({
        profile_id: subscriber.id,
        amount_cents: 1200,
        bill_every: 'month',
        status: 'past_due',
      })
      .select('id')
      .single()

    const { data } = await subscriber.db.rpc('my_ai_tier')
    expect(data).toBe('paid')

    await admin.from('individual_subscriptions').delete().eq('id', row!.id)
  })

  test('free again once it is cancelled', async () => {
    const { data: row } = await admin
      .from('individual_subscriptions')
      .insert({
        profile_id: subscriber.id,
        amount_cents: 1200,
        bill_every: 'month',
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    const { data } = await subscriber.db.rpc('my_ai_tier')
    expect(data).toBe('free')

    await admin.from('individual_subscriptions').delete().eq('id', row!.id)
  })
})

describe('closing an account keeps the money and drops the name', () => {
  test('the subscription survives the profile with profile_id null', async () => {
    /* db/096's rule, applied to a second table: a business must be able to
       account for money it was paid, and what is left is an amount and a date
       attached to nobody. If this ever becomes a cascade, closing an account
       destroys the record of a payment that really happened. */
    const closer = await makeActor(
      'parent',
      world.runId,
      'individual-closing',
      null,
      false,
      'individual',
    )

    const { data: row } = await admin
      .from('individual_subscriptions')
      .insert({
        profile_id: closer.id,
        amount_cents: 1200,
        bill_every: 'month',
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    await admin.auth.admin.deleteUser(closer.id)

    const { data: after } = await admin
      .from('individual_subscriptions')
      .select('id, profile_id, amount_cents')
      .eq('id', row!.id)
      .maybeSingle()

    expect(after).not.toBeNull()
    expect(after!.profile_id).toBeNull()
    expect(after!.amount_cents).toBe(1200)

    await admin.from('individual_subscriptions').delete().eq('id', row!.id)
  })
})
