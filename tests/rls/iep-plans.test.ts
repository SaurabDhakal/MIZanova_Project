import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * Individual Education Plans (db/054).
 *
 * An IEP is the most consequential record in this product: it is what a school
 * agreed, with a family, about a child. So the things worth asserting are not
 * "can it be saved" but the four promises the paper form makes implicitly and
 * software has to make explicitly.
 *
 *   a draft is the school's       a half-written plan is a school thinking out
 *                                 loud about a child; a parent reading it
 *                                 before the meeting is how a meeting goes bad
 *
 *   agreement freezes it          a record a family agreed to must not quietly
 *                                 change afterwards, or agreeing meant nothing
 *
 *   you confirm for yourself      an admin ticking the box on a parent's behalf
 *                                 makes the whole record worthless
 *
 *   the freeze is not a trap      it must still be possible to remove a student
 *                                 who has an agreed plan
 *
 * That last one is here because the first draft of the guard trigger would have
 * blocked it: the cascade from deleting a student fires the goal guard, which
 * would have refused with a message about editing an agreed plan — true of
 * nothing the caller did.
 */

let world: World

beforeAll(async () => {
  world = await buildWorld()
}, 60_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 60_000)

/** A plan with one goal on it, created with the service key so the tests are
 *  about the policies rather than about the setup. */
async function makePlan(
  studentId: string,
  status: 'draft' | 'agreed' = 'draft',
) {
  const { data: plan, error } = await admin
    .from('iep_plans')
    .insert({
      student_id: studentId,
      baseline: 'Settles quickly at drop-off. Enjoys construction play.',
      home_languages: 'Nepali, English',
      proposed_review_date: '2026-12-01',
    })
    .select('id')
    .single()
  if (error) throw error

  const { data: goal, error: goalError } = await admin
    .from('iep_goals')
    .insert({
      plan_id: plan.id,
      area_of_concern: 'Self help',
      long_term_goal:
        'By December, put on their own jacket unaided at 4 of 5 outdoor times.',
      short_term_goal:
        'By September, find both sleeves with one verbal prompt.',
      strategies: 'Visual sequence card by the door. Extra two minutes.',
    })
    .select('id')
    .single()
  if (goalError) throw goalError

  // Agreed AFTER the goal exists, because the point of agreement is that it
  // stops the goals changing.
  if (status === 'agreed') {
    const { error: agreeError } = await admin
      .from('iep_plans')
      .update({ status: 'agreed' })
      .eq('id', plan.id)
    if (agreeError) throw agreeError
  }

  return { planId: plan.id as string, goalId: goal.id as string }
}

describe('a draft belongs to the school', () => {
  test('a guardian cannot see a plan that is still being drafted', async () => {
    const { planId } = await makePlan(world.childA, 'draft')

    const { data } = await world.guardianOfA.db
      .from('iep_plans')
      .select('id')
      .eq('id', planId)

    expect(data).toEqual([])
  })

  test('the same guardian sees it the moment it is agreed', async () => {
    const { planId } = await makePlan(world.childA, 'agreed')

    const { data } = await world.guardianOfA.db
      .from('iep_plans')
      .select('id, baseline')
      .eq('id', planId)

    expect(data?.length).toBe(1)
    expect(data?.[0].baseline).toContain('construction play')
  })

  test("a guardian never sees another family's plan", async () => {
    const { planId } = await makePlan(world.childB, 'agreed')

    const { data } = await world.guardianOfA.db
      .from('iep_plans')
      .select('id')
      .eq('id', planId)

    expect(data).toEqual([])
  })

  test('staff see their own drafts, because they are writing them', async () => {
    const { planId } = await makePlan(world.childA, 'draft')

    const { data } = await world.verifiedEducator.db
      .from('iep_plans')
      .select('id')
      .eq('id', planId)

    expect(data?.length).toBe(1)
  })
})

