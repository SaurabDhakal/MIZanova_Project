import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * db/080 — Special Miles' own files.
 *
 * THE READ IS DELIBERATELY WIDE, SO THE WRITE IS WHAT MATTERS. Every other
 * storage rule in this project narrows who may READ, because the material is
 * about children. This bucket holds the opposite kind of thing — course
 * toolkits, article images, downloads written for publication — so every signed
 * in account may read it, and the only question worth asserting is who may put
 * something there.
 *
 * That inversion is exactly why the tests below also check the OTHER bucket
 * still behaves. A file that adds a wide-open bucket beside a tightly held one
 * fails by loosening the wrong one, and it would not look like a failure.
 */

let world: World
let fileId: string

beforeAll(async () => {
  world = await buildWorld()

  const { data, error } = await admin
    .from('library_files')
    .insert({
      title: `Transition toolkit ${world.runId}`,
      description: 'A one-page handout.',
      storage_path: `${world.runId}/toolkit.pdf`,
      mime_type: 'application/pdf',
      size_bytes: 12345,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  fileId = data.id as string
}, 60_000)

afterAll(async () => {
  if (!world) return
  await admin.from('library_files').delete().like('title', `%${world.runId}`)
  await destroyWorld(world)
}, 60_000)

describe('reading', () => {
  test('a parent can see a published file', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('library_files')
      .select('id, title')

    expect(error).toBeNull()
    expect(data?.some((f) => f.id === fileId)).toBe(true)
  })

  test('an educator can too', async () => {
    const { data, error } = await world.verifiedEducator.db
      .from('library_files')
      .select('id')

    expect(error).toBeNull()
    expect(data?.some((f) => f.id === fileId)).toBe(true)
  })
})

describe('writing — the only question that matters here', () => {
  test('a school admin cannot add one', async () => {
    const { error } = await world.schoolAdmin.db.from('library_files').insert({
      title: `School uploaded this ${world.runId}`,
      storage_path: `${world.runId}/nope.pdf`,
    })

    expect(error).not.toBeNull()
  })

  test('an educator cannot add one', async () => {
    const { error } = await world.verifiedEducator.db
      .from('library_files')
      .insert({
        title: `Teacher uploaded this ${world.runId}`,
        storage_path: `${world.runId}/nope2.pdf`,
      })

    expect(error).not.toBeNull()
  })

  test('a parent cannot delete one', async () => {
    await world.guardianOfA.db.from('library_files').delete().eq('id', fileId)

    const after = await admin
      .from('library_files')
      .select('id')
      .eq('id', fileId)
      .maybeSingle()

    expect(after.data?.id).toBe(fileId)
  })

  test('a parent cannot rename one', async () => {
    await world.guardianOfA.db
      .from('library_files')
      .update({ title: 'Rewritten' })
      .eq('id', fileId)

    const after = await admin
      .from('library_files')
      .select('title')
      .eq('id', fileId)
      .single()

    expect(after.data?.title).toContain('Transition toolkit')
  })

  test('a platform admin can', async () => {
    const { error } = await world.platformAdmin.db
      .from('library_files')
      .update({ description: 'Updated by Special Miles.' })
      .eq('id', fileId)
      .select('id')

    expect(error).toBeNull()
  })
})

describe('the other bucket was not loosened', () => {
  /*
   * The failure mode of adding a wide-open bucket beside a tightly held one:
   * the new rules are right and the old ones quietly are not. db/030's bucket
   * holds practice videos of identifiable children.
   */
  /*
   * `storage.buckets.public` IS NOT ASSERTED HERE, deliberately. PostgREST does
   * not expose the storage schema, so a test reaching for it can only end up
   * asserting something trivially true while reading like proof — which is
   * worse than no test. It is checked directly in db/080's own verification
   * block, against the database.
   *
   * What CAN be asserted from here is the thing that would actually go wrong:
   * that the school-scoped rules still hold.
   */

  test('a parent still cannot read another school’s resources', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('resources')
      .select('school_id')

    expect(error).toBeNull()
    // Whatever comes back, none of it belongs to the other school.
    expect(
      (data ?? []).every((r) => r.school_id !== world.otherSchoolId),
    ).toBe(true)
  })

  test('an educator cannot read a resource at a school they are not in', async () => {
    const { data: mine } = await admin
      .from('resources')
      .select('id, school_id')
      .eq('school_id', world.otherSchoolId)

    const { data } = await world.verifiedEducator.db
      .from('resources')
      .select('id')

    const visible = new Set((data ?? []).map((r) => r.id))
    expect((mine ?? []).every((r) => !visible.has(r.id))).toBe(true)
  })
})
