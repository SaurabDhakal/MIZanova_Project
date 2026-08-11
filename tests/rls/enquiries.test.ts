import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { PUBLISHABLE_KEY, SUPABASE_URL } from '../helpers/env'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * db/045 — enquiries from the pricing page.
 *
 * THIS TABLE IS DIFFERENT FROM EVERY OTHER ONE TESTED HERE, and that is why it
 * gets its own suite. Everywhere else the question is "may this signed-in
 * person see this child?". Here there is no signed-in person at all: the rows
 * are written on behalf of strangers, by a server holding the service key.
 *
 * That inverts what can go wrong. The danger is not somebody reading a record
 * they should not — it is the table being writable by anyone holding the
 * publishable key, which ships inside the JavaScript bundle by design. So the
 * first test below is that nobody can insert, including the platform admin the
 * table belongs to.
 *
 * The second thing worth testing is the trigger. An enquiry is evidence of what
 * a customer asked for and what they were promised; a screen that could rewrite
 * it would turn the record into whatever the last person to look at it wanted
 * it to say.
 */

/** A browser with nobody signed in — exactly what a visitor's page holds. */
const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let world: World
let enquiryId: string

/** Tagged with the run id so the cleanup below can find every row this made. */
const emailFor = (name: string) => `${name}-${world.runId}@enquiry.test`

