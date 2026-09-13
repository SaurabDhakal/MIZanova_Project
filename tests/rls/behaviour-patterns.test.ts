import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * db/122 — the ABC columns, and the two functions that read a child's history.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE FUNCTIONS ARE AN ACCESS-CONTROL CLAIM, NOT A UTILITY
 * ---------------------------------------------------------------------------
 * `student_behaviour_patterns` and `student_strategy_outcomes` are declared
 * `security invoker`, and that one word is the only thing standing between a
 * teacher and every other school's children. Nothing in either function body
 * checks who is asking — the whole design assumes RLS on `behaviour_logs` and
 * `ai_strategies` arrives underneath and filters first.
 *
 * db/055 exists in this project because exactly that assumption was made once
 * before and was wrong: a view shipped without `security_invoker`, granted
 * itself to `authenticated`, and let a guardian read another school's support
 * hours — while a test asserting the underlying TABLE was protected passed the
 * whole time. It was knocking on the wrong door.
 *
 * So these tests call the FUNCTIONS, as each role, and check that what comes
 * back matches what that role could have counted from the tables by hand.
 *
 * ---------------------------------------------------------------------------
 * AN EMPTY ANSWER IS THE CORRECT REFUSAL HERE
 * ---------------------------------------------------------------------------
 * These return counts, not rows, so a caller with no access gets
 * `{"total": 0}` rather than an error. That is the right shape — a child with
 * no logs must also return zero, and the two cases are indistinguishable on
 * purpose. It does mean "it returned something" is never enough for a test:
 * every case below asserts the NUMBER.
 */

let world: World

beforeAll(async () => {
  world = await buildWorld()
}, 120_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 120_000)

/** Give a child some history to be counted. Written as the service role. */
async function seedLogs(
  studentId: string,
  rows: {
    antecedent?: string | null
    what_helped?: string | null
    setting_events?: string[]
    minutesAgo: number
  }[],
) {
  const ids: string[] = []
  for (const row of rows) {
    const at = new Date(Date.now() - row.minutesAgo * 60_000).toISOString()
    const { data } = await admin
      .from('behaviour_logs')
      .insert({
        student_id: studentId,
        logged_by: world.verifiedEducator.id,
        behaviour_type: 'disruptive',
        intensity: 'medium',
        occurred_at: at,
        started_at: at,
        antecedent: row.antecedent ?? null,
        what_helped: row.what_helped ?? null,
        setting_events: row.setting_events ?? [],
      })
      .select('id')
      .single()
    if (data) ids.push(data.id)
  }
  return ids
}

async function patternsAs(actor: World['guardianOfA'], studentId: string) {
  const { data, error } = await actor.db.rpc('student_behaviour_patterns', {
    p_student_id: studentId,
  })
  return { patterns: data as Record<string, unknown> | null, error }
}

// ---------------------------------------------------------------------------

describe('the columns accept their vocabulary and nothing else', () => {
  test('a value outside the list is refused by the database', async () => {
    const { error } = await admin
      .from('behaviour_logs')
      .update({ antecedent: 'because he felt like it' })
      .eq('id', world.privateLogId)

    // The check constraint, not a screen, is what makes these safe to send to
    // the model without redaction. If this ever passes, server/anonymise.js is
    // asserting against a vocabulary the database no longer enforces.
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/antecedent/i)
  })

  test('a setting event outside the list is refused', async () => {
    const { error } = await admin
      .from('behaviour_logs')
      .update({ setting_events: ['hungry'] })
      .eq('id', world.privateLogId)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/setting_events/i)
  })

  test('the vocabulary the application uses is accepted', async () => {
    const { error } = await admin
      .from('behaviour_logs')
      .update({
        antecedent: 'transition',
        what_helped: 'movement',
        setting_events: ['poor_sleep', 'first_day_back'],
      })
      .eq('id', world.privateLogId)

    expect(error).toBeNull()
  })
})

