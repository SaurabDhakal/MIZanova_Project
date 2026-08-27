import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { PUBLISHABLE_KEY, SERVICE_KEY, SUPABASE_URL } from './env'

/**
 * A known, disposable world to test Row-Level Security against.
 *
 * WHY IT BUILDS ITS OWN DATA. These tests run against the same Supabase
 * project as everything else — there is only one (see §2.4 of the
 * architecture review). Reusing the seeded accounts would mean tests that
 * break when somebody edits a student by hand, and worse, tests that could
 * damage work in progress. So each run creates a school nobody else touches
 * and deletes it afterwards.
 *
 * WHY PASSWORDS ARE RANDOM PER RUN. A fixed test password committed to the
 * repository is a real account with a known password on a real project. These
 * exist only in memory for the length of one run, and the accounts are gone
 * before it ends.
 */

export const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** A client that is nobody until it signs in. Each actor gets its own. */
function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type Actor = {
  id: string
  email: string
  /** Signed in, and therefore subject to RLS exactly as a browser would be. */
  db: SupabaseClient
}

export type World = {
  runId: string
  schoolId: string
  otherSchoolId: string
  childA: string
  childB: string
  outsiderChild: string
  /** A log about childA that has NOT been shared with parents. */
  privateLogId: string
  verifiedEducator: Actor
  unverifiedEducator: Actor
  guardianOfA: Actor
  guardianOfB: Actor
  schoolAdmin: Actor
  platformAdmin: Actor
}

/**
 * The world plus a specialist team, for the suites that need one.
 *
 * SEPARATE BECAUSE ACCOUNTS ARE NOT FREE. Every suite builds its own world, so
 * three extra actors here would be eighteen extra sign-ups and sign-ins across
 * a full run — enough to push the free tier's auth endpoint into refusing the
 * burst, which it did the moment these were added to buildWorld itself. Only
 * the suite that tests db/028 pays for them.
 */
export type SpecialistWorld = World & {
  /** Carries ChildA on their caseload. Writes the session records. */
  specialist: Actor
  /** Also on ChildA's caseload. A colleague — may read, may not rewrite. */
  otherSpecialist: Actor
  /** Assigned to ChildA but never verified by the school. */
  unverifiedSpecialist: Actor
}

/**
 * Exported so a suite can add somebody the standard world does not have — an
 * account with no school, for testing what happens when they accept an
 * invitation. Reused rather than reimplemented: this function also creates the
 * membership db/039 requires, and a second copy would drift from that.
 */
export async function makeActor(
  role: 'educator' | 'parent' | 'specialist',
  runId: string,
  label: string,
  schoolId: string | null,
  verified: boolean,
  /**
   * Set after creation, by the service key.
   *
   * `handle_new_user` accepts only the three self-signup roles and silently
   * downgrades anything else to parent — which is the point of it. School
   * admins are made by running SQL deliberately, so the tests make them the
   * same way rather than pretending signup can.
   */
  /*
   * 'student' joins these for the same reason the other two are here: db/074
   * adds the role, and `handle_new_user` accepts only the three self-signup
   * roles — a child does not sign themselves up, the school links the account.
   */
  promoteTo?: 'school_admin' | 'platform_admin' | 'student',
): Promise<Actor> {
  const email = `rls-${runId}-${label}@mizanova-test.invalid`
  const password = randomBytes(18).toString('base64url')

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    // No mail is sent, and the address is deliberately at .invalid — a
    // reserved TLD that can never resolve, so a stray email cannot reach a
    // real inbox.
    email_confirm: true,
    user_metadata: { first_name: label, last_name: 'Test', role },
  })
  if (error) throw new Error(`Could not create ${label}: ${error.message}`)

  const id = data.user.id

  /**
   * THE ROLE IS SET HERE, ALWAYS — never left to the signup metadata.
   *
   * Since db/044 `handle_new_user` ignores whatever role a browser claims and
   * makes everybody a parent, because staff arrive by invitation. That is the
   * production path, and this used to lean on the old behaviour: passing
   * `role: 'educator'` in `user_metadata` and expecting the trigger to honour
   * it. After db/044 every test educator would have quietly been a parent.
   *
   * Setting it explicitly with the service key is also simply more honest. It
   * is what `redeem_invitation` does, and what onboarding a school does.
   */
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      school_id: schoolId,
      is_verified: verified,
      role: promoteTo ?? role,
    })
    .eq('id', id)
  if (profileError) throw new Error(profileError.message)

  /**
   * A MEMBERSHIP, because db/039 made one necessary.
   *
   * `my_role()` no longer trusts profiles.role on its own — it checks the
   * pointer against a live membership, so a staff member whose membership ends
   * loses access on the next request rather than keeping it forever. Setting
   * school_id here without a membership produces an account that is an
   * educator on paper and nobody in practice.
   *
   * In production this row is written by redeem_invitation. Here it is written
   * directly, for the same reason school_id and is_verified are: the world is
   * built with the service key rather than by clicking through signup.
   *
   * Parents and platform admins get none, deliberately. A parent belongs to a
   * child through student_guardians; a platform admin belongs to nothing.
   */
  const effectiveRole = promoteTo ?? role
  if (
    schoolId &&
    (effectiveRole === 'educator' ||
      effectiveRole === 'specialist' ||
      effectiveRole === 'school_admin')
  ) {
    const { error: membershipError } = await admin.from('memberships').insert({
      profile_id: id,
      organisation_id: schoolId,
      role: effectiveRole,
    })
    if (membershipError) {
      throw new Error(`Could not give ${label} a membership: ${membershipError.message}`)
    }
  }

  const db = anonClient()
  await signInWithRetry(db, email, password, label)

  return { id, email, db }
}

