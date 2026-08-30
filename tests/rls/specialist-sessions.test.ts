import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  admin,
  buildSpecialistWorld,
  destroyWorld,
  type SpecialistWorld,
} from '../helpers/world'

/**
 * db/028 — specialist sessions and the clinical record.
 *
 * This is the most sensitive data in MiZanova. A speech therapist's notes
 * about a child are closer to health information than to a behaviour log, and
 * the design of db/028 rests on one structural claim:
 *
 *   SHARING A SESSION CANNOT EXPOSE THE NOTES, BECAUSE THE NOTES ARE NOT IN
 *   THE THING BEING SHARED.
 *
 * A first draft put clinical_notes on the same row behind a comment promising
 * the application would not display it. That is not a boundary — once RLS
 * permits a row it permits the whole row, and Postgres column grants apply to
 * a ROLE rather than a row, so there is no grant that hides a column from a
 * teacher while showing it to a specialist. Two tables is the fix, and these
 * tests are what makes that claim checkable rather than merely asserted.
 *
 * EVERY ASSERTION READS BACK WITH THE SERVICE KEY. RLS does not raise an error
 * on a filtered UPDATE — Postgres reports success and changes nothing. A test
 * that only inspected `error` would pass against a policy that had been
 * deleted outright.
 */

let world: SpecialistWorld
let sessionId: string
let unsharedId: string

const SUMMARY = 'Worked on turn-taking. Good engagement in the second half.'
const CLINICAL = 'Parent conflict raised. Query re: assessment for ODD.'