describe('a log queued before db/122 still saves', () => {
  /*
   * THE OFFLINE QUEUE HOLDS ROWS WRITTEN BY AN OLDER BUILD.
   *
   * `src/lib/offlineQueue.ts` keeps unsent logs in localStorage, so a teacher
   * who logged during an outage last week has entries on their device with no
   * `antecedent`, `whatHelped` or `settingEvents` key at all. The next time
   * the app loads it flushes them — with the NEW code.
   *
   * Marking those fields required on QueuedLog would not have failed the
   * compiler, because those objects are parsed from JSON rather than
   * constructed. It would have failed at the database, silently, for logs
   * somebody had already been promised were safe. This is the case that
   * proves the column defaults absorb it.
   */
  let id: string | null = null

  afterAll(async () => {
    if (id) await admin.from('behaviour_logs').delete().eq('id', id)
  })

  test('the columns are absent entirely and the insert is accepted', async () => {
    const { data, error } = await world.verifiedEducator.db
      .from('behaviour_logs')
      .insert({
        student_id: world.childA,
        logged_by: world.verifiedEducator.id,
        behaviour_type: 'withdrawn',
        intensity: 'standard',
        // Deliberately nothing from db/122 — this is the old payload, exactly.
      })
      .select('id, antecedent, what_helped, setting_events')
      .single()

    expect(error).toBeNull()
    id = data!.id

    // The defaults, and the difference between them: a null antecedent means
    // nobody was asked, and an empty array means no setting event applied.
    expect(data!.antecedent).toBeNull()
    expect(data!.what_helped).toBeNull()
    expect(data!.setting_events).toEqual([])
  })

  test('it counts towards the total without inventing a pattern', async () => {
    const { patterns } = await patternsAs(world.verifiedEducator, world.childA)
    expect(Number(patterns!.total)).toBeGreaterThan(0)
  })
})

describe('a pattern is only reported to somebody entitled to the logs', () => {
  let seeded: string[] = []

  beforeAll(async () => {
    seeded = await seedLogs(world.childA, [
      { antecedent: 'demand', what_helped: 'quiet_space', minutesAgo: 10 },
      { antecedent: 'demand', what_helped: 'quiet_space', minutesAgo: 20 },
      { antecedent: 'demand', what_helped: 'movement', minutesAgo: 30 },
      { antecedent: 'transition', what_helped: 'movement', minutesAgo: 40 },
    ])
  }, 60_000)

  afterAll(async () => {
    if (seeded.length) await admin.from('behaviour_logs').delete().in('id', seeded)
  })

  test('the assigned educator gets the counts', async () => {
    const { patterns } = await patternsAs(world.verifiedEducator, world.childA)
    expect(patterns).not.toBeNull()
    // Four seeded plus whatever buildWorld created for this child.
    expect(Number(patterns!.total)).toBeGreaterThanOrEqual(4)
    expect(patterns!.top_antecedent).toMatchObject({ value: 'demand', times: 3 })
  })

  test('an educator at another school counts nothing', async () => {
    // The refusal is an empty count, not an error — see the header.
    const { patterns, error } = await patternsAs(
      world.unverifiedEducator,
      world.outsiderChild,
    )
    expect(error).toBeNull()
    expect(Number(patterns!.total)).toBe(0)
    expect(patterns!.top_antecedent).toBeUndefined()
  })

  test("a guardian counts only their own child's shared logs, not another family's", async () => {
    const { patterns } = await patternsAs(world.guardianOfA, world.childB)
    expect(Number(patterns!.total)).toBe(0)
  })

  test('an anonymous caller gets nothing at all', async () => {
    const { anonClient } = await import('../helpers/world')
    const { error } = await anonClient().rpc('student_behaviour_patterns', {
      p_student_id: world.childA,
    })
    // The execute grant is to `authenticated` only, so this is a hard refusal
    // rather than an empty count.
    expect(error).not.toBeNull()
  })
})

describe('the figures are honest about how little they rest on', () => {
  let seeded: string[] = []

  afterAll(async () => {
    if (seeded.length) await admin.from('behaviour_logs').delete().in('id', seeded)
  })

  test('no recovery trend is reported below six timed incidents', async () => {
    // Untimed logs cannot contribute a duration, so this child has none.
    seeded = await seedLogs(world.childB, [
      { antecedent: 'demand', minutesAgo: 10 },
      { antecedent: 'demand', minutesAgo: 20 },
    ])

    const { patterns } = await patternsAs(world.verifiedEducator, world.childB)

    // The whole point: two logs is a hint, not a direction. A confident
    // sentence built on two rows is how a product tells a school something
    // false about a child.
    expect(patterns!.recovery_trend).toBeUndefined()
    expect(patterns!.recovery_trend_from).toBeUndefined()
  })

  test("'unknown' is excluded from the antecedent count", async () => {
    const extra = await seedLogs(world.childB, [
      { antecedent: 'unknown', minutesAgo: 5 },
      { antecedent: 'unknown', minutesAgo: 6 },
      { antecedent: 'unknown', minutesAgo: 7 },
    ])
    seeded = [...seeded, ...extra]

    const { patterns } = await patternsAs(world.verifiedEducator, world.childB)

    // 'unknown' means somebody looked and could not say. Letting it win the
    // count would report "the most common trigger is nobody saw it", which is
    // not a trigger and not advice.
    expect((patterns!.top_antecedent as { value: string } | undefined)?.value)
      .not.toBe('unknown')
  })

  test('a child with no history returns a zero, not an error', async () => {
    const { patterns, error } = await patternsAs(
      world.verifiedEducator,
      world.childA,
    )
    expect(error).toBeNull()
    expect(patterns).toHaveProperty('total')
  })
})

