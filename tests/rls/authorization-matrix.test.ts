import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, makeActor, type Actor } from '../helpers/world'

/**
 * CAN AN ACCOUNT WITH NO SCHOOL READ ANY CHILD, ANYWHERE.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS WHEN THERE ARE ALREADY THIRTY-EIGHT SUITES
 * ---------------------------------------------------------------------------
 * The others are vertical: one file per feature, asserting that the feature's
 * own promises hold. That is the right shape for a feature and the wrong shape
 * for this question, which belongs to no feature and so was asked nowhere. A
 * production audit on 8 September could not answer it from the suite — not
 * because the answer was wrong, but because nothing had asked.
 *
 * ---------------------------------------------------------------------------
 * ONE ACCOUNT, AND THAT IS THE WHOLE DESIGN
 * ---------------------------------------------------------------------------
 * The first version of this file built a specialist world and added a student
 * and an individual to it — eleven actors, and a printed matrix of every role
 * against every table. It was better evidence and it broke the suite: the full
 * run went from 456s to 927s and three unrelated files failed inside
 * `signInWithRetry`, because Supabase's free tier began refusing the burst.
 *
 * `world.ts` had already written down that this would happen, about a smaller
 * increase: "three extra actors here would be eighteen extra sign-ups and
 * sign-ins across a full run — enough to push the free tier's auth endpoint
 * into refusing the burst, which it did the moment these were added to
 * buildWorld itself."
 *
 * So the horizontal sweep is kept and the cost is not. It needs no world at
 * all: an individual with no school should see nothing whether or not a
 * fixture exists, and running it against the real database — 44 students, 200
 * behaviour logs, 35 consents, none of them this account's business — is a
 * stronger claim than running it against three students somebody just made.
 *
 * The roles a world WOULD have supplied are each covered vertically already:
 * guardians in parent-visibility, unverified staff in staff-vetting, students
 * in student-account, school admins in student-visibility.
 *
 * ---------------------------------------------------------------------------
 * EVERY EXPECTATION IS ZERO, NEVER "SOME"
 * ---------------------------------------------------------------------------
 * "The teacher can see three logs" is a fact about the fixture and breaks
 * whenever the fixture changes. "This account sees none of them" is a fact
 * about the product and must never change. A matrix of exact counts gets
 * re-baselined by whoever it inconveniences; a matrix of zeroes cannot be.
 */

let individual: Actor

/** Every table whose rows are about a named child. */
const CHILD_TABLES = [
  'students',
  'behaviour_logs',
  'ai_strategies',
  'home_observations',
  'goals',
  'goal_milestones',
  'consents',
  'student_guardians',
  'student_educators',
  'iep_documents',
  'iep_plans',
  'specialist_appointments',
  'specialist_sessions',
  'invoices',
  'goal_review_requests',
  'student_access_events',
] as const

/** Tables that answer only to the people who govern the platform. */
const GOVERNANCE_TABLES = [
  'admin_audit_events',
  'ai_control_events',
  'platform_invoices',
  'platform_subscriptions',
] as const

const visibleTo = async (actor: Actor, table: string): Promise<number | 'refused'> => {
  const { data, error } = await actor.db.from(table).select('*').limit(50)
  if (error) return 'refused'
  return (data ?? []).length
}

beforeAll(async () => {
  // No school, no membership, no caseload, no guardian link. db/088's whole
  // claim is that such an account can reach no child, and `makeActor` sets the
  // role with the service key because `handle_new_user` will not accept it
  // from signup metadata.
  const runId = crypto.randomUUID().slice(0, 8)
  individual = await makeActor('parent', runId, 'matrix', null, false, 'individual')
}, 120_000)

afterAll(async () => {
  if (!individual) return
  await admin.from('memberships').delete().eq('profile_id', individual.id)
  await admin.auth.admin.deleteUser(individual.id)
}, 120_000)

describe('an account with no school reads no child, in any table', () => {
  for (const table of CHILD_TABLES) {
    test(`sees nothing in ${table}`, async () => {
      const n = await visibleTo(individual, table)
      expect(n === 0 || n === 'refused').toBe(true)
    })
  }
})

describe('nor anything the platform governs itself by', () => {
  for (const table of GOVERNANCE_TABLES) {
    test(`sees nothing in ${table}`, async () => {
      const n = await visibleTo(individual, table)
      expect(n === 0 || n === 'refused').toBe(true)
    })
  }
})

describe('and the account is real, so the zeroes mean something', () => {
  /*
   * THE TEST THAT STOPS ALL THE OTHERS BEING VACUOUS. Every expectation above
   * is that a query returns nothing — which is exactly what a broken sign-in,
   * a wrong key or an account that was never created would also produce.
   *
   * This is the same fault the AI quota check, the health endpoint and the CI
   * secret step each had once in this repository: reporting success without
   * having looked. So: the account exists, it is signed in, and it can read
   * the one thing it IS entitled to.
   */
  test('it is signed in, and reads the public price list', async () => {
    const { data: me } = await individual.db.auth.getUser()
    expect(me.user?.id).toBe(individual.id)

    const { data, error } = await individual.db
      .from('individual_plan_public')
      .select('name, price_cents')
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  test('and the tables it saw nothing in are not simply empty', async () => {
    // Read as the service key, which RLS does not apply to. If these are empty
    // too, every zero above proves nothing about permissions.
    const { count: students } = await admin
      .from('students')
      .select('*', { count: 'exact', head: true })
    const { count: logs } = await admin
      .from('behaviour_logs')
      .select('*', { count: 'exact', head: true })

    expect(students ?? 0).toBeGreaterThan(0)
    expect(logs ?? 0).toBeGreaterThan(0)
  })
})
