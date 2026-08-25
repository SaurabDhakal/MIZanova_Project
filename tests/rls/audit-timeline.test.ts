import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { admin, buildWorld, destroyWorld, type World } from '../helpers/world'

/**
 * `audit_timeline` — the union view db/068 added over both audit tables.
 *
 * WHY THIS FILE EXISTS AT ALL. The two base tables have been platform-admin
 * only since db/015 and db/012, and those policies are already trusted. db/068
 * put a NEW relation in front of them, and a view is exactly where that kind of
 * restriction gets lost: `security_invoker` is off by default, and a view
 * without it runs as its owner, so the RLS on the tables underneath simply does
 * not apply to anyone reading through it.
 *
 * That failure is silent and total. It does not error, it does not look wrong
 * on screen — a school administrator opening any page that touched this view
 * would just quietly receive every governance decision Special Miles has ever
 * made, at every other school. db/055 was that mistake on a different view,
 * which is the only reason it is asserted here rather than assumed.
 *
 * The second half of the file is about the union itself. A UNION view can drop
 * rows in ways a single table cannot — an inner join to a deleted actor is the
 * obvious one — and rows disappearing from an audit trail is worse than a table
 * that fails to load, because nothing announces it.
 */

let world: World

beforeAll(async () => {
  world = await buildWorld()
}, 60_000)

afterAll(async () => {
  /*
   * THIS SUITE CLEANS UP ITS OWN AUDIT ROWS, which no other suite has to do.
   * cleanupStrays deletes schools, students and accounts; it has never touched
   * the two audit tables, because until now nothing wrote to them on purpose.
   *
   * It matters more here than it looks. The trail is append-only by design and
   * shared with CI, so a suite that leaves rows behind is not making a mess in
   * a scratch table — it is writing permanent entries into the record a real
   * school would be shown. There were already 293 'school.created' entries in
   * it from other suites creating schools, which is over half the trail.
   */
  if (!world) return

  await admin
    .from('admin_audit_events')
    .delete()
    .like('subject_label', `%${world.runId}`)
  await admin
    .from('ai_control_events')
    .delete()
    .like('reason', `%${world.runId}`)

  await destroyWorld(world)
}, 60_000)