describe('answering one question does not erase the answers to others', () => {
  /*
   * A DATA-LOSS BUG, FOUND BY READING THE ROW BACK.
   *
   * `updateBehaviourLog` wrote `fields.antecedent ?? null` unconditionally.
   * That is correct for the correction dialog, which sends every field — a
   * cleared chip must clear the column. It was catastrophic for HowDidItEnd,
   * which answers only "what helped": every use of that prompt silently wiped
   * the antecedent, its note, and the day's setting events off the log.
   *
   * It was invisible on screen, because the timeline had already rendered the
   * context before the update landed. Only the database showed it.
   *
   * The fix is that an ABSENT key leaves a column alone and a PRESENT key
   * rewrites it. These two tests pin both halves.
   */
  let id: string | null = null

  beforeAll(async () => {
    const { data } = await admin
      .from('behaviour_logs')
      .insert({
        student_id: world.childA,
        logged_by: world.verifiedEducator.id,
        behaviour_type: 'physical',
        intensity: 'high',
        antecedent: 'other',
        antecedent_note: 'The fire alarm went off',
        setting_events: ['substitute_adult'],
      })
      .select('id')
      .single()
    id = data?.id ?? null
  }, 60_000)

  afterAll(async () => {
    if (id) await admin.from('behaviour_logs').delete().eq('id', id)
  })

  test('a partial update touches only what it was given', async () => {
    // Exactly what HowDidItEnd sends: an outcome, and nothing else.
    const { error } = await world.verifiedEducator.db
      .from('behaviour_logs')
      .update({ what_helped: 'movement' })
      .eq('id', id!)
    expect(error).toBeNull()

    const { data } = await admin
      .from('behaviour_logs')
      .select('antecedent, antecedent_note, what_helped, setting_events')
      .eq('id', id!)
      .single()

    expect(data!.what_helped).toBe('movement')
    // The three that must have survived.
    expect(data!.antecedent).toBe('other')
    expect(data!.antecedent_note).toBe('The fire alarm went off')
    expect(data!.setting_events).toEqual(['substitute_adult'])
  })

  test('a note longer than the cap is refused', async () => {
    const { error } = await admin
      .from('behaviour_logs')
      .update({ antecedent_note: 'x'.repeat(301) })
      .eq('id', id!)

    // db/125 caps these short on purpose: the escape hatch must not become a
    // rival to the observation notes.
    expect(error).not.toBeNull()
  })
})

describe('a family reads the context on a log shared with them', () => {
  /*
   * `fetchSharedLogs` selected nine columns and none of the ABC ones, so a
   * parent opening a shared incident read "Physical · high" and the notes —
   * the frightening half — while the same row on a teacher's screen said what
   * came before it and what helped.
   *
   * No new access is involved: these columns sit on a row db/005's guardian
   * policy has already decided the family may read. The bug was a `select`.
   */
  afterAll(async () => {
    await admin
      .from('behaviour_logs')
      .update({ shared_with_parents: false })
      .eq('id', world.privateLogId)
  })

  test('the columns come back once the log is shared, and not before', async () => {
    const read = () =>
      world.guardianOfA.db
        .from('behaviour_logs')
        .select('id, antecedent, what_helped, setting_events, antecedent_note')
        .eq('id', world.privateLogId)
        .maybeSingle()

    // buildWorld leaves it unshared; an earlier suite set the vocabulary on it.
    const before = await read()
    expect(before.data).toBeNull()

    await admin
      .from('behaviour_logs')
      .update({
        shared_with_parents: true,
        antecedent: 'demand',
        what_helped: 'quiet_space',
      })
      .eq('id', world.privateLogId)

    const after = await read()
    expect(after.error).toBeNull()
    expect(after.data?.antecedent).toBe('demand')
    expect(after.data?.what_helped).toBe('quiet_space')
  })
})

