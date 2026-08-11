import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { PUBLISHABLE_KEY, SUPABASE_URL } from '../helpers/env'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * db/048 — screening that expires.
 *
 * db/047 records that a Working With Children Check was verified on a day.
 * Checks expire and checks are revoked, so approval is a statement about the
 * past. These tests are about the two things that make the present visible:
 * a renewal supersedes rather than accumulating, and somebody with NO check on
 * file is findable at all.
 *
 * The second one is the easier bug to write. A report of expiring checks reads
 * as complete while silently omitting everybody who has nothing to expire —
 * which is exactly what happened to the first real application, approved with
 * an expiry date and no number.
 */

const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let world: World
const emailFor = (name: string) => `${name}-${world.runId}@screening.test`

/** Days from today, as a date string. */
function daysAway(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

beforeAll(async () => {
  world = await buildWorld()

  await admin.from('staff_screening').insert([
    {
      email: emailFor('current'),
      check_type: 'wwcc',
      state: 'NSW',
      number: 'WWC1111111E',
      expires_on: daysAway(400),
    },
    {
      email: emailFor('soon'),
      check_type: 'wwcc',
      state: 'NSW',
      number: 'WWC2222222E',
      expires_on: daysAway(20),
    },
    {
      email: emailFor('lapsed'),
      check_type: 'wwcc',
      state: 'VIC',
      number: 'WWC3333333E',
      expires_on: daysAway(-5),
    },
  ])
}, 90_000)

afterAll(async () => {
  if (world) {
    await admin.from('staff_screening').delete().like('email', `%${world.runId}%`)
    await admin
      .from('specialist_applications')
      .delete()
      .like('email', `%${world.runId}%`)
    await destroyWorld(world)
  }
}, 90_000)

// ===========================================================================
// Who can read a screening number
// ===========================================================================

describe('screening records are visible to Special Miles alone', () => {
  test('an anonymous visitor sees none', async () => {
    const { data } = await anon.from('staff_screening').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  test('a school administrator sees none', async () => {
    const { data, error } = await world.schoolAdmin.db
      .from('staff_screening')
      .select('id, number')

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  test('the overview view does not leak past its own RLS', async () => {
    // `security_invoker` is the whole reason this is safe. A view without it
    // reads the underlying table with the OWNER's rights, which is how a
    // careful schema grows a hole that no policy mentions.
    const { data } = await world.schoolAdmin.db
      .from('screening_overview')
      .select('id, number')

    expect(data ?? []).toHaveLength(0)
  })

  test('a platform admin sees them', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('screening_overview')
      .select('email, state_of_check, days_remaining')
      .like('email', `%${world.runId}%`)

    expect(error).toBeNull()
    expect(data).toHaveLength(3)
  })
})

// ===========================================================================
// What the report actually says
// ===========================================================================

describe('the report classifies by the date, not by hope', () => {
  test('expired, expiring and valid are told apart', async () => {
    const { data } = await world.platformAdmin.db
      .from('screening_overview')
      .select('email, state_of_check')
      .like('email', `%${world.runId}%`)

    const byEmail = Object.fromEntries(
      (data ?? []).map((row) => [row.email, row.state_of_check]),
    )

    expect(byEmail[emailFor('lapsed')]).toBe('expired')
    // 60 days, because a renewal is not instant and a school term is ten
    // weeks. Warning somebody the week it lapses is telling them too late.
    expect(byEmail[emailFor('soon')]).toBe('expiring')
    expect(byEmail[emailFor('current')]).toBe('valid')
  })

  test('days remaining goes negative rather than stopping at zero', async () => {
    const { data } = await world.platformAdmin.db
      .from('screening_overview')
      .select('days_remaining')
      .eq('email', emailFor('lapsed'))
      .single()

    expect(data?.days_remaining).toBeLessThan(0)
  })
})

describe('a date nobody supplied is not a date', () => {
  test('a check with no expiry reads as unknown, not as valid', async () => {
    /*
     * db/051. db/048 seeded NDIS rows with `current_date + 30` because the
     * application form never asked when the check ran out, and the screen
     * rendered that invention as "expires 5 September 2026" on a child-safety
     * record. The honest state is "we do not know", and the column could not
     * hold it.
     */
    await admin.from('staff_screening').insert({
      email: emailFor('nodate'),
      check_type: 'ndis',
      number: 'NDIS0001',
      expires_on: null,
    })

    const { data } = await world.platformAdmin.db
      .from('screening_overview')
      .select('state_of_check, days_remaining')
      .eq('email', emailFor('nodate'))
      .single()

    expect(data?.state_of_check).toBe('unknown')
    // Not a large number either: "999 days left" would sort an unknown check
    // to the safe end of a list ordered by urgency.
    expect(data?.days_remaining).toBeNull()
  })

  test('and never counts as one of the current ones', async () => {
    const { data } = await world.platformAdmin.db
      .from('screening_overview')
      .select('email, state_of_check')
      .like('email', `%${world.runId}%`)

    const valid = (data ?? []).filter((r) => r.state_of_check === 'valid')
    expect(valid.map((r) => r.email)).not.toContain(emailFor('nodate'))
  })
})

// ===========================================================================
// Renewal
// ===========================================================================

describe('renewing supersedes rather than accumulating', () => {
  test('recording a new check ends the old one', async () => {
    const { error } = await world.platformAdmin.db
      .from('staff_screening')
      .insert({
        email: emailFor('lapsed'),
        check_type: 'wwcc',
        state: 'VIC',
        number: 'WWC4444444E',
        expires_on: daysAway(1000),
      })

    expect(error).toBeNull()

    const { data: live } = await admin
      .from('staff_screening')
      .select('number')
      .eq('email', emailFor('lapsed'))
      .eq('check_type', 'wwcc')
      .is('ended_at', null)

    // Two live rows with different dates would let the report show whichever
    // it liked, which is worse than holding no record at all.
    expect(live).toHaveLength(1)
    expect(live?.[0].number).toBe('WWC4444444E')

    const { data: all } = await admin
      .from('staff_screening')
      .select('id')
      .eq('email', emailFor('lapsed'))

    // Ended, not deleted: "what were we relying on in March?" has an answer.
    expect(all).toHaveLength(2)
  })

  test('the renewed person is no longer in the report as expired', async () => {
    const { data } = await world.platformAdmin.db
      .from('screening_overview')
      .select('state_of_check')
      .eq('email', emailFor('lapsed'))
      .single()

    expect(data?.state_of_check).toBe('valid')
  })

  test('a school administrator cannot record one', async () => {
    const { error } = await world.schoolAdmin.db
      .from('staff_screening')
      .insert({
        email: emailFor('forged'),
        check_type: 'wwcc',
        state: 'NSW',
        number: 'WWC0000000E',
        expires_on: daysAway(900),
      })

    expect(error).not.toBeNull()
  })

  test('a reminder date can be recorded, and only by Special Miles', async () => {
    // db/050. The column answers "have we already asked them?", which is the
    // first thing a reviewer needs and the one thing a fire-and-forget button
    // cannot tell them.
    const mine = await world.platformAdmin.db
      .from('staff_screening')
      .update({ last_reminded_at: new Date().toISOString() })
      .eq('email', emailFor('soon'))
      .select('id')

    const theirs = await world.schoolAdmin.db
      .from('staff_screening')
      .update({ last_reminded_at: new Date().toISOString() })
      .eq('email', emailFor('soon'))
      .select('id')

    expect(mine.data ?? []).toHaveLength(1)
    expect(theirs.data ?? []).toHaveLength(0)

    const { data } = await world.platformAdmin.db
      .from('screening_overview')
      .select('last_reminded_at')
      .eq('email', emailFor('soon'))
      .single()

    // Carried by the view, so the screen and any future sweep read it from
    // the same place.
    expect(data?.last_reminded_at).not.toBeNull()
  })

  test('a check cannot be deleted, only ended', async () => {
    await world.platformAdmin.db
      .from('staff_screening')
      .delete()
      .eq('email', emailFor('current'))

    const { data } = await admin
      .from('staff_screening')
      .select('id')
      .eq('email', emailFor('current'))

    expect(data).toHaveLength(1)
  })
})

// ===========================================================================
// The people the report would otherwise leave out
// ===========================================================================

describe('somebody approved with no check on file is findable', () => {
  test('they appear in approved_without_screening', async () => {
    /*
     * THE BUG THIS GUARDS. An expiry report lists checks, so a person who
     * never had one recorded is absent from it — and reads as fine. They are
     * the most urgent case, not the least. This is not hypothetical: the first
     * real application was approved with an expiry date and no number.
     */
    const { data: application } = await admin
      .from('specialist_applications')
      .insert({
        full_name: 'Unchecked Practitioner',
        email: emailFor('nocheck'),
        date_of_birth: '1990-01-01',
        profession: 'psychologist',
      })
      .select('id')
      .single()

    await admin
      .from('specialist_applications')
      .update({ status: 'approved' })
      .eq('id', application!.id)

    const { data } = await world.platformAdmin.db
      .from('approved_without_screening')
      .select('email')
      .eq('email', emailFor('nocheck'))

    expect(data).toHaveLength(1)
  })

  test('and drop off it the moment a check is recorded', async () => {
    await world.platformAdmin.db.from('staff_screening').insert({
      email: emailFor('nocheck'),
      check_type: 'wwcc',
      state: 'NSW',
      number: 'WWC5555555E',
      expires_on: daysAway(700),
    })

    const { data } = await world.platformAdmin.db
      .from('approved_without_screening')
      .select('email')
      .eq('email', emailFor('nocheck'))

    expect(data ?? []).toHaveLength(0)
  })

  test('a school administrator cannot read that list either', async () => {
    const { data } = await world.schoolAdmin.db
      .from('approved_without_screening')
      .select('email')

    expect(data ?? []).toHaveLength(0)
  })
})
