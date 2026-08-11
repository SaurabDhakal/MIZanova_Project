import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { PUBLISHABLE_KEY, SUPABASE_URL } from '../helpers/env'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * db/047 — Gate 1, admission to the Special Miles network.
 *
 * WHAT MAKES THIS TABLE DIFFERENT FROM EVERY OTHER ONE HERE. It holds a date of
 * birth, a Working With Children Check number and a professional registration
 * number, belonging to somebody who has no account, no school and no
 * relationship with anyone on the platform. If any of it leaks, it leaks about
 * a person who is not even a user yet.
 *
 * So the tests that matter most are the refusals, and the sharpest of them is
 * that a SCHOOL ADMINISTRATOR sees nothing. They are the role most likely to be
 * thought entitled to it — they are the ones who will eventually engage this
 * specialist — and they are not.
 */

const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let world: World
let applicationId: string

const emailFor = (name: string) => `${name}-${world.runId}@applicant.test`

beforeAll(async () => {
  world = await buildWorld()

  const { data, error } = await admin
    .from('specialist_applications')
    .insert({
      full_name: 'Jo Speech',
      email: emailFor('jo'),
      phone: '0400 111 222',
      date_of_birth: '1988-03-14',
      profession: 'speech_pathologist',
      registration_body: 'Speech Pathology Australia',
      registration_number: 'SPA-12345',
      years_experience: 11,
      regions: 'Western Sydney',
      about: 'Early language, AAC.',
      wwcc_state: 'NSW',
      wwcc_number: 'WWC1234567E',
      wwcc_expiry: '2029-01-01',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Could not seed an application: ${error.message}`)
  applicationId = data.id
}, 90_000)

afterAll(async () => {
  if (world) {
    await admin
      .from('specialist_applications')
      .delete()
      .like('email', `%${world.runId}%`)
    await destroyWorld(world)
  }
}, 90_000)

// ===========================================================================
// An applicant is not a user
// ===========================================================================

describe('applying creates nothing anybody can sign in with', () => {
  test('an anonymous visitor cannot insert an application', async () => {
    const { error } = await anon.from('specialist_applications').insert({
      full_name: 'Injected',
      email: emailFor('anon'),
      date_of_birth: '1990-01-01',
      profession: 'psychologist',
    })

    expect(error).not.toBeNull()
  })

  test('nor can a platform admin, whose queue it is', async () => {
    const { error } = await world.platformAdmin.db
      .from('specialist_applications')
      .insert({
        full_name: 'Injected',
        email: emailFor('platform'),
        date_of_birth: '1990-01-01',
        profession: 'psychologist',
      })

    expect(error).not.toBeNull()
  })

  test('an application is not a profile — nothing can sign in as one', async () => {
    // The point of the table existing at all. An account here would be an
    // unapproved stranger holding a login to a children's records platform.
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('id', applicationId)

    expect(data ?? []).toHaveLength(0)
  })
})

// ===========================================================================
// Who can read a date of birth and a WWCC number
// ===========================================================================

describe('screening details are visible to Special Miles alone', () => {
  test('an anonymous visitor sees none', async () => {
    const { data } = await anon.from('specialist_applications').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  test('a school administrator sees none, though they will engage them', async () => {
    // The sharpest refusal here. A school admin decides whether to engage this
    // specialist; they never need their date of birth to do it.
    const { data, error } = await world.schoolAdmin.db
      .from('specialist_applications')
      .select('id, date_of_birth, wwcc_number')

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  test('a specialist cannot read other specialists’ applications', async () => {
    const { data } = await world.verifiedEducator.db
      .from('specialist_applications')
      .select('id')
    expect(data ?? []).toHaveLength(0)
  })

  test('a platform admin sees the whole application', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('specialist_applications')
      .select('full_name, date_of_birth, wwcc_number, registration_number')
      .eq('id', applicationId)
      .single()

    expect(error).toBeNull()
    expect(data?.wwcc_number).toBe('WWC1234567E')
    // Without this the one check the whole table exists to support cannot be
    // done — see the column comment in db/047.
    expect(data?.date_of_birth).toBe('1988-03-14')
  })
})

// ===========================================================================
// The decision
// ===========================================================================

describe('deciding an application', () => {
  test('a school administrator cannot decide one', async () => {
    const { data } = await world.schoolAdmin.db
      .from('specialist_applications')
      .update({ status: 'approved' })
      .eq('id', applicationId)
      .select('id')

    expect(data ?? []).toHaveLength(0)
  })

  test('approving stamps who decided, and when they were admitted', async () => {
    const { error } = await world.platformAdmin.db
      .from('specialist_applications')
      .update({ status: 'approved', review_note: 'WWCC and SPA both verified.' })
      .eq('id', applicationId)

    expect(error).toBeNull()

    const { data } = await admin
      .from('specialist_applications')
      .select('status, reviewed_at, reviewed_by, approved_at')
      .eq('id', applicationId)
      .single()

    expect(data?.status).toBe('approved')
    expect(data?.reviewed_by).toBe(world.platformAdmin.id)
    expect(data?.reviewed_at).not.toBeNull()
    expect(data?.approved_at).not.toBeNull()
  })

  test('a later decline does not erase that they were once admitted', async () => {
    // "Is this person network-vetted?" and "what is their application doing
    // now?" are different questions. A school that engaged them in April
    // deserves an accurate history rather than a rewritten one.
    const { data: before } = await admin
      .from('specialist_applications')
      .select('approved_at')
      .eq('id', applicationId)
      .single()

    await world.platformAdmin.db
      .from('specialist_applications')
      .update({ status: 'declined', review_note: 'Registration lapsed since.' })
      .eq('id', applicationId)

    const { data: after } = await admin
      .from('specialist_applications')
      .select('status, approved_at')
      .eq('id', applicationId)
      .single()

    expect(after?.status).toBe('declined')
    expect(after?.approved_at).toBe(before?.approved_at)
  })

  test('a decision that affects somebody must give a reason', async () => {
    const declined = await world.platformAdmin.db
      .from('specialist_applications')
      .update({ status: 'declined', review_note: null })
      .eq('id', applicationId)

    expect(declined.error).not.toBeNull()
  })

  test('what the applicant claimed cannot be edited', async () => {
    // If a reviewer can change the number, the record no longer says what was
    // checked — and this record is the evidence that it was.
    const { error } = await world.platformAdmin.db
      .from('specialist_applications')
      .update({ wwcc_number: 'WWC9999999E' })
      .eq('id', applicationId)

    expect(error).not.toBeNull()

    const { data } = await admin
      .from('specialist_applications')
      .select('wwcc_number')
      .eq('id', applicationId)
      .single()

    expect(data?.wwcc_number).toBe('WWC1234567E')
  })

  test('a decided application cannot be deleted', async () => {
    await world.platformAdmin.db
      .from('specialist_applications')
      .delete()
      .eq('id', applicationId)

    const { data } = await admin
      .from('specialist_applications')
      .select('id')
      .eq('id', applicationId)
      .maybeSingle()

    expect(data?.id).toBe(applicationId)
  })
})

// ===========================================================================
// The shape of a row
// ===========================================================================

describe('the table refuses applications nobody could act on', () => {
  test('"other" must say what it is', async () => {
    // A reviewer cannot check a register they have not been told the name of.
    const { error } = await admin.from('specialist_applications').insert({
      full_name: 'Vague Practitioner',
      email: emailFor('vague'),
      date_of_birth: '1990-01-01',
      profession: 'other',
    })

    expect(error).not.toBeNull()
  })

  test('one open application per person', async () => {
    const first = await admin.from('specialist_applications').insert({
      full_name: 'Keen Applicant',
      email: emailFor('keen'),
      date_of_birth: '1990-01-01',
      profession: 'psychologist',
    })

    const second = await admin.from('specialist_applications').insert({
      full_name: 'Keen Applicant',
      email: emailFor('keen'),
      date_of_birth: '1990-01-01',
      profession: 'psychologist',
    })

    expect(first.error).toBeNull()
    // Two open applications is two reviewers doing the same work.
    expect(second.error?.code).toBe('23505')
  })

  test('but reapplying after a decision is allowed', async () => {
    // People do get registered, and a decline should not be permanent.
    await admin
      .from('specialist_applications')
      .update({ status: 'declined', review_note: 'Not yet registered.' })
      .eq('email', emailFor('keen'))

    const { error } = await admin.from('specialist_applications').insert({
      full_name: 'Keen Applicant',
      email: emailFor('keen'),
      date_of_birth: '1990-01-01',
      profession: 'psychologist',
    })

    expect(error).toBeNull()
  })

  test('a date of birth must be a plausible one', async () => {
    const { error } = await admin.from('specialist_applications').insert({
      full_name: 'Very Young Practitioner',
      email: emailFor('young'),
      date_of_birth: new Date().toISOString().slice(0, 10),
      profession: 'psychologist',
    })

    expect(error).not.toBeNull()
  })
})