describe('who may read the timeline', () => {
  test('a platform admin can read it', async () => {
    await admin.from('admin_audit_events').insert({
      actor_id: world.platformAdmin.id,
      action: 'staff.verified',
      subject_label: `audit-timeline ${world.runId}`,
      detail: 'Written by the audit timeline suite.',
    })

    const { data, error } = await world.platformAdmin.db
      .from('audit_timeline')
      .select('id, action, subject_label')
      .eq('subject_label', `audit-timeline ${world.runId}`)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  /*
   * The one that matters. A school administrator has real authority inside
   * their own school and none at all over this trail: it records what Special
   * Miles does TO schools, including suspending theirs.
   */
  test('a school admin reads nothing through it', async () => {
    const { data, error } = await world.schoolAdmin.db
      .from('audit_timeline')
      .select('id')

    // Not an error — RLS filters rather than refuses, which is why an empty
    // result is the assertion rather than a rejection.
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('a teacher reads nothing through it', async () => {
    const { data, error } = await world.verifiedEducator.db
      .from('audit_timeline')
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('a parent reads nothing through it', async () => {
    const { data, error } = await world.guardianOfA.db
      .from('audit_timeline')
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  /*
   * Views are read-only here by intention, not by accident: the point of the
   * trail is that nobody can edit their own record afterwards. Postgres refuses
   * writes to a UNION view outright, and this asserts that stays true — a
   * future rewrite into a single-table view would silently become writable.
   */
  test('nobody can write through it, not even a platform admin', async () => {
    const { error } = await world.platformAdmin.db
      .from('audit_timeline')
      .insert({ action: 'staff.verified', occurred_at: new Date().toISOString() })

    expect(error).not.toBeNull()
  })
})

describe('the union does not lose rows', () => {
  test('an event whose actor was deleted still appears', async () => {
    /*
     * db/015 declares actor_id `on delete set null` so the ENTRY survives the
     * person. If the view joined profiles with an inner join, those rows would
     * vanish — an audit trail that quietly forgets everything done by people
     * who have since left, while still looking complete.
     */
    await admin.from('admin_audit_events').insert({
      actor_id: null,
      action: 'school.created',
      subject_label: `orphan ${world.runId}`,
      detail: 'Actor is null, as it is after somebody is deleted.',
    })

    const { data, error } = await world.platformAdmin.db
      .from('audit_timeline')
      .select('id, actor_id, actor_name')
      .eq('subject_label', `orphan ${world.runId}`)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].actor_name).toBeNull()
  })

  test('an event belonging to no school still appears, and says so', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('audit_timeline')
      .select('school_id, school_name')
      .eq('subject_label', `orphan ${world.runId}`)

    expect(error).toBeNull()
    expect(data?.[0].school_id).toBeNull()
    expect(data?.[0].school_name).toBeNull()
  })

  test('two identical events both survive the union', async () => {
    /*
     * `union` instead of `union all` would silently collapse two genuinely
     * identical events into one, and that is not a far-fetched pair: two
     * invoices voided in the same second, by the same person, for the same
     * reason is an ordinary Monday.
     *
     * Asserted on rows this run inserted rather than by comparing table counts.
     * The suites share one database and run in parallel, so a global count is a
     * race — it would fail whenever another file happened to write between the
     * two queries, and a flaky test in CI teaches everyone to ignore red.
     */
    const twin = {
      actor_id: world.platformAdmin.id,
      action: 'invoice.voided',
      subject_label: `twin ${world.runId}`,
      detail: 'Identical to its sibling in every column.',
    }
    await admin.from('admin_audit_events').insert([twin, twin])

    const { data, error } = await world.platformAdmin.db
      .from('audit_timeline')
      .select('id')
      .eq('subject_label', `twin ${world.runId}`)

    expect(error).toBeNull()
    expect(data).toHaveLength(2)
  })
})

describe('the filters the screen depends on', () => {
  test('an AI control change arrives with a filterable action code', async () => {
    /*
     * These three codes are derived in SQL by db/068 precisely so the Action
     * filter can run server-side. Before that the label was built in the
     * browser, so filtering could only ever search rows already downloaded —
     * which was the bug the whole migration exists to fix.
     */
    await admin.from('ai_control_events').insert({
      changed_by: world.platformAdmin.id,
      was_enabled: true,
      now_enabled: false,
      was_threshold: 0.75,
      now_threshold: 0.75,
      reason: `audit-timeline suite ${world.runId}`,
    })

    const { data, error } = await world.platformAdmin.db
      .from('audit_timeline')
      .select('action, source, subject_label, school_id')
      .eq('detail', `audit-timeline suite ${world.runId}`)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].action).toBe('ai.disabled')
    expect(data?.[0].source).toBe('ai')
    // Switching the assistant off is about the whole product, so there is
    // nothing it happened TO and no school it happened AT.
    expect(data?.[0].subject_label).toBeNull()
    expect(data?.[0].school_id).toBeNull()
  })

  test('a threshold change names the two thresholds', async () => {
    await admin.from('ai_control_events').insert({
      changed_by: world.platformAdmin.id,
      was_enabled: true,
      now_enabled: true,
      was_threshold: 0.6,
      now_threshold: 0.85,
      reason: `threshold ${world.runId}`,
    })

    const { data, error } = await world.platformAdmin.db
      .from('audit_timeline')
      .select('action, subject_label')
      .eq('detail', `threshold ${world.runId}`)

    expect(error).toBeNull()
    expect(data?.[0].action).toBe('ai.threshold_changed')
    expect(data?.[0].subject_label).toContain('60%')
    expect(data?.[0].subject_label).toContain('85%')
  })

  test('the search column finds a phrase from the reason', async () => {
    const { data, error } = await world.platformAdmin.db
      .from('audit_timeline')
      .select('id')
      .ilike('search_text', `%threshold ${world.runId}%`)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})

describe("the trail does not carry a child's notes — db/069", () => {
  /*
   * db/065 wrote the previous note text into the audit entry in full, and
   * db/068 is what made that visible: an entry on screen read "Notes: Private
   * note that guardians must not see."
   *
   * Two faults, and the second is the serious one. A platform admin reading the
   * trail for an unrelated reason ends up reading a child's clinical notes; and
   * that read leaves NO ENTRY IN RECORD ACCESS, which is the control this
   * product points at when asked who has seen a file. A side door around the
   * oversight is worse than no oversight, because the trail still looks whole.
   *
   * Asserted rather than assumed because the leak arrived by accident, through
   * a trigger written for a good reason, and nothing on the way would have
   * complained. The next person to add a `format()` to one of these triggers
   * needs the suite to notice.
   */
  const secret = 'SAFEGUARDING DISCLOSURE, verbatim and private.'

  test('correcting a log records the change, not the words', async () => {
    const { data: log } = await admin
      .from('behaviour_logs')
      .insert({
        student_id: world.childA,
        logged_by: world.verifiedEducator.id,
        behaviour_type: 'disruptive',
        intensity: 'medium',
        notes: secret,
        shared_with_parents: false,
      })
      .select('id')
      .single()

    await admin
      .from('behaviour_logs')
      .update({ notes: 'Tidied up.' })
      .eq('id', log!.id)

    const { data } = await admin
      .from('admin_audit_events')
      .select('detail')
      .eq('subject_id', log!.id)
      .eq('action', 'behaviour_log.edited')

    expect(data).toHaveLength(1)
    expect(data![0].detail).not.toContain(secret)
    expect(data![0].detail).not.toContain('SAFEGUARDING')
    // Still says a correction happened, and still says which field.
    expect(data![0].detail).toContain('notes')
    // And keeps enough to settle a dispute about what it said.
    expect(data![0].detail).toContain('characters, sha256')

    await admin.from('behaviour_logs').delete().eq('id', log!.id)
    await admin.from('admin_audit_events').delete().eq('subject_id', log!.id)
  })

  test('deleting a log records what was destroyed, not what it said', async () => {
    const { data: log } = await admin
      .from('behaviour_logs')
      .insert({
        student_id: world.childA,
        logged_by: world.verifiedEducator.id,
        behaviour_type: 'withdrawn',
        intensity: 'high',
        notes: secret,
        shared_with_parents: false,
      })
      .select('id')
      .single()

    await admin.from('behaviour_logs').delete().eq('id', log!.id)

    const { data } = await admin
      .from('admin_audit_events')
      .select('detail')
      .eq('subject_id', log!.id)
      .eq('action', 'behaviour_log.deleted')

    expect(data).toHaveLength(1)
    expect(data![0].detail).not.toContain(secret)
    // The incident is still described — type, intensity, when — because that is
    // what makes a deletion reviewable at all.
    expect(data![0].detail).toContain('withdrawn')
    expect(data![0].detail).toContain('high intensity')
    expect(data![0].detail).toContain('characters, sha256')

    await admin.from('admin_audit_events').delete().eq('subject_id', log!.id)
  })

  test('the fingerprint identifies the text it replaced', async () => {
    /*
     * The point of keeping a hash rather than nothing at all. Somebody in a
     * dispute produces the text they say was there; this is how it is checked.
     */
    const { data } = await admin.rpc('note_fingerprint', { t: secret })

    expect(data).toContain(`${secret.length} characters`)
    expect(data).toMatch(/sha256 [0-9a-f]{16}$/)
  })

  test('a blank note is called empty rather than fingerprinted', async () => {
    const { data } = await admin.rpc('note_fingerprint', { t: '   ' })

    // Hashing whitespace would report "3 characters" for a note that had none.
    expect(data).toBe('empty')
  })
})
