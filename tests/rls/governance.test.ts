import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * The controls added on 4 August: AI quotas, the failure log, and retention.
 *
 * Each of these is a rule that only matters when something is going wrong —
 * a runaway loop, a broken webhook, a table growing forever. That is precisely
 * the moment nobody is checking whether the rule works, so it is asserted here
 * instead.
 */

let world: World

beforeAll(async () => {
  world = await buildWorld()
}, 60_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 60_000)

describe('AI usage records', () => {
  test('a browser session cannot write a usage record', async () => {
    /**
     * The one that matters most. If a browser could insert here, anyone over
     * their limit could simply not report themselves — and if it could DELETE,
     * they could clear the meter. There is no insert policy at all; the API
     * server writes these with the service key.
     */
    const { error } = await world.verifiedEducator.db
      .from('ai_generation_events')
      .insert({
        school_id: world.schoolId,
        requested_by: world.verifiedEducator.id,
        strategies_returned: 3,
      })

    expect(error).not.toBeNull()
  })

  test('a teacher cannot read usage records', async () => {
    await admin.from('ai_generation_events').insert({
      school_id: world.schoolId,
      requested_by: world.verifiedEducator.id,
      strategies_returned: 3,
    })

    const { data } = await world.verifiedEducator.db
      .from('ai_generation_events')
      .select('id')

    expect(data ?? []).toEqual([])
  })

  test('a school administrator sees their own school’s usage', async () => {
    const { data, error } = await world.schoolAdmin.db
      .from('ai_generation_events')
      .select('id')

    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  test('and not another school’s', async () => {
    await admin.from('ai_generation_events').insert({
      school_id: world.otherSchoolId,
      requested_by: world.verifiedEducator.id,
      strategies_returned: 3,
    })

    const { data } = await world.schoolAdmin.db
      .from('ai_generation_events')
      .select('school_id')

    expect((data ?? []).every((r) => r.school_id === world.schoolId)).toBe(true)
  })

  test('nobody can delete a usage record to reset their meter', async () => {
    const before = await admin
      .from('ai_generation_events')
      .select('id')
      .eq('school_id', world.schoolId)

    await world.schoolAdmin.db
      .from('ai_generation_events')
      .delete()
      .eq('school_id', world.schoolId)

    const after = await admin
      .from('ai_generation_events')
      .select('id')
      .eq('school_id', world.schoolId)

    expect(after.data?.length).toBe(before.data?.length)
  })
})

describe('the quota itself', () => {
  test('counts this school and this person separately', async () => {
    // Two more for the school, attributed to somebody else. The school total
    // must rise; the educator's must not.
    await admin.from('ai_generation_events').insert([
      {
        school_id: world.schoolId,
        requested_by: world.schoolAdmin.id,
        strategies_returned: 3,
      },
      {
        school_id: world.schoolId,
        requested_by: world.schoolAdmin.id,
        strategies_returned: 3,
      },
    ])

    const { data, error } = await admin
      .rpc('ai_quota_status', {
        p_school_id: world.schoolId,
        p_actor_id: world.verifiedEducator.id,
      })
      .single()

    expect(error).toBeNull()

    /**
     * The educator has TWO requests and this school has three, and the
     * difference is the point.
     *
     * The per-person count is not scoped to a school — one of the educator's
     * requests was recorded against the other school. That is deliberate: a
     * person is one person, and a per-user limit that resets by moving between
     * schools is not a limit. The per-school count is scoped, because a school
     * is paying for its own usage.
     *
     * The first version of this test asserted 1 and was simply wrong about
     * which question `ai_quota_status` answers.
     */
    expect(data.user_used).toBe(2)
    expect(data.school_used).toBe(3)
    expect(data.user_limit).toBeGreaterThan(0)
    expect(data.school_limit).toBeGreaterThan(0)
  })

  test('a teacher can see their own remaining allowance', async () => {
    // Counts only, so the dashboard can warn before the wall rather than
    // making somebody discover the limit from an error mid-incident.
    const { data, error } = await world.verifiedEducator.db
      .rpc('ai_quota_status', {
        p_school_id: world.schoolId,
        p_actor_id: world.verifiedEducator.id,
      })
      .single()

    expect(error).toBeNull()
    expect(data.user_used).toBe(2)
  })
})

describe('the failure log', () => {
  test('is invisible to everyone but Special Miles', async () => {
    await admin.from('system_events').insert({
      severity: 'critical',
      source: 'test',
      event: 'probe',
      detail: 'Written by the test suite.',
    })

    for (const actor of [
      world.verifiedEducator,
      world.schoolAdmin,
      world.guardianOfA,
    ]) {
      const { data } = await actor.db.from('system_events').select('id')
      expect(data ?? []).toEqual([])
    }
  })

  test('a platform administrator can read it', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('system_events')
      .select('source, event')

    expect(error).toBeNull()
    expect((data ?? []).some((e) => e.event === 'probe')).toBe(true)
  })

  test('nobody can write to it, including a platform administrator', async () => {
    // A failure log a browser can write to is one that can be filled with
    // noise until the real entry scrolls away.
    const { error } = await world.platformAdmin.db.from('system_events').insert({
      severity: 'info',
      source: 'forged',
      event: 'planted',
    })

    expect(error).not.toBeNull()
  })

  test('nobody can delete an entry', async () => {
    await world.platformAdmin.db.from('system_events').delete().eq('source', 'test')

    const { data } = await admin
      .from('system_events')
      .select('id')
      .eq('source', 'test')

    expect((data ?? []).length).toBeGreaterThan(0)
  })
})

describe('retention', () => {
  test('purging is not something a browser can trigger', async () => {
    for (const actor of [world.platformAdmin, world.schoolAdmin]) {
      const { error } = await actor.db.rpc('purge_access_events', {
        p_keep_days: 365,
      })
      expect(error).not.toBeNull()
    }
  })

  test('refuses a period short enough to empty the table', async () => {
    // A guard against a typo. Thirty days is already shorter than any
    // defensible policy, so anything below it is a mistake rather than a
    // choice.
    const { error } = await admin.rpc('purge_access_events', { p_keep_days: 5 })
    expect(error).not.toBeNull()
  })

  test('deletes what is old and keeps what is not', async () => {
    /**
     * Purging is global by age, so this deliberately uses the real default of
     * 365 days: nothing legitimate in this project is a year old, and if it
     * ever is, deleting it is the intended behaviour rather than an accident.
     */
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()

    /**
     * TWO SEPARATE INSERTS, not one array. In a batch insert PostgREST builds
     * a single column list from the first row and sends an explicit NULL for
     * any key missing from later rows — which overrides the column default. So
     * the second row arrived with occurred_at = null and the whole statement
     * failed on the not-null constraint.
     *
     * The first version of this test did not check the error, so it reported
     * that the PURGE had failed when the setup had. Checking is the fix; the
     * lesson is that an unchecked insert in a test is a lie waiting to be told.
     */
    const { error: oldError } = await admin.from('student_access_events').insert({
      actor_id: world.verifiedEducator.id,
      student_id: world.childA,
      context: 'ancient',
      occurred_at: old,
    })
    expect(oldError).toBeNull()

    const { error: newError } = await admin.from('student_access_events').insert({
      actor_id: world.verifiedEducator.id,
      student_id: world.childA,
      context: 'today',
    })
    expect(newError).toBeNull()

    const { data: deleted, error } = await admin.rpc('purge_access_events', {
      p_keep_days: 365,
    })

    expect(error).toBeNull()
    expect(deleted).toBeGreaterThanOrEqual(1)

    const { data: left } = await admin
      .from('student_access_events')
      .select('context')
      .eq('student_id', world.childA)

    const contexts = (left ?? []).map((r) => r.context)
    expect(contexts).not.toContain('ancient')
    expect(contexts).toContain('today')
  })

  test('spent recovery codes go, unused ones stay', async () => {
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString()

    await admin.from('mfa_recovery_codes').insert([
      { user_id: world.verifiedEducator.id, code_hash: 'test-spent', used_at: old },
      { user_id: world.verifiedEducator.id, code_hash: 'test-live', used_at: null },
    ])

    const { error } = await admin.rpc('purge_spent_recovery_codes', {
      p_keep_days: 90,
    })
    expect(error).toBeNull()

    const { data } = await admin
      .from('mfa_recovery_codes')
      .select('code_hash')
      .eq('user_id', world.verifiedEducator.id)

    const hashes = (data ?? []).map((r) => r.code_hash)
    expect(hashes).not.toContain('test-spent')
    // The live one is somebody's only way back into their account.
    expect(hashes).toContain('test-live')
  })
})
