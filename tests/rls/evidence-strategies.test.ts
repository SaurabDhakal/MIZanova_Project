import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  admin,
  buildSpecialistWorld,
  destroyWorld,
  type SpecialistWorld,
} from '../helpers/world'

/**
 * db/118 — the Evidence Database, FR12 and E02.
 *
 * WHAT MAKES THIS TABLE DIFFERENT FROM EVERY OTHER ONE HERE. It contains no
 * student, no school and no incident, which is why `select` is `using (true)`
 * — the only table in the schema that is. That is a deliberate widening and it
 * deserves a test that says so, because the next person to read the policy
 * will assume it is a mistake.
 *
 * The rest is the word "version-controlled" taken literally: nothing is ever
 * edited, a revision is a new row, and a trigger refuses anything else.
 */

let world: SpecialistWorld
let lineage: string

beforeAll(async () => {
  world = await buildSpecialistWorld()
  lineage = crypto.randomUUID()
}, 180_000)

afterAll(async () => {
  if (world) {
    await admin.from('evidence_strategies').delete().eq('lineage_id', lineage)
    await destroyWorld(world)
  }
}, 120_000)

const row = (over: Record<string, unknown> = {}) => ({
  lineage_id: lineage,
  behaviour_type: 'disruptive',
  title: 'Warn before transitions',
  body: 'Give a two-minute warning before the change of activity.',
  rationale: ['Turns an abrupt endpoint into a predictable countdown'],
  provenance: 'Practice guidance, NSW Department of Education',
  created_by: world.specialist.id,
  ...over,
})

describe('who may write to the evidence database', () => {
  test('a verified specialist may', async () => {
    const { data, error } = await world.specialist.db
      .from('evidence_strategies')
      .insert(row())
      .select('id, version, is_current')

    expect(error).toBeNull()
    expect(data?.[0]?.version).toBe(1)
    expect(data?.[0]?.is_current).toBe(true)
  })

  test('an unverified specialist may not', async () => {
    const { error } = await world.unverifiedSpecialist.db
      .from('evidence_strategies')
      .insert(row({ created_by: world.unverifiedSpecialist.id, title: 'Unverified' }))

    expect(error).not.toBeNull()
  })

  test('nor a teacher, however senior', async () => {
    const { error } = await world.verifiedEducator.db
      .from('evidence_strategies')
      .insert(row({ created_by: world.verifiedEducator.id, title: 'From a teacher' }))

    expect(error).not.toBeNull()
  })

  test('nor a specialist writing in somebody else’s name', async () => {
    const { error } = await world.specialist.db
      .from('evidence_strategies')
      .insert(row({ created_by: world.otherSpecialist.id, title: 'Forged' }))

    expect(error).not.toBeNull()
  })
})

describe('the library is readable by everyone signed in', () => {
  /*
   * The deliberate widening. These rows are general professional advice with
   * nobody's child in them, and E02 wants them available when the AI is
   * unreachable — including on a laptop with no connection, which is only safe
   * because there is nothing here to protect.
   */
  test('a teacher reads it', async () => {
    const { data, error } = await world.verifiedEducator.db
      .from('evidence_strategies')
      .select('id')
      .eq('lineage_id', lineage)

    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  test('and so does a parent', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('evidence_strategies')
      .select('id')
      .eq('lineage_id', lineage)

    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })
})

describe('a strategy is versioned, never edited', () => {
  test('changing the words is refused outright', async () => {
    const { error } = await world.specialist.db
      .from('evidence_strategies')
      .update({ body: 'Something different.' })
      .eq('lineage_id', lineage)

    // A trigger, not a policy: this must fail loudly rather than match no rows,
    // because a silent no-op would read as a saved edit.
    expect(error).not.toBeNull()
  })

  test('but a new version supersedes the old one', async () => {
    const { data: current } = await admin
      .from('evidence_strategies')
      .select('id, version')
      .eq('lineage_id', lineage)
      .eq('is_current', true)
      .single()

    const { error: freeError } = await world.specialist.db
      .from('evidence_strategies')
      .update({ is_current: false })
      .eq('id', current!.id)
    expect(freeError).toBeNull()

    const { error } = await world.specialist.db
      .from('evidence_strategies')
      .insert(row({ version: current!.version + 1, title: 'Warn before transitions (revised)' }))
    expect(error).toBeNull()

    const { data: all } = await admin
      .from('evidence_strategies')
      .select('version, is_current')
      .eq('lineage_id', lineage)
      .order('version')

    expect(all?.map((v) => v.is_current)).toEqual([false, true])
  })

  test('and two current versions of one strategy are impossible', async () => {
    const { error } = await world.specialist.db
      .from('evidence_strategies')
      .insert(row({ version: 99, title: 'A second live one' }))

    expect(error).not.toBeNull()
    expect(error?.code).toBe('23505')
  })
})
