import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * db/075 — the Academy.
 *
 * A CONTENT SYSTEM FAILS DIFFERENTLY FROM A RECORDS SYSTEM. Everywhere else in
 * this project the danger is one person reading another person's child. Here it
 * is two things:
 *
 *   a DRAFT reaching its audience before anybody finished writing it, and
 *   a course written for one audience reaching another.
 *
 * The second is not cosmetic. "Empowered Parenting" is written to be read by a
 * family; professional development is written about families, for staff. The
 * same platform carrying both means the audience list is a real boundary rather
 * than a filter for tidiness.
 */

let world: World
let publishedForParents: string
let publishedForEducators: string
let draftForParents: string

beforeAll(async () => {
  world = await buildWorld()

  const mk = async (
    title: string,
    audiences: string[],
    published: boolean,
  ): Promise<string> => {
    const { data, error } = await admin
      .from('courses')
      .insert({
        title: `${title} ${world.runId}`,
        summary: 'Written by the academy suite.',
        audiences,
        is_published: published,
        published_at: published ? new Date().toISOString() : null,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data.id as string
  }

  publishedForParents = await mk('Empowered Parenting', ['parent'], true)
  publishedForEducators = await mk('Inclusive classrooms', ['educator'], true)
  draftForParents = await mk('Half written', ['parent'], false)

  await admin.from('course_modules').insert([
    { course_id: publishedForParents, title: 'Getting started', sort_order: 1 },
    { course_id: publishedForParents, title: 'Regulation at home', sort_order: 2 },
    { course_id: draftForParents, title: 'Unfinished', sort_order: 1 },
  ])
}, 90_000)

afterAll(async () => {
  if (!world) return
  await admin.from('courses').delete().like('title', `%${world.runId}`)
  await destroyWorld(world)
}, 60_000)

describe('who a course reaches', () => {
  test('a parent sees one written for parents', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('courses')
      .select('id, title')

    expect(error).toBeNull()
    expect(data?.some((c) => c.id === publishedForParents)).toBe(true)
  })

  test('a parent does NOT see one written for educators', async () => {
    const { data } = await world.guardianOfA.db.from('courses').select('id')

    // Professional development is written ABOUT families, FOR staff. The
    // audience list is a boundary, not a convenience.
    expect(data?.some((c) => c.id === publishedForEducators)).toBe(false)
  })

  test('an educator does NOT see one written for parents', async () => {
    const { data } = await world.verifiedEducator.db.from('courses').select('id')

    expect(data?.some((c) => c.id === publishedForParents)).toBe(false)
  })

  test('nobody in the audience sees a draft', async () => {
    const { data } = await world.guardianOfA.db.from('courses').select('id')

    expect(data?.some((c) => c.id === draftForParents)).toBe(false)
  })

  test('a platform admin sees drafts, because somebody has to write them', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('courses')
      .select('id')

    expect(error).toBeNull()
    expect(data?.some((c) => c.id === draftForParents)).toBe(true)
  })

  test('a module is readable exactly when its course is', async () => {
    const visible = await world.guardianOfA.db
      .from('course_modules')
      .select('id, course_id')

    expect(visible.data?.some((m) => m.course_id === publishedForParents)).toBe(
      true,
    )
    // The draft's module must not leak even though the module row itself says
    // nothing about publication.
    expect(visible.data?.some((m) => m.course_id === draftForParents)).toBe(false)
  })

  test('only Special Miles may write a course', async () => {
    const { error } = await world.schoolAdmin.db.from('courses').insert({
      title: `School wrote this ${world.runId}`,
      summary: 'Should be refused.',
      audiences: ['parent'],
    })

    // A school authoring Academy content is a different product, and one where
    // "who vetted this" stops having an answer.
    expect(error).not.toBeNull()
  })

  test('an educator cannot edit a published course', async () => {
    const { error } = await world.verifiedEducator.db
      .from('courses')
      .update({ title: 'Rewritten' })
      .eq('id', publishedForEducators)
      .select('id')

    const after = await admin
      .from('courses')
      .select('title')
      .eq('id', publishedForEducators)
      .single()

    expect(error ?? after.data?.title).not.toBe('Rewritten')
    expect(after.data?.title).toContain('Inclusive classrooms')
  })
})

