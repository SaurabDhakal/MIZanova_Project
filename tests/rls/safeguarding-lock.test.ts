import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * FR14 — once an administrator has acknowledged a flagged incident, the
 * teacher who logged it can no longer change it.
 *
 * This is the oldest untested claim in the project, and it is the one where a
 * silent failure would matter most. The point of the rule is that a record
 * someone senior has already read and acted on cannot be quietly reworded
 * afterwards. If it broke, nothing on screen would look different.
 *
 * EVERY ASSERTION READS THE ROW BACK. Postgres does not error when RLS filters
 * an UPDATE — it reports success and changes nothing. A test that only checked
 * `error` would pass against a completely broken policy. That is the exact
 * trap `assertChanged()` was written for after several "it isn't working"
 * reports, and a test suite that fell for it would be worse than none.
 */

let world: World
let logId: string

beforeAll(async () => {
  world = await buildWorld()

  // A flagged incident, logged by the verified educator, not yet acknowledged.
  const { data, error } = await admin
    .from('behaviour_logs')
    .insert({
      student_id: world.childA,
      logged_by: world.verifiedEducator.id,
      behaviour_type: 'physical',
      intensity: 'high',
      notes: 'Original wording, written at the time.',
      is_risk_flagged: true,
      risk_note: 'Another child was hurt.',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  logId = data.id
}, 60_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 60_000)

/** The truth, read with the service key rather than from a response. */
async function noteOnRecord(): Promise<string | null> {
  const { data } = await admin
    .from('behaviour_logs')
    .select('notes')
    .eq('id', logId)
    .single()
  return data?.notes ?? null
}

describe('before an administrator has looked', () => {
  test('the teacher who logged it can still correct their own wording', async () => {
    await world.verifiedEducator.db
      .from('behaviour_logs')
      .update({ notes: 'Corrected wording, same afternoon.' })
      .eq('id', logId)

    expect(await noteOnRecord()).toBe('Corrected wording, same afternoon.')
  })

  test('a different teacher cannot change it', async () => {
    await world.unverifiedEducator.db
      .from('behaviour_logs')
      .update({ notes: 'Written by somebody else entirely.' })
      .eq('id', logId)

    expect(await noteOnRecord()).toBe('Corrected wording, same afternoon.')
  })

  test('a guardian cannot change it', async () => {
    await world.guardianOfA.db
      .from('behaviour_logs')
      .update({ notes: 'Edited by a parent.' })
      .eq('id', logId)

    expect(await noteOnRecord()).toBe('Corrected wording, same afternoon.')
  })

  test('the incident is in the school’s open safeguarding queue', async () => {
    const { data } = await world.schoolAdmin.db
      .from('behaviour_logs')
      .select('id')
      .eq('is_risk_flagged', true)
      .is('safeguarding_acknowledged_at', null)

    expect(data?.map((row) => row.id)).toContain(logId)
  })
})

describe('the acknowledgement itself', () => {
  test('a teacher cannot acknowledge their own flagged incident', async () => {
    // The whole safeguard is that somebody else looks. A teacher clearing
    // their own flag would close the loop with nobody in it.
    await world.verifiedEducator.db
      .from('behaviour_logs')
      .update({
        safeguarding_acknowledged_at: new Date().toISOString(),
        safeguarding_acknowledged_by: world.verifiedEducator.id,
      })
      .eq('id', logId)

    const { data } = await admin
      .from('behaviour_logs')
      .select('safeguarding_acknowledged_at')
      .eq('id', logId)
      .single()

    expect(data?.safeguarding_acknowledged_at).toBeNull()
  })

  test('a school administrator can acknowledge it', async () => {
    await world.schoolAdmin.db
      .from('behaviour_logs')
      .update({
        safeguarding_acknowledged_at: new Date().toISOString(),
        safeguarding_acknowledged_by: world.schoolAdmin.id,
        safeguarding_note: 'Spoke to both families. Monitoring.',
      })
      .eq('id', logId)

    const { data } = await admin
      .from('behaviour_logs')
      .select('safeguarding_acknowledged_at, safeguarding_acknowledged_by')
      .eq('id', logId)
      .single()

    expect(data?.safeguarding_acknowledged_at).not.toBeNull()
    expect(data?.safeguarding_acknowledged_by).toBe(world.schoolAdmin.id)
  })
})

describe('after acknowledgement — the lock', () => {
  test('the teacher who logged it can no longer change the notes', async () => {
    const { error } = await world.verifiedEducator.db
      .from('behaviour_logs')
      .update({ notes: 'Rewritten after the administrator read it.' })
      .eq('id', logId)

    // Postgres reports no error. The row is simply not theirs to change any
    // more, which is why the assertion below is the one that matters.
    expect(error).toBeNull()
    expect(await noteOnRecord()).toBe('Corrected wording, same afternoon.')
  })

  test('nor can they un-flag it', async () => {
    await world.verifiedEducator.db
      .from('behaviour_logs')
      .update({ is_risk_flagged: false })
      .eq('id', logId)

    const { data } = await admin
      .from('behaviour_logs')
      .select('is_risk_flagged')
      .eq('id', logId)
      .single()

    expect(data?.is_risk_flagged).toBe(true)
  })

  test('nor can they clear the acknowledgement to get their edit back', async () => {
    // The obvious way round the lock: remove the thing that closed it.
    await world.verifiedEducator.db
      .from('behaviour_logs')
      .update({ safeguarding_acknowledged_at: null })
      .eq('id', logId)

    const { data } = await admin
      .from('behaviour_logs')
      .select('safeguarding_acknowledged_at')
      .eq('id', logId)
      .single()

    expect(data?.safeguarding_acknowledged_at).not.toBeNull()
  })

  test('nor can they hide it from the family by unsharing', async () => {
    await world.verifiedEducator.db
      .from('behaviour_logs')
      .update({ shared_with_parents: true })
      .eq('id', logId)

    const { data } = await admin
      .from('behaviour_logs')
      .select('shared_with_parents')
      .eq('id', logId)
      .single()

    expect(data?.shared_with_parents).toBe(false)
  })

  test('the administrator can still add to it', async () => {
    // The lock is on the person who wrote it, not on the record. Someone has
    // to be able to add an outcome later.
    await world.schoolAdmin.db
      .from('behaviour_logs')
      .update({ safeguarding_note: 'Reviewed again at the end of term.' })
      .eq('id', logId)

    const { data } = await admin
      .from('behaviour_logs')
      .select('safeguarding_note')
      .eq('id', logId)
      .single()

    expect(data?.safeguarding_note).toBe('Reviewed again at the end of term.')
  })

  test('nobody can delete the incident', async () => {
    // There is no delete policy on behaviour_logs at all. An acknowledged
    // safeguarding record that can be removed is not a record.
    await world.verifiedEducator.db.from('behaviour_logs').delete().eq('id', logId)
    await world.schoolAdmin.db.from('behaviour_logs').delete().eq('id', logId)

    const { data } = await admin
      .from('behaviour_logs')
      .select('id')
      .eq('id', logId)

    expect(data?.length).toBe(1)
  })
})