beforeAll(async () => {
  world = await buildSpecialistWorld()

  // Written by the service key so the tests start from a known state rather
  // than from the success of the insert policy — which is itself under test
  // further down.
  // TWO INSERTS, NOT ONE ARRAY. PostgREST builds a single column list from the
  // union of the keys across a batch and sends an explicit NULL wherever a row
  // omits one — which overrides the column default rather than falling back to
  // it. The unshared row below leaves the sharing flags out, so batching these
  // fails on the NOT NULL. The same trap already cost a fix in src/lib/api.ts.
  const { data: shared, error } = await admin
    .from('specialist_sessions')
    .insert({
      student_id: world.childA,
      specialist_id: world.specialist.id,
      duration_minutes: 45,
      trials_successful: 8,
      trials_total: 10,
      shared_summary: SUMMARY,
      shared_with_teacher: true,
      shared_with_parents: true,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  const { data: unshared, error: unsharedError } = await admin
    .from('specialist_sessions')
    .insert({
      student_id: world.childA,
      specialist_id: world.specialist.id,
      duration_minutes: 30,
      shared_summary: 'Not shared with anyone.',
    })
    .select('id')
    .single()
  if (unsharedError) throw new Error(unsharedError.message)

  sessionId = shared.id
  unsharedId = unshared.id

  const { error: notesError } = await admin
    .from('specialist_session_notes')
    .insert({ session_id: sessionId, notes: CLINICAL })
  if (notesError) throw new Error(notesError.message)
}, 90_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 90_000)

/** The truth about a session, read past RLS. */
async function record(id: string) {
  const { data } = await admin
    .from('specialist_sessions')
    .select('*')
    .eq('id', id)
    .single()
  return data
}

describe('the clinical record is unreachable by anyone outside the specialist team', () => {
  // The single most important test in this file. The session below IS shared
  // with the teacher and the family, so every one of these actors can see the
  // row. The notes are still not theirs.
  test('an assigned teacher cannot read the notes, even for a session shared with them', async () => {
    const { data } = await world.verifiedEducator.db
      .from('specialist_session_notes')
      .select('notes')

    expect(data ?? []).toEqual([])
  })

  test('a guardian cannot read the notes for their own child', async () => {
    const { data } = await world.guardianOfA.db
      .from('specialist_session_notes')
      .select('notes')

    expect(data ?? []).toEqual([])
  })

  test('a school administrator cannot read the notes', async () => {
    const { data } = await world.schoolAdmin.db
      .from('specialist_session_notes')
      .select('notes')

    expect(data ?? []).toEqual([])
  })

  test('asking for the row by id does not help', async () => {
    // Not the same test. The three above could pass on a policy that merely
    // failed to return rows in a broad select.
    const { data } = await world.verifiedEducator.db
      .from('specialist_session_notes')
      .select('notes')
      .eq('session_id', sessionId)

    expect(data ?? []).toEqual([])
  })

  test('joining through the session they CAN see does not reach them either', async () => {
    // The route somebody would actually try: the teacher is allowed the parent
    // row, so ask PostgREST to embed the child one.
    const { data } = await world.verifiedEducator.db
      .from('specialist_sessions')
      .select('id, specialist_session_notes(notes)')
      .eq('id', sessionId)

    const embedded = (data ?? []) as { specialist_session_notes: unknown }[]
    for (const row of embedded) {
      expect(row.specialist_session_notes ?? []).toEqual([])
    }
  })

  test('the specialist who wrote them can read them', async () => {
    // Otherwise every test above would pass on a table nobody can read.
    const { data } = await world.specialist.db
      .from('specialist_session_notes')
      .select('notes')
      .eq('session_id', sessionId)
      .single()

    expect(data?.notes).toBe(CLINICAL)
  })
})

describe('who can see a session at all', () => {
  test('the specialist sees both, shared or not', async () => {
    const { data } = await world.specialist.db
      .from('specialist_sessions')
      .select('id')

    expect(data?.map((r) => r.id).sort()).toEqual([sessionId, unsharedId].sort())
  })

  test('an assigned teacher sees only the shared one', async () => {
    const { data } = await world.verifiedEducator.db
      .from('specialist_sessions')
      .select('id')

    expect(data?.map((r) => r.id)).toEqual([sessionId])
  })

  test('a guardian sees only the shared one, for their own child', async () => {
    const { data } = await world.guardianOfA.db
      .from('specialist_sessions')
      .select('id, shared_summary')

    expect(data?.map((r) => r.id)).toEqual([sessionId])
    expect(data?.[0].shared_summary).toBe(SUMMARY)
  })

  test('a different family sees nothing', async () => {
    const { data } = await world.guardianOfB.db
      .from('specialist_sessions')
      .select('id')

    expect(data ?? []).toEqual([])
  })

  test('a school administrator sees no sessions at all — deliberately', async () => {
    // Everywhere else in MiZanova a school admin sees their whole school. Not
    // here, and db/028 says why: "the principal can read every therapy note in
    // the school" is not what a family agrees to when they consent to a
    // referral. If this test ever goes red, that decision was reversed by
    // accident.
    const { data } = await world.schoolAdmin.db
      .from('specialist_sessions')
      .select('id')

    expect(data ?? []).toEqual([])
  })

  test('a platform administrator sees everything, for support and audit', async () => {
    // SCOPED TO THIS CHILD ON PURPOSE. A platform admin genuinely sees every
    // session in the database, including ones from real use of the app, so an
    // unscoped count is a test that fails whenever somebody logs a session by
    // hand — which is exactly what happened the first time this ran.
    const { data } = await world.platformAdmin.db
      .from('specialist_sessions')
      .select('id')
      .eq('student_id', world.childA)

    expect(data?.map((r) => r.id).sort()).toEqual([sessionId, unsharedId].sort())
  })

  test('an unverified teacher on the same caseload sees nothing', async () => {
    const { data } = await world.unverifiedEducator.db
      .from('specialist_sessions')
      .select('id')

    expect(data ?? []).toEqual([])
  })
})

describe('only an assigned specialist writes a session, and only as themselves', () => {
  test('the specialist can record one for a child on their caseload', async () => {
    const { error } = await world.specialist.db.from('specialist_sessions').insert({
      student_id: world.childA,
      specialist_id: world.specialist.id,
      duration_minutes: 30,
    })

    expect(error).toBeNull()
  })

  test('not for a child they do not carry', async () => {
    const { error } = await world.specialist.db.from('specialist_sessions').insert({
      student_id: world.childB,
      specialist_id: world.specialist.id,
      duration_minutes: 30,
    })

    expect(error).not.toBeNull()
  })

  test('not for a child at another school', async () => {
    const { error } = await world.specialist.db.from('specialist_sessions').insert({
      student_id: world.outsiderChild,
      specialist_id: world.specialist.id,
      duration_minutes: 30,
    })

    expect(error).not.toBeNull()
  })

  test('not under a colleague’s name', async () => {
    // A clinical record whose stated author did not write it is worse than no
    // record. `specialist_id = auth.uid()` in the insert policy is what stops
    // this, and nothing in the interface could.
    const { error } = await world.specialist.db.from('specialist_sessions').insert({
      student_id: world.childA,
      specialist_id: world.otherSpecialist.id,
      duration_minutes: 30,
    })

    expect(error).not.toBeNull()
  })

  test('a teacher cannot record a specialist session', async () => {
    const { error } = await world.verifiedEducator.db
      .from('specialist_sessions')
      .insert({
        student_id: world.childA,
        specialist_id: world.verifiedEducator.id,
        duration_minutes: 30,
      })

    expect(error).not.toBeNull()
  })

  test('a guardian cannot record one about their own child', async () => {
    const { error } = await world.guardianOfA.db.from('specialist_sessions').insert({
      student_id: world.childA,
      specialist_id: world.guardianOfA.id,
      duration_minutes: 30,
    })

    expect(error).not.toBeNull()
  })

  test('a school administrator cannot record one', async () => {
    const { error } = await world.schoolAdmin.db.from('specialist_sessions').insert({
      student_id: world.childA,
      specialist_id: world.schoolAdmin.id,
      duration_minutes: 30,
    })

    expect(error).not.toBeNull()
  })
})

describe('sharing is the specialist’s decision and nobody else’s', () => {
  test('a teacher cannot share a session with themselves', async () => {
    await world.verifiedEducator.db
      .from('specialist_sessions')
      .update({ shared_with_teacher: true })
      .eq('id', unsharedId)

    expect((await record(unsharedId))?.shared_with_teacher).toBe(false)
  })

  test('a guardian cannot share a session with themselves', async () => {
    await world.guardianOfA.db
      .from('specialist_sessions')
      .update({ shared_with_parents: true })
      .eq('id', unsharedId)

    expect((await record(unsharedId))?.shared_with_parents).toBe(false)
  })

  test('a teacher cannot rewrite the summary written for them', async () => {
    await world.verifiedEducator.db
      .from('specialist_sessions')
      .update({ shared_summary: 'Reworded by the teacher.' })
      .eq('id', sessionId)

    expect((await record(sessionId))?.shared_summary).toBe(SUMMARY)
  })

  test('a colleague specialist can read the session but cannot rewrite it', async () => {
    // Reading a colleague's clinical record is normal practice. Editing one is
    // a different act, and the update policy is scoped to the author.
    const { data: visible } = await world.otherSpecialist.db
      .from('specialist_sessions')
      .select('id')
      .eq('id', sessionId)

    expect(visible?.length).toBe(1)

    await world.otherSpecialist.db
      .from('specialist_sessions')
      .update({ shared_summary: 'Reworded by a colleague.' })
      .eq('id', sessionId)

    expect((await record(sessionId))?.shared_summary).toBe(SUMMARY)
  })

  test('a colleague cannot overwrite the clinical notes', async () => {
    await world.otherSpecialist.db
      .from('specialist_session_notes')
      .update({ notes: 'Overwritten by a colleague.' })
      .eq('session_id', sessionId)

    const { data } = await admin
      .from('specialist_session_notes')
      .select('notes')
      .eq('session_id', sessionId)
      .single()

    expect(data?.notes).toBe(CLINICAL)
  })

  test('the author can change their own sharing decision, both ways', async () => {
    await world.specialist.db
      .from('specialist_sessions')
      .update({ shared_with_parents: false })
      .eq('id', sessionId)

    expect((await record(sessionId))?.shared_with_parents).toBe(false)

    await world.specialist.db
      .from('specialist_sessions')
      .update({ shared_with_parents: true })
      .eq('id', sessionId)

    expect((await record(sessionId))?.shared_with_parents).toBe(true)
  })

  test('a session cannot be shared with nothing written in it', async () => {
    // A session marked "shared with parents" whose summary is empty tells a
    // family nothing while appearing to include them.
    const { error } = await world.specialist.db
      .from('specialist_sessions')
      .insert({
        student_id: world.childA,
        specialist_id: world.specialist.id,
        duration_minutes: 30,
        shared_with_parents: true,
      })

    expect(error?.message).toMatch(/summary/i)
  })

  test('nor by blanking the summary of one already shared', async () => {
    // The way round the check on insert: share it with something, then empty
    // it. The trigger fires on update too, which is what makes that fail.
    const { error } = await world.specialist.db
      .from('specialist_sessions')
      .update({ shared_summary: '   ' })
      .eq('id', sessionId)

    expect(error).not.toBeNull()
    expect((await record(sessionId))?.shared_summary).toBe(SUMMARY)
  })
})

describe('a session that happened, happened', () => {
  test('the specialist who wrote it cannot delete it', async () => {
    await world.specialist.db.from('specialist_sessions').delete().eq('id', sessionId)
    expect(await record(sessionId)).not.toBeNull()
  })

  test('nor can a platform administrator, through the browser', async () => {
    await world.platformAdmin.db
      .from('specialist_sessions')
      .delete()
      .eq('id', sessionId)
    expect(await record(sessionId)).not.toBeNull()
  })

  test('the trials on a record cannot be made impossible', async () => {
    // 12 successes out of 10 attempts is not a typo to be tolerated in a
    // clinical record — it is a number somebody may later report to a funder.
    const { error } = await world.specialist.db
      .from('specialist_sessions')
      .update({ trials_successful: 12, trials_total: 10 })
      .eq('id', sessionId)

    expect(error).not.toBeNull()
    expect((await record(sessionId))?.trials_successful).toBe(8)
  })
})

describe('verification gates the clinical record too', () => {
  // db/013 exists because being assigned to a child is not the same as the
  // school having confirmed you are who you say you are. An unverified teacher
  // assigned to ChildA cannot read a behaviour log about them — tested above.
  //
  // These two say the same gate applies to the most sensitive table in the
  // product. Anything less would mean the clinical record was the ONLY thing
  // an unchecked staff member could reach.
  test('an unverified specialist cannot record a session', async () => {
    const { error } = await world.unverifiedSpecialist.db
      .from('specialist_sessions')
      .insert({
        student_id: world.childA,
        specialist_id: world.unverifiedSpecialist.id,
        duration_minutes: 30,
      })

    expect(error).not.toBeNull()
  })

  test('an unverified specialist cannot read the clinical notes', async () => {
    const { data } = await world.unverifiedSpecialist.db
      .from('specialist_session_notes')
      .select('notes')

    expect(data ?? []).toEqual([])
  })

  test('an unverified specialist cannot read sessions', async () => {
    const { data } = await world.unverifiedSpecialist.db
      .from('specialist_sessions')
      .select('id')

    expect(data ?? []).toEqual([])
  })
})

/*
 * ---------------------------------------------------------------------------
 * WRITING AND REVISING THE CLINICAL NOTE
 * ---------------------------------------------------------------------------
 * db/028: "Written and revised only by the specialist who ran the session. A
 * colleague on the same caseload may read a clinical note; rewriting one is
 * different."
 *
 * The read side of that sentence has always been tested. The write side never
 * was, because nothing wrote one after the session was created — `createSession`
 * inserts the note once and, when that insert fails, tells the specialist to
 * "open the session and add them again", which was impossible. `saveSessionNotes`
 * exists now, so the policy it leans on is worth pinning.
 */
describe('who may write the clinical note — db/028', () => {
  test('the specialist who ran the session can revise it', async () => {
    const { data, error } = await world.specialist.db
      .from('specialist_session_notes')
      .upsert(
        { session_id: sessionId, notes: 'Revised after re-reading the video.' },
        { onConflict: 'session_id' },
      )
      .select('session_id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    const { data: back } = await admin
      .from('specialist_session_notes')
      .select('notes')
      .eq('session_id', sessionId)
      .single()
    expect(back?.notes).toBe('Revised after re-reading the video.')
  })

  test('and can add one to a session that has none — the recovery path', async () => {
    // createSession's own error message promises this: the session saves, the
    // note does not, "open the session and add them again".
    const { data: bare } = await admin
      .from('specialist_sessions')
      .insert({
        student_id: world.childA,
        specialist_id: world.specialist.id,
        session_date: '2026-08-24',
        duration_minutes: 30,
      })
      .select('id')
      .single()

    const { data, error } = await world.specialist.db
      .from('specialist_session_notes')
      .upsert(
        { session_id: bare!.id, notes: 'Added after the first save failed.' },
        { onConflict: 'session_id' },
      )
      .select('session_id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    await admin.from('specialist_sessions').delete().eq('id', bare!.id)
  })

  test('another specialist cannot rewrite it, though they may read it', async () => {
    const before = await admin
      .from('specialist_session_notes')
      .select('notes')
      .eq('session_id', sessionId)
      .single()

    const { data } = await world.otherSpecialist.db
      .from('specialist_session_notes')
      .upsert(
        { session_id: sessionId, notes: 'Rewritten by a colleague.' },
        { onConflict: 'session_id' },
      )
      .select('session_id')

    // This is the distinction db/028 draws, and the reason the app calls
    // assertChanged: nothing is refused, nothing is changed.
    expect(data ?? []).toEqual([])

    const after = await admin
      .from('specialist_session_notes')
      .select('notes')
      .eq('session_id', sessionId)
      .single()
    expect(after.data?.notes).toBe(before.data?.notes)
  })
})
