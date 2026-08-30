import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * db/079 — articles and case studies.
 *
 * The audience rules are the Academy's and are asserted the same way. What is
 * different, and the reason this file exists separately, is the consent
 * constraint.
 *
 * A case study describes work with a named school and a real family. A CMS that
 * can publish "how we supported a Year 3 student with selective mutism at
 * Parramatta West" is a CMS that can identify a child, and nothing about a
 * writing tool would stop it. The constraint is what stops it, so the tests
 * that matter are the ones that try.
 */

let world: World
let forParents: string
let forEducators: string
let draft: string

const mk = async (
  title: string,
  audiences: string[],
  published: boolean,
  extra: Record<string, unknown> = {},
) => {
  const { data, error } = await admin
    .from('articles')
    .insert({
      title: `${title} ${world.runId}`,
      summary: 'Written by the articles suite.',
      body: 'Body text.',
      audiences,
      is_published: published,
      published_at: published ? new Date().toISOString() : null,
      ...extra,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

beforeAll(async () => {
  world = await buildWorld()
  forParents = await mk('Regulation at home', ['parent'], true)
  forEducators = await mk('Classroom transitions', ['educator'], true)
  draft = await mk('Half written', ['parent'], false)
}, 60_000)

afterAll(async () => {
  if (!world) return
  await admin.from('articles').delete().like('title', `%${world.runId}`)
  await destroyWorld(world)
}, 60_000)

describe('who an article reaches', () => {
  test('a parent sees one written for parents', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('articles')
      .select('id')

    expect(error).toBeNull()
    expect(data?.some((a) => a.id === forParents)).toBe(true)
  })

  test('a parent does not see one written for educators', async () => {
    const { data } = await world.guardianOfA.db.from('articles').select('id')

    expect(data?.some((a) => a.id === forEducators)).toBe(false)
  })

  test('nobody in the audience sees a draft', async () => {
    const { data } = await world.guardianOfA.db.from('articles').select('id')

    expect(data?.some((a) => a.id === draft)).toBe(false)
  })

  test('a platform admin sees drafts, because somebody has to write them', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('articles')
      .select('id')

    expect(error).toBeNull()
    expect(data?.some((a) => a.id === draft)).toBe(true)
  })

  test('only Special Miles may write one', async () => {
    const { error } = await world.schoolAdmin.db.from('articles').insert({
      title: `School wrote this ${world.runId}`,
      summary: 'Should be refused.',
      audiences: ['parent'],
    })

    expect(error).not.toBeNull()
  })

  test('a parent cannot edit one they can read', async () => {
    await world.guardianOfA.db
      .from('articles')
      .update({ title: 'Rewritten' })
      .eq('id', forParents)

    const after = await admin
      .from('articles')
      .select('title')
      .eq('id', forParents)
      .single()

    expect(after.data?.title).toContain('Regulation at home')
  })
})

describe('a case study cannot be published without a confirmation', () => {
  test('publishing one with consent_confirmed false is refused', async () => {
    const { error } = await admin.from('articles').insert({
      title: `Unconfirmed ${world.runId}`,
      summary: 'About a real family.',
      audiences: ['parent'],
      kind: 'case_study',
      is_published: true,
      published_at: new Date().toISOString(),
    })

    // The constraint, not the form. It holds whatever any screen does.
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/consent/i)
  })

  test('the same one publishes once it is confirmed', async () => {
    const id = await mk('Confirmed', ['parent'], true, {
      kind: 'case_study',
      consent_confirmed: true,
    })

    expect(id).toBeTruthy()
  })

  test('an unpublished case study may sit unconfirmed', async () => {
    // Drafting one before asking the family is ordinary — the constraint is
    // about reaching an audience, not about writing.
    const id = await mk('Draft case study', ['parent'], false, {
      kind: 'case_study',
    })

    expect(id).toBeTruthy()
  })

  test('a published one cannot have its confirmation taken back', async () => {
    const id = await mk('Live case study', ['parent'], true, {
      kind: 'case_study',
      consent_confirmed: true,
    })

    const { error } = await admin
      .from('articles')
      .update({ consent_confirmed: false })
      .eq('id', id)

    // Withdrawing the claim while it is still out would leave a story about a
    // real family published with nobody standing behind it.
    expect(error).not.toBeNull()
  })

  test('a plain ARTICLE publishes with no confirmation at all', async () => {
    // It is about nobody in particular, so the rule does not apply to it.
    const id = await mk('Just an article', ['parent'], true)

    expect(id).toBeTruthy()
  })
})