describe('agreement freezes the plan', () => {
  test('agreeing stamps the moment, and the client does not supply it', async () => {
    const { planId } = await makePlan(world.childA, 'agreed')

    const { data } = await admin
      .from('iep_plans')
      .select('agreed_at')
      .eq('id', planId)
      .single()

    expect(data?.agreed_at).toBeTruthy()
  })

  test('the wording of an agreed plan cannot be rewritten', async () => {
    const { planId } = await makePlan(world.childA, 'agreed')

    const { error } = await world.verifiedEducator.db
      .from('iep_plans')
      .update({ baseline: 'Something entirely different.' })
      .eq('id', planId)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/cannot be changed/i)
  })

  test('a goal on an agreed plan cannot be edited', async () => {
    const { planId, goalId } = await makePlan(world.childA, 'agreed')
    expect(planId).toBeTruthy()

    const { error } = await world.verifiedEducator.db
      .from('iep_goals')
      .update({ short_term_goal: 'Moved the goalposts.' })
      .eq('id', goalId)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/agreed plan/i)
  })

  test('a goal cannot be added to an agreed plan either', async () => {
    const { planId } = await makePlan(world.childA, 'agreed')

    const { error } = await world.verifiedEducator.db.from('iep_goals').insert({
      plan_id: planId,
      area_of_concern: 'Snuck in later',
      long_term_goal: 'x',
      short_term_goal: 'y',
    })

    expect(error).not.toBeNull()
  })

  test('a draft is still freely editable — the freeze is agreement, not age', async () => {
    const { goalId } = await makePlan(world.childA, 'draft')

    const { error } = await world.verifiedEducator.db
      .from('iep_goals')
      .update({ short_term_goal: 'Refined after talking to the family.' })
      .eq('id', goalId)

    expect(error).toBeNull()
  })

  test('the review can still be recorded — that is the point of the meeting', async () => {
    const { goalId } = await makePlan(world.childA, 'agreed')

    const { error } = await world.verifiedEducator.db
      .from('iep_goal_reviews')
      .insert({
        iep_goal_id: goalId,
        outcome: 'partially_met',
        comment: 'Finds one sleeve reliably. Second still needs a hand.',
        reviewed_by: world.verifiedEducator.id,
      })

    expect(error).toBeNull()
  })
})

describe('the freeze is not a trap', () => {
  test('a working goal an agreed plan points at can still be deleted', async () => {
    const { data: goal } = await admin
      .from('goals')
      .insert({
        student_id: world.childA,
        title: 'A goal the plan will reference',
        description: 'Linked to an area of concern, then deleted.',
      })
      .select('id')
      .single()

    const { planId, goalId } = await makePlan(world.childA, 'draft')
    await admin
      .from('iep_goals')
      .update({ goal_id: goal!.id })
      .eq('id', goalId)
    await admin.from('iep_plans').update({ status: 'agreed' }).eq('id', planId)

    // `iep_goals.goal_id` is `on delete set null`, so this makes Postgres
    // UPDATE the frozen row. Before db/057 the guard refused it and the delete
    // failed with "The goals on an agreed plan cannot be changed" — a message
    // about a plan, to somebody who deleted a goal.
    const { error } = await admin.from('goals').delete().eq('id', goal!.id)
    expect(error).toBeNull()

    const { data: after } = await admin
      .from('iep_goals')
      .select('goal_id, area_of_concern')
      .eq('id', goalId)
      .single()
    expect(after?.goal_id).toBeNull()
    // The agreement itself is untouched.
    expect(after?.area_of_concern).toBe('Self help')
  })

  test('the exemption cannot be used to re-point an agreed plan', async () => {
    const { data: other } = await admin
      .from('goals')
      .insert({
        student_id: world.childA,
        title: 'Somewhere else entirely',
        description: 'A goal the plan was never agreed against.',
      })
      .select('id')
      .single()

    const { planId, goalId } = await makePlan(world.childA, 'agreed')
    expect(planId).toBeTruthy()

    // Null is exempt because it is the database tidying a dangling reference.
    // A different goal is somebody changing what was agreed.
    const { error } = await admin
      .from('iep_goals')
      .update({ goal_id: other!.id })
      .eq('id', goalId)

    expect(error).not.toBeNull()
  })

  test('a student with an agreed plan can still be removed', async () => {
    // A throwaway child, because this test destroys the row it works on.
    const { data: student, error: makeError } = await admin
      .from('students')
      .insert({
        school_id: world.schoolId,
        first_name: 'Cascade',
        last_name: `Test ${world.runId}`,
      })
      .select('id')
      .single()
    expect(makeError).toBeNull()

    await makePlan(student!.id, 'agreed')

    const { error } = await admin.from('students').delete().eq('id', student!.id)

    // Without the `if not found` branch in the goal guard, this fails with
    // "The goals on an agreed plan cannot be changed" — a refusal about
    // something the caller never attempted.
    expect(error).toBeNull()
  })
})