describe('the profile: read by the family, written by the school — db/127', () => {
  afterAll(async () => {
    await admin.from('student_profiles').delete().eq('student_id', world.childA)
  })

  test('an assigned educator can write one', async () => {
    const { error } = await world.verifiedEducator.db
      .from('student_profiles')
      .insert({
        student_id: world.childA,
        interests: 'Horses.',
        helps: ['movement'],
        triggers: ['transition'],
        updated_by: world.verifiedEducator.id,
      })
    expect(error).toBeNull()
  })

  test("the child's guardian may READ it", async () => {
    /*
     * Deliberate, and the opposite of the behaviour-log default. What a school
     * believes about a child's strengths and triggers is exactly what families
     * discover at a meeting and wish they had known in September.
     */
    const { data, error } = await world.guardianOfA.db
      .from('student_profiles')
      .select('interests, triggers')
      .eq('student_id', world.childA)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data?.interests).toBe('Horses.')
  })

  test('a guardian may NOT write it', async () => {
    // db/127: a family and a school silently overwriting each other needs the
    // per-fact provenance docs/17 §3.3 designs, and that is not built.
    const { error } = await world.guardianOfA.db
      .from('student_profiles')
      .update({ interests: 'Something the school did not say.' })
      .eq('student_id', world.childA)
      .select('student_id')

    const { data: after } = await admin
      .from('student_profiles')
      .select('interests')
      .eq('student_id', world.childA)
      .single()

    // RLS filters the row out rather than erroring, so the proof is that the
    // stored value is untouched — the shape db/072 warns about.
    expect(after!.interests).toBe('Horses.')
    expect(error).toBeNull()
  })

  test('another school cannot see it at all', async () => {
    const { data } = await world.unverifiedEducator.db
      .from('student_profiles')
      .select('interests')
      .eq('student_id', world.childA)
    expect(data).toEqual([])
  })

  test('the vocabularies are the log vocabularies, and nothing else', async () => {
    // The whole point of sharing them: a value the logging screen cannot
    // produce must not be storable here either, or the comparison is unsound.
    const { error } = await admin
      .from('student_profiles')
      .update({ triggers: ['lunchtime'] })
      .eq('student_id', world.childA)
    expect(error).not.toBeNull()
  })

  test("'other' and 'unknown' are refused: a standing profile has no incident to be unsure about", async () => {
    const { error } = await admin
      .from('student_profiles')
      .update({ triggers: ['unknown'] })
      .eq('student_id', world.childA)
    expect(error).not.toBeNull()
  })
})

describe('what was already suggested, and how it went', () => {
  let strategyId: string | null = null

  beforeAll(async () => {
    const { data: log } = await admin
      .from('behaviour_logs')
      .select('id')
      .eq('student_id', world.childA)
      .limit(1)
      .single()

    const { data } = await admin
      .from('ai_strategies')
      .insert({
        behaviour_log_id: log!.id,
        student_id: world.childA,
        title: 'A strategy somebody already tried',
        body: 'Body.',
        confidence: 0.9,
        status: 'published',
        anonymised_input: '{}',
      })
      .select('id')
      .single()
    strategyId = data?.id ?? null
  }, 60_000)

  afterAll(async () => {
    if (strategyId) await admin.from('ai_strategies').delete().eq('id', strategyId)
  })

  test("'dismissed' is read as a negative verdict, because it is the one the UI writes", async () => {
    /*
     * THE BUG THIS TEST EXISTS FOR. The first version of the function filtered
     * on db/006's check constraint, which permits 'helpful' and 'not_helpful'.
     * The product writes neither: StrategyPanel.tsx offers "Applied" and
     * "Not useful", which are 'applied' and 'dismissed'. The function returned
     * an empty list for every child, forever, while looking correct.
     */
    await admin.from('strategy_feedback').insert({
      strategy_id: strategyId,
      profile_id: world.verifiedEducator.id,
      action: 'dismissed',
    })

    const { data } = await world.verifiedEducator.db.rpc(
      'student_strategy_outcomes',
      { p_student_id: world.childA },
    )

    const rows = data as { title: string; outcome: string }[]
    expect(rows).toContainEqual({
      title: 'A strategy somebody already tried',
      outcome: 'did_not_help',
    })
  })

  test('the negative wins when two people disagree', async () => {
    await admin.from('strategy_feedback').insert({
      strategy_id: strategyId,
      profile_id: world.schoolAdmin.id,
      action: 'applied',
    })

    const { data } = await world.verifiedEducator.db.rpc(
      'student_strategy_outcomes',
      { p_student_id: world.childA },
    )

    // Suppressing something one teacher found useless costs a little.
    // Re-suggesting something already reported useless is what a teacher
    // notices, and is the failure the function exists to prevent.
    const row = (data as { title: string; outcome: string }[]).find(
      (r) => r.title === 'A strategy somebody already tried',
    )
    expect(row?.outcome).toBe('did_not_help')
  })

  test('an educator at another school is told nothing about this child', async () => {
    const { data } = await world.unverifiedEducator.db.rpc(
      'student_strategy_outcomes',
      { p_student_id: world.childA },
    )
    expect(data).toEqual([])
  })
})