beforeAll(async () => {
  world = await buildWorld()

  const { data, error } = await admin
    .from('enquiries')
    .insert({
      kind: 'school',
      plan_key: 'mid_school',
      organisation_name: `Test Grammar ${world.runId}`,
      contact_name: 'Alex Principal',
      contact_email: emailFor('alex'),
      contact_role: 'Principal',
      student_count: 420,
      message: 'We have 12 students on individual plans.',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Could not seed an enquiry: ${error.message}`)
  enquiryId = data.id
}, 90_000)

afterAll(async () => {
  // destroyWorld does not know about this table — these rows belong to nobody,
  // which is the whole point of them.
  if (world) {
    await admin.from('enquiries').delete().like('contact_email', `%${world.runId}%`)
    await destroyWorld(world)
  }
}, 90_000)

// ===========================================================================
// Nobody writes this table from a browser
// ===========================================================================

describe('the browser cannot write an enquiry', () => {
  test('an anonymous visitor cannot insert one', async () => {
    // The form posts to the API server for exactly this reason. If this ever
    // starts succeeding, anyone with the bundle can fill the table.
    const { error } = await anon.from('enquiries').insert({
      kind: 'school',
      organisation_name: 'Injected School',
      contact_name: 'Nobody',
      contact_email: emailFor('anon-insert'),
    })

    expect(error).not.toBeNull()
  })

  test('a signed-in school admin cannot insert one either', async () => {
    const { error } = await world.schoolAdmin.db.from('enquiries').insert({
      kind: 'school',
      organisation_name: 'Injected School',
      contact_name: 'Nobody',
      contact_email: emailFor('admin-insert'),
    })

    expect(error).not.toBeNull()
  })

  test('not even a platform admin, whose table it is', async () => {
    // There is no insert policy at all — deliberately, rather than one scoped
    // to platform admins. Nobody types these; people out on the internet do.
    const { error } = await world.platformAdmin.db.from('enquiries').insert({
      kind: 'family',
      contact_name: 'Nobody',
      contact_email: emailFor('platform-insert'),
    })

    expect(error).not.toBeNull()
  })
})

// ===========================================================================
// Who can read them
// ===========================================================================

describe('only Special Miles reads enquiries', () => {
  test('an anonymous visitor sees none', async () => {
    const { data } = await anon.from('enquiries').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  test('a school administrator sees none', async () => {
    // These hold names and work addresses of people at other organisations —
    // quite possibly the school down the road.
    const { data, error } = await world.schoolAdmin.db
      .from('enquiries')
      .select('id')

    expect(error).toBeNull() // RLS filters rather than complaining
    expect(data ?? []).toHaveLength(0)
  })

  test('a parent sees none', async () => {
    const { data } = await world.guardianOfA.db.from('enquiries').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  test('a platform admin sees the enquiry', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('enquiries')
      .select('id, organisation_name, contact_email')
      .eq('id', enquiryId)
      .single()

    expect(error).toBeNull()
    expect(data?.contact_email).toBe(emailFor('alex'))
  })
})

// ===========================================================================
// Triage, and the line it cannot cross
// ===========================================================================

describe('what an enquiry records cannot be rewritten', () => {
  test('a school administrator cannot change one', async () => {
    const { data } = await world.schoolAdmin.db
      .from('enquiries')
      .update({ status: 'declined' })
      .eq('id', enquiryId)
      .select('id')

    // No policy matches, so no row is visible to update. Silence, not an error.
    expect(data ?? []).toHaveLength(0)
  })

  test('a platform admin can move it along, and is recorded doing so', async () => {
    const { error } = await world.platformAdmin.db
      .from('enquiries')
      .update({ status: 'contacted', handled_note: 'Called them Tuesday.' })
      .eq('id', enquiryId)

    expect(error).toBeNull()

    const { data } = await admin
      .from('enquiries')
      .select('status, handled_note, handled_at, handled_by')
      .eq('id', enquiryId)
      .single()

    expect(data?.status).toBe('contacted')
    expect(data?.handled_note).toBe('Called them Tuesday.')
    // Stamped by the trigger, not sent by the screen. The update above never
    // mentioned either, which is the point: a browser cannot get these wrong
    // or leave them out.
    expect(data?.handled_at).not.toBeNull()
    expect(data?.handled_by).toBe(world.platformAdmin.id)
  })

  test('putting it back in the queue clears who handled it', async () => {
    await world.platformAdmin.db
      .from('enquiries')
      .update({ status: 'new' })
      .eq('id', enquiryId)

    const { data } = await admin
      .from('enquiries')
      .select('handled_at, handled_by')
      .eq('id', enquiryId)
      .single()

    // Otherwise the screen shows a handler for something nobody has handled.
    expect(data?.handled_at).toBeNull()
    expect(data?.handled_by).toBeNull()

    await world.platformAdmin.db
      .from('enquiries')
      .update({ status: 'contacted' })
      .eq('id', enquiryId)
  })

  test('the enquirer’s own words cannot be edited', async () => {
    const { error } = await world.platformAdmin.db
      .from('enquiries')
      .update({ contact_email: 'someone@else.example' })
      .eq('id', enquiryId)

    expect(error).not.toBeNull()

    const { data } = await admin
      .from('enquiries')
      .select('contact_email')
      .eq('id', enquiryId)
      .single()

    expect(data?.contact_email).toBe(emailFor('alex'))
  })

  test('neither can what they asked for, or when they asked', async () => {
    const asked = await world.platformAdmin.db
      .from('enquiries')
      .update({ message: 'They said something else entirely.' })
      .eq('id', enquiryId)

    const when = await world.platformAdmin.db
      .from('enquiries')
      .update({ created_at: new Date(0).toISOString() })
      .eq('id', enquiryId)

    expect(asked.error).not.toBeNull()
    expect(when.error).not.toBeNull()
  })

  test('an enquiry cannot be deleted, only declined', async () => {
    await world.platformAdmin.db.from('enquiries').delete().eq('id', enquiryId)

    const { data } = await admin
      .from('enquiries')
      .select('id')
      .eq('id', enquiryId)
      .maybeSingle()

    // "We decided not to pursue that school" is what somebody asks about a
    // year later, and a deleted row cannot answer.
    expect(data?.id).toBe(enquiryId)
  })
})

// ===========================================================================
// The shape of a row, which the server relies on
// ===========================================================================

describe('the table refuses rows that cannot be answered', () => {
  test('a school enquiry must name a school', async () => {
    const { error } = await admin.from('enquiries').insert({
      kind: 'school',
      contact_name: 'Anonymous Principal',
      contact_email: emailFor('no-school'),
    })

    expect(error).not.toBeNull()
  })

  test('a made-up plan is refused rather than stored', async () => {
    // plan_key arrives from a query string, so it is typed by whoever holds
    // the browser. The server drops unknown values; this is the floor under it.
    const { error } = await admin.from('enquiries').insert({
      kind: 'family',
      plan_key: '<script>alert(1)</script>',
      contact_name: 'Curious Person',
      contact_email: emailFor('bad-plan'),
    })

    expect(error).not.toBeNull()
  })

  test('an address must at least look like one, and be lowercased', async () => {
    const notAnAddress = await admin.from('enquiries').insert({
      kind: 'family',
      contact_name: 'Typo',
      contact_email: `not-an-address-${world.runId}`,
    })

    const shouted = await admin.from('enquiries').insert({
      kind: 'family',
      contact_name: 'Shouty',
      contact_email: emailFor('MIXED').toUpperCase(),
    })

    expect(notAnAddress.error).not.toBeNull()
    // Same person enquiring twice must be visibly the same person.
    expect(shouted.error).not.toBeNull()
  })
})