describe('confirmation is first person only', () => {
  test('a guardian can confirm an agreed plan themselves', async () => {
    const { planId } = await makePlan(world.childA, 'agreed')

    const { error } = await world.guardianOfA.db
      .from('iep_plan_confirmations')
      .insert({
        plan_id: planId,
        profile_id: world.guardianOfA.id,
        as_guardian: true,
      })

    expect(error).toBeNull()
  })

  test('a school admin cannot confirm on a parent’s behalf', async () => {
    const { planId } = await makePlan(world.childA, 'agreed')

    const { error } = await world.schoolAdmin.db
      .from('iep_plan_confirmations')
      .insert({
        plan_id: planId,
        profile_id: world.guardianOfA.id,
        as_guardian: true,
      })

    expect(error).not.toBeNull()
  })

  test('nobody confirms a draft, because nobody has been shown one', async () => {
    const { planId } = await makePlan(world.childA, 'draft')

    const { error } = await world.guardianOfA.db
      .from('iep_plan_confirmations')
      .insert({
        plan_id: planId,
        profile_id: world.guardianOfA.id,
        as_guardian: true,
      })

    expect(error).not.toBeNull()
  })
})

/*
 * WHAT THE FAMILY'S OWN SCREEN ACTUALLY READS.
 *
 * The tests above prove a guardian may see the PLAN ROW. Until now nothing
 * asked whether they may see what is written on it, because no family screen
 * existed to read it — the plan editor and its routes were staff-only, so
 * db/054's family half had never been fetched by anything.
 *
 * These four are the queries FamilyIepPlans and IepAgreement make. Had
 * `iep_goals_select` been scoped to staff the way its sibling write policy is,
 * a parent would have opened their child's plan and been shown a heading, a
 * date and nothing else — an empty plan reading exactly like a plan with no
 * goals in it.
 */
describe('the plan as the family reads it', () => {
  test('a guardian reads the goals on their child’s agreed plan', async () => {
    const { planId, goalId } = await makePlan(world.childA, 'agreed')

    const { data, error } = await world.guardianOfA.db
      .from('iep_goals')
      .select('id, long_term_goal, strategies')
      .eq('plan_id', planId)

    expect(error).toBeNull()
    expect(data?.some((g) => g.id === goalId)).toBe(true)
  })

  test('and the reviews written against them', async () => {
    const { planId, goalId } = await makePlan(world.childA, 'agreed')
    const { error: reviewError } = await admin.from('iep_goal_reviews').insert({
      iep_goal_id: goalId,
      outcome: 'partially_met',
      comment: 'Finds one sleeve reliably now.',
      reviewed_on: '2026-09-01',
    })
    expect(reviewError).toBeNull()

    const { data } = await world.guardianOfA.db
      .from('iep_goals')
      .select('id, iep_goal_reviews ( outcome )')
      .eq('plan_id', planId)

    // The review is the half of the plan that says whether it worked, and a
    // family being shown goals without outcomes would read as no progress.
    expect(
      (data?.[0] as unknown as { iep_goal_reviews: { outcome: string }[] })
        ?.iep_goal_reviews?.[0]?.outcome,
    ).toBe('partially_met')
  })

  test('a guardian sees who has confirmed their child’s plan', async () => {
    const { planId } = await makePlan(world.childA, 'agreed')
    const { error: insertError } = await world.guardianOfA.db
      .from('iep_plan_confirmations')
      .insert({
        plan_id: planId,
        profile_id: world.guardianOfA.id,
        as_guardian: true,
      })
    expect(insertError).toBeNull()

    const { data, error } = await world.guardianOfA.db
      .from('iep_plan_confirmations')
      .select('profile_id, as_guardian')
      .eq('plan_id', planId)

    // Reading it back is what lets the screen say "you have agreed" instead of
    // offering the button a second time and failing on the unique constraint.
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].as_guardian).toBe(true)
  })

  test('but no goals from a plan still being drafted', async () => {
    const { planId } = await makePlan(world.childA, 'draft')

    const { data } = await world.guardianOfA.db
      .from('iep_goals')
      .select('id')
      .eq('plan_id', planId)

    // iep_goals_select carries no student check of its own — it asks whether
    // the reader can see the PLAN. That inheritance is the whole security of
    // the goal, so it is asserted rather than assumed.
    expect(data ?? []).toEqual([])
  })
})