describe('enrolling and getting through it', () => {
  test('a parent can enrol themselves in a course for them', async () => {
    const { error } = await world.guardianOfA.db
      .from('course_enrolments')
      .insert({
        course_id: publishedForParents,
        profile_id: world.guardianOfA.id,
      })

    expect(error).toBeNull()
  })

  /*
   * The hole this closes: without the published-and-in-audience check on the
   * INSERT policy, anybody could enrol in a draft by id and then read its
   * modules through the enrolment.
   */
  test('nobody can enrol themselves in a draft', async () => {
    const { error } = await world.guardianOfA.db
      .from('course_enrolments')
      .insert({ course_id: draftForParents, profile_id: world.guardianOfA.id })

    expect(error).not.toBeNull()
  })

  test('nobody can enrol in a course for a different audience', async () => {
    const { error } = await world.guardianOfA.db
      .from('course_enrolments')
      .insert({
        course_id: publishedForEducators,
        profile_id: world.guardianOfA.id,
      })

    expect(error).not.toBeNull()
  })

  test('nobody can enrol somebody else', async () => {
    const { error } = await world.guardianOfA.db
      .from('course_enrolments')
      .insert({
        course_id: publishedForParents,
        profile_id: world.guardianOfB.id,
      })

    expect(error).not.toBeNull()
  })

  test('finishing every module completes the enrolment, in the database', async () => {
    const { data: enrolment } = await admin
      .from('course_enrolments')
      .select('id')
      .eq('course_id', publishedForParents)
      .eq('profile_id', world.guardianOfA.id)
      .single()

    const { data: modules } = await admin
      .from('course_modules')
      .select('id')
      .eq('course_id', publishedForParents)
      .order('sort_order')

    await world.guardianOfA.db
      .from('module_completions')
      .insert({ enrolment_id: enrolment!.id, module_id: modules![0].id })

    const half = await admin
      .from('course_enrolments')
      .select('completed_at')
      .eq('id', enrolment!.id)
      .single()
    expect(half.data?.completed_at).toBeNull()

    await world.guardianOfA.db
      .from('module_completions')
      .insert({ enrolment_id: enrolment!.id, module_id: modules![1].id })

    const full = await admin
      .from('course_enrolments')
      .select('completed_at')
      .eq('id', enrolment!.id)
      .single()

    // Computed by the trigger rather than by the browser, so a progress
    // dashboard cannot disagree with the tick a learner just saw.
    expect(full.data?.completed_at).not.toBeNull()
  })

  test('nobody can tick a module against somebody else’s enrolment', async () => {
    const { data: enrolment } = await admin
      .from('course_enrolments')
      .select('id')
      .eq('profile_id', world.guardianOfA.id)
      .limit(1)
      .single()

    const { data: modules } = await admin
      .from('course_modules')
      .select('id')
      .eq('course_id', publishedForParents)
      .limit(1)

    const { error } = await world.guardianOfB.db
      .from('module_completions')
      .insert({ enrolment_id: enrolment!.id, module_id: modules![0].id })

    // Writing progress against another person's name.
    expect(error).not.toBeNull()
  })

  test('a learner cannot see another learner’s progress', async () => {
    const { data } = await world.guardianOfB.db
      .from('course_enrolments')
      .select('profile_id')

    expect(data?.every((e) => e.profile_id === world.guardianOfB.id)).toBe(true)
  })

  test('a platform admin can see everyone’s, which is what a dashboard needs', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('course_enrolments')
      .select('profile_id')

    expect(error).toBeNull()
    expect(data?.some((e) => e.profile_id === world.guardianOfA.id)).toBe(true)
  })
})

/*
 * ---------------------------------------------------------------------------
 * CORRECTING A MODULE MUST NOT COST ANYBODY THEIR PROGRESS
 * ---------------------------------------------------------------------------
 * db/075 declares `module_completions.module_id ... on delete cascade`. Until
 * the Courses screen gained an edit control, fixing a typo in a module title
 * meant deleting the module — which silently took every completion of it with
 * them, and gave the replacement a new id so nothing came back.
 *
 * These two assert the difference the edit makes, in the order that makes it
 * obvious: an update leaves the completion alone, and a delete does not. The
 * second is not testing our code; it is pinning the cascade that made the
 * first one necessary, so that if somebody later "simplifies" the edit into a
 * delete-and-recreate the suite objects.
 */
describe('editing a module keeps progress, deleting one does not', () => {
  async function moduleWithACompletion() {
    const { data: mod } = await admin
      .from('course_modules')
      .insert({
        course_id: publishedForParents,
        title: 'Original title',
        body: 'Original body.',
        sort_order: 90,
      })
      .select('id')
      .single()

    /*
     * REUSED IF IT EXISTS. Earlier tests in this file already enrol this
     * guardian on this course, and one enrolment per person per course is the
     * point of the table — so inserting a second returns null data with an
     * error this helper originally threw away, and the failure surfaced three
     * lines later as "cannot read properties of null".
     */
    const existing = await admin
      .from('course_enrolments')
      .select('id')
      .eq('course_id', publishedForParents)
      .eq('profile_id', world.guardianOfA.id)
      .maybeSingle()

    let enrolmentId = existing.data?.id as string | undefined
    let created = false
    if (!enrolmentId) {
      const made = await admin
        .from('course_enrolments')
        .insert({ course_id: publishedForParents, profile_id: world.guardianOfA.id })
        .select('id')
        .single()
      if (made.error) throw new Error(made.error.message)
      enrolmentId = made.data.id
      created = true
    }

    const { error } = await admin
      .from('module_completions')
      .insert({ enrolment_id: enrolmentId, module_id: mod!.id })
    if (error) throw new Error(error.message)

    return { moduleId: mod!.id as string, enrolmentId: enrolmentId!, created }
  }

  async function completionsFor(moduleId: string) {
    const { count } = await admin
      .from('module_completions')
      .select('id', { count: 'exact', head: true })
      .eq('module_id', moduleId)
    return count ?? 0
  }

  test('an update leaves the completion attached', async () => {
    const { moduleId, enrolmentId, created } = await moduleWithACompletion()
    expect(await completionsFor(moduleId)).toBe(1)

    const { data, error } = await admin
      .from('course_modules')
      .update({ title: 'Corrected title' })
      .eq('id', moduleId)
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    // The id never moved, so the foreign key never noticed.
    expect(await completionsFor(moduleId)).toBe(1)

    if (created) await admin.from('course_enrolments').delete().eq('id', enrolmentId)
    await admin.from('course_modules').delete().eq('id', moduleId)
  })

  test('a delete takes it with them — which is why the edit exists', async () => {
    const { moduleId, enrolmentId, created } = await moduleWithACompletion()
    expect(await completionsFor(moduleId)).toBe(1)

    await admin.from('course_modules').delete().eq('id', moduleId)

    expect(await completionsFor(moduleId)).toBe(0)

    if (created) await admin.from('course_enrolments').delete().eq('id', enrolmentId)
  })
})