/**
 * Sign in, waiting out Supabase's auth rate limit rather than failing on it.
 *
 * Every suite builds its own world, so a full run signs in dozens of times in
 * about a minute. The project sits on the free tier, whose auth endpoint
 * refuses bursts — and it refuses them with "Request rate limit reached",
 * which surfaces as an exception inside beforeAll. Vitest then reports the
 * whole file as failed with every test SKIPPED, so the output reads like a
 * broken suite rather than a busy endpoint. That cost a confusing round of
 * "which policy did I break?" the first time it happened.
 *
 * Bounded on purpose. Three attempts, growing waits, then a real failure — a
 * retry loop that never gives up would turn a genuinely wrong password into a
 * hang.
 */
async function signInWithRetry(
  db: SupabaseClient,
  email: string,
  password: string,
  label: string,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await db.auth.signInWithPassword({ email, password })
    if (!error) return

    const rateLimited = /rate limit/i.test(error.message)
    if (!rateLimited || attempt === 2) {
      throw new Error(`Could not sign in ${label}: ${error.message}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)))
  }
}

export async function buildWorld(): Promise<World> {
  // Anything a previous run left behind goes first, so a crash never
  // accumulates and a rerun is never affected by the last attempt.
  await cleanupStrays()

  const runId = randomUUID().slice(0, 8)

  const { data: schools, error: schoolError } = await admin
    .from('schools')
    .insert([
      { name: `RLS Test School ${runId}` },
      { name: `RLS Other School ${runId}` },
    ])
    .select('id')
  if (schoolError) throw new Error(schoolError.message)

  const schoolId = schools[0].id
  const otherSchoolId = schools[1].id

  const { data: students, error: studentError } = await admin
    .from('students')
    .insert([
      { school_id: schoolId, first_name: 'ChildA', last_name: 'Alpha' },
      { school_id: schoolId, first_name: 'ChildB', last_name: 'Beta' },
      { school_id: otherSchoolId, first_name: 'Outsider', last_name: 'Gamma' },
    ])
    .select('id')
  if (studentError) throw new Error(studentError.message)

  const [childA, childB, outsiderChild] = students.map((s) => s.id)

  const verifiedEducator = await makeActor('educator', runId, 'educator', schoolId, true)
  const unverifiedEducator = await makeActor('educator', runId, 'newteacher', schoolId, false)
  const guardianOfA = await makeActor('parent', runId, 'parenta', null, false)
  const guardianOfB = await makeActor('parent', runId, 'parentb', null, false)
  const schoolAdmin = await makeActor(
    'parent',
    runId,
    'schooladmin',
    schoolId,
    true,
    'school_admin',
  )
  // Special Miles staff. Belongs to no school — the point of the role is that
  // it is above all of them.
  const platformAdmin = await makeActor(
    'parent',
    runId,
    'platformadmin',
    null,
    true,
    'platform_admin',
  )

  // Both educators are assigned to ChildA. The only difference between them is
  // verification, which is exactly what db/013 is meant to gate on.
  //
  // Nobody is assigned to ChildB, which makes it the control: a child at the
  // same school that none of this staff carries.
  const { error: assignError } = await admin.from('student_educators').insert([
    { student_id: childA, profile_id: verifiedEducator.id, assignment: 'class_teacher' },
    { student_id: childA, profile_id: unverifiedEducator.id, assignment: 'class_teacher' },
  ])
  if (assignError) throw new Error(assignError.message)

  const { error: guardianError } = await admin.from('student_guardians').insert([
    { student_id: childA, profile_id: guardianOfA.id },
    { student_id: childB, profile_id: guardianOfB.id },
  ])
  if (guardianError) throw new Error(guardianError.message)

  const { data: log, error: logError } = await admin
    .from('behaviour_logs')
    .insert({
      student_id: childA,
      logged_by: verifiedEducator.id,
      behaviour_type: 'disruptive',
      intensity: 'medium',
      notes: 'Private note that guardians must not see.',
      shared_with_parents: false,
    })
    .select('id')
    .single()
  if (logError) throw new Error(logError.message)

  return {
    runId,
    schoolId,
    otherSchoolId,
    childA,
    childB,
    outsiderChild,
    privateLogId: log.id,
    verifiedEducator,
    unverifiedEducator,
    guardianOfA,
    guardianOfB,
    schoolAdmin,
    platformAdmin,
  }
}

/**
 * The same world, with three specialists carrying ChildA.
 *
 * The differences between them — verified or not, author or colleague — are
 * exactly what the policies in db/028 and db/029 are supposed to distinguish.
 */
export async function buildSpecialistWorld(): Promise<SpecialistWorld> {
  const world = await buildWorld()

  const specialist = await makeActor(
    'specialist',
    world.runId,
    'specialist',
    world.schoolId,
    true,
  )
  const otherSpecialist = await makeActor(
    'specialist',
    world.runId,
    'specialist2',
    world.schoolId,
    true,
  )
  const unverifiedSpecialist = await makeActor(
    'specialist',
    world.runId,
    'newspecialist',
    world.schoolId,
    false,
  )

  const { error } = await admin.from('student_educators').insert([
    { student_id: world.childA, profile_id: specialist.id, assignment: 'specialist' },
    { student_id: world.childA, profile_id: otherSpecialist.id, assignment: 'specialist' },
    {
      student_id: world.childA,
      profile_id: unverifiedSpecialist.id,
      assignment: 'specialist',
    },
  ])
  if (error) throw new Error(error.message)

  return { ...world, specialist, otherSpecialist, unverifiedSpecialist }
}

export async function destroyWorld(world: World | SpecialistWorld): Promise<void> {
  const actors = [
    world.verifiedEducator,
    world.unverifiedEducator,
    world.guardianOfA,
    world.guardianOfB,
    world.schoolAdmin,
    world.platformAdmin,
  ]

  // Present only on a SpecialistWorld. Signing out is courtesy rather than
  // cleanup — the accounts themselves go in cleanupStrays below, by address.
  if ('specialist' in world) {
    actors.push(world.specialist, world.otherSpecialist, world.unverifiedSpecialist)
  }

  for (const actor of actors) {
    await actor.db.auth.signOut()
  }
  // This run only. Without the id it would take every other run's world with
  // it, including one being built in the next file.
  await cleanupStrays(world.runId)
}

/**
 * Remove everything this suite has ever created, from any run.
 *
 * Called BEFORE building as well as after tearing down, and that is the point.
 * The first version only cleaned up on the way out, so a run that crashed
 * halfway through setup left its school, students and four users behind — and
 * because `students.school_id` has no `on delete cascade`, deleting the school
 * failed silently and left those too. Four orphan schools and six orphan
 * students accumulated in the project before anyone looked.
 *
 * Deleting by naming convention rather than by remembered ids is what makes it
 * self-healing: it does not matter how a previous run died.
 *
 * ORDER MATTERS, and getting it wrong fails silently in one direction and
 * loudly in the other. Both students and profiles reference schools without a
 * cascade, so the school cannot go until every child AND every staff profile
 * pointing at it has gone. Profiles go when their auth user goes.
 *
 *   usage + failures → invoices → students → users (with profiles) → schools
 *
 * IF YOU ADD A TABLE, ADD IT HERE. Four separate times a new table has
 * survived cleanup because it did not cascade from a student — invoices
 * (restrict), ai_generation_events (school set null, on purpose, so usage
 * outlives the child) and system_events (no foreign key at all). Each was
 * found by counting rows afterwards rather than by the suite going red,
 * because leftovers do not fail a test. They just accumulate.
 */
/**
 * Old enough that no run still using it could possibly be alive. A full suite
 * is about four minutes; an hour is generous in the safe direction.
 */
const STRAY_AGE_MS = 60 * 60 * 1000

export async function cleanupStrays(runId?: string): Promise<void> {
  /*
   * TWO MODES, BECAUSE THIS IS CALLED FOR TWO OPPOSITE REASONS.
   *
   * `destroyWorld` passes a runId and means "remove exactly the world I built".
   * `buildWorld` passes nothing and means "remove wreckage from a run that died
   * before it could tidy up".
   *
   * It used to do neither: it matched `RLS %` and `rls-` with no scope at all,
   * so it deleted every run's world including one currently being built. That
   * is the failure in tests/rls/onboarding.test.ts — a foreign key violation
   * partway through buildWorld, because the school it had just created was gone
   * before it could attach anybody to it.
   *
   * It does not need two people to happen. buildWorld creates the students,
   * then makes six accounts — each signing in through signInWithRetry, which
   * sleeps whole seconds when the free tier rate-limits — and only then inserts
   * student_educators. That window is tens of seconds wide, and hookTimeout is
   * 60s, so a previous file's afterAll can be abandoned by vitest while its
   * cleanup is still running into the next file's setup.
   *
   * An age filter alone would have been wrong: destroyWorld's own world is
   * minutes old, so filtering by age would leave every run behind to
   * accumulate — which is the fault this file's header warns about.
   */
  let schoolQuery = admin.from('schools').select('id').like('name', 'RLS %')

  schoolQuery = runId
    ? schoolQuery.like('name', `%${runId}`)
    : schoolQuery.lt(
        'created_at',
        new Date(Date.now() - STRAY_AGE_MS).toISOString(),
      )

  const { data: schools } = await schoolQuery

  const schoolIds = (schools ?? []).map((s) => s.id)

  // Written by the tests and by nothing that cascades. `source = 'test'` is
  // the only marker they carry; real entries come from 'billing' and 'ai'.
  await admin.from('system_events').delete().eq('source', 'test')

  if (schoolIds.length > 0) {
    // Usage records keep their school_id only until the school is deleted, at
    // which point it becomes null and they are indistinguishable from real
    // ones. So they go first, while they can still be identified.
    const { error: usageError } = await admin
      .from('ai_generation_events')
      .delete()
      .in('school_id', schoolIds)
    if (usageError) throw new Error(`Test cleanup failed: ${usageError.message}`)

    // Invoices reference students with ON DELETE RESTRICT — deliberately, so
    // a billing record cannot vanish with the student it belongs to. That
    // means they must go first here, and the failure is loud rather than
    // silent, which is how it was found.
    const { error: invoiceError } = await admin
      .from('invoices')
      .delete()
      .in('school_id', schoolIds)
    if (invoiceError) throw new Error(`Test cleanup failed: ${invoiceError.message}`)

    // Resources reference schools with ON DELETE RESTRICT as well, for the same
    // reason: a school being removed should not silently take a library of
    // therapy material with it. Shares and acknowledgements cascade from here.
    //
    // NOTE for anyone adding file uploads to a test: the BUCKET does not
    // cascade. Deleting these rows leaves the objects behind, and they would
    // have to be removed through the storage API first.
    const { error: resourceError } = await admin
      .from('resources')
      .delete()
      .in('school_id', schoolIds)
    if (resourceError) throw new Error(`Test cleanup failed: ${resourceError.message}`)

    // behaviour_logs, assignments, guardian links and consents all cascade
    // from students.
    const { error: studentError } = await admin
      .from('students')
      .delete()
      .in('school_id', schoolIds)
    if (studentError) throw new Error(`Test cleanup failed: ${studentError.message}`)
  }

  // Found by address, so a half-built run is cleaned up too. Deleting the auth
  // user takes its profile row with it, which is what releases the school.
  //
  // Scoped the same two ways as the schools above. `rls-` alone would take a
  // live run's accounts out from under it, which is how buildWorld ended up
  // signing in as somebody it had just deleted.
  const prefix = runId ? `rls-${runId}-` : 'rls-'
  const cutoff = Date.now() - STRAY_AGE_MS
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 })
  for (const user of users?.users ?? []) {
    if (!(user.email ?? '').startsWith(prefix)) continue
    if (!runId && new Date(user.created_at).getTime() > cutoff) continue
    await admin.auth.admin.deleteUser(user.id)
  }

  if (schoolIds.length > 0) {
    const { error: schoolError } = await admin
      .from('schools')
      .delete()
      .in('id', schoolIds)
    if (schoolError) throw new Error(`Test cleanup failed: ${schoolError.message}`)
  }
}