describe('the support schedule', () => {
  test('the weekly total is counted by the database, not added up by hand', async () => {
    const { planId } = await makePlan(world.childA, 'draft')

    const { error } = await admin.from('iep_support_sessions').insert([
      { plan_id: planId, weekday: 'monday', staff_name: 'A. Rai', hours: 1.5 },
      { plan_id: planId, weekday: 'monday', staff_name: 'J. Blake', hours: 0.75 },
      { plan_id: planId, weekday: 'wednesday', staff_name: 'A. Rai', hours: 2 },
    ])
    expect(error).toBeNull()

    const { data } = await admin
      .from('iep_support_totals')
      .select('hours_per_week, days_covered, sessions')
      .eq('plan_id', planId)
      .single()

    expect(Number(data?.hours_per_week)).toBeCloseTo(4.25)
    expect(data?.days_covered).toBe(2)
    expect(data?.sessions).toBe(3)
  })

  /*
   * THE VIEW IS A SECOND DOOR INTO THE SAME ROOM, and the first version of this
   * suite only tested the first one. `iep_support_totals` aggregates the very
   * rows the test below protects, and a Postgres view without
   * `security_invoker = true` runs as its OWNER — bypassing RLS on everything
   * it selects from. Granted to `authenticated`, that is every signed-in user
   * on the platform reading every school's staffing hours.
   *
   * The table test passed the whole time. It was measuring the wrong door.
   */
  test('the totals VIEW is not a way around the table policy', async () => {
    const { planId } = await makePlan(world.childB, 'agreed')
    await admin
      .from('iep_support_sessions')
      .insert({ plan_id: planId, weekday: 'monday', staff_name: 'A. Rai', hours: 3 })

    // guardianOfA has no connection to childB at all.
    const { data } = await world.guardianOfA.db
      .from('iep_support_totals')
      .select('plan_id, hours_per_week')
      .eq('plan_id', planId)

    expect(data ?? []).toEqual([])
  })

  test('a guardian cannot read the staffing roster', async () => {
    const { planId } = await makePlan(world.childA, 'agreed')
    await admin
      .from('iep_support_sessions')
      .insert({ plan_id: planId, weekday: 'friday', staff_name: 'A. Rai', hours: 1 })

    const { data } = await world.guardianOfA.db
      .from('iep_support_sessions')
      .select('id')
      .eq('plan_id', planId)

    // Other people's working hours are the school's to manage.
    expect(data).toEqual([])
  })

  test('a day of support cannot be recorded as a typo of 80 hours', async () => {
    const { planId } = await makePlan(world.childA, 'draft')

    const { error } = await admin
      .from('iep_support_sessions')
      .insert({ plan_id: planId, weekday: 'tuesday', staff_name: 'A. Rai', hours: 80 })

    expect(error).not.toBeNull()
  })
})
