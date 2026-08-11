import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  admin,
  buildSpecialistWorld,
  destroyWorld,
  type SpecialistWorld,
} from '../helpers/world'

/**
 * db/030 – db/033 — the resource library, and the files behind it.
 *
 * These tables produced two defects in a single afternoon, both found by
 * opening the page rather than by anything automated:
 *
 *   db/031  a SELECT policy that looked the row up in its own table, so
 *           `insert ... returning` failed and no upload could ever start.
 *   db/033  two policies querying each other's tables inline, so the whole
 *           page died with "infinite recursion detected in policy".
 *
 * Both compiled. Both linted. Both passed every other check in the project.
 * The regressions for them are the first two describes below, and they are the
 * reason this file exists rather than a general wish for coverage.
 *
 * WHAT IS NOT HERE. Uploading and downloading actual files, and the three
 * policies on storage.objects. Those need real binary round trips and live in
 * `npm run storage-check`, which signs in as the same cast of people.
 *
 * EVERY REFUSAL IS READ BACK WITH THE SERVICE KEY. Postgres does not raise an
 * error when a policy filters an UPDATE or a DELETE — it reports success and
 * changes nothing.
 */

let world: SpecialistWorld
/** Owned by the specialist, shared with nobody. */
let privateId: string
/** Owned by the specialist, shared with ChildA and ChildB — different families. */
let sharedId: string
let shareToA: string
let shareToB: string

beforeAll(async () => {
  world = await buildSpecialistWorld()

  // The world assigns the specialist to ChildA only. ChildB is needed here so
  // one resource can reach two families, which is the whole point of db/032.
  const { error: assignError } = await admin
    .from('student_educators')
    .insert({
      student_id: world.childB,
      profile_id: world.specialist.id,
      assignment: 'specialist',
    })
  if (assignError) throw new Error(assignError.message)

  const rows = []
  for (const title of ['Private material', 'Shared material']) {
    const { data, error } = await admin
      .from('resources')
      .insert({
        school_id: world.schoolId,
        owner_id: world.specialist.id,
        title,
        category: 'handout',
        storage_path: `${title.replace(/\W/g, '')}-${world.runId}/file.pdf`,
        mime_type: 'application/pdf',
        size_bytes: 1024,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    rows.push(data.id)
  }
  privateId = rows[0]
  sharedId = rows[1]

  const { data: shares, error: shareError } = await admin
    .from('resource_shares')
    .insert([
      { resource_id: sharedId, student_id: world.childA, shared_by: world.specialist.id },
      { resource_id: sharedId, student_id: world.childB, shared_by: world.specialist.id },
    ])
    .select('id, student_id')
  if (shareError) throw new Error(shareError.message)

  shareToA = shares.find((s) => s.student_id === world.childA)!.id
  shareToB = shares.find((s) => s.student_id === world.childB)!.id
}, 90_000)

afterAll(async () => {
  if (world) await destroyWorld(world)
}, 90_000)

/** The truth about a resource, read past RLS. */
async function exists(table: string, column: string, id: string): Promise<boolean> {
  const { data } = await admin.from(table).select(column).eq(column, id)
  return (data ?? []).length > 0
}

describe('regression — db/031, reading back what was just written', () => {
  test('a verified specialist can insert a resource AND get its id back', async () => {
    // THE FAILURE THIS GUARDS. `resources_select` called a STABLE function that
    // looked the row up in `resources`, and Postgres applies the SELECT policy
    // to rows returned by RETURNING — against a snapshot from before the
    // insert, in which the row does not exist. The insert was rejected as
    // violating row-level security while every condition in the INSERT policy
    // was true.
    //
    // Uploading needs this id to build the storage path, so without it no file
    // could ever be uploaded.
    const { data, error } = await world.specialist.db
      .from('resources')
      .insert({
        school_id: world.schoolId,
        owner_id: world.specialist.id,
        title: 'Insert with returning',
        category: 'other',
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })

  test('and can then set the storage path on it', async () => {
    // The third step of an upload. If this were refused, every resource would
    // stay pathless and be filtered out of the list as a failed upload.
    const { data: created } = await world.specialist.db
      .from('resources')
      .insert({
        school_id: world.schoolId,
        owner_id: world.specialist.id,
        title: 'Path update',
        category: 'other',
      })
      .select('id')
      .single()

    const { data, error } = await world.specialist.db
      .from('resources')
      .update({ storage_path: `${created!.id}/x.pdf`, size_bytes: 10 })
      .eq('id', created!.id)
      .select('id')

    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })
})

describe('regression — db/033, policies that called each other', () => {
  test('a guardian can run the query the Resources page actually makes', async () => {
    // WRITTEN OUT, NOT SIMPLIFIED. The recursion only appeared when the embed
    // caused both policies to be evaluated together. A tidier `select('id')`
    // passes while the real page is dead.
    const { data, error } = await world.guardianOfA.db
      .from('resources')
      .select(
        `id, owner_id, title, description, category, storage_path, mime_type,
         size_bytes, created_at,
         resource_shares ( id, student_id,
                           students ( first_name, last_name ),
                           resource_acknowledgements ( profile_id, acknowledged_at ) )`,
      )
      .order('created_at', { ascending: false })

    expect(error).toBeNull()
    expect(data?.map((r) => r.id)).toEqual([sharedId])
  })

  test('so can a teacher, and a school administrator', async () => {
    for (const actor of [world.verifiedEducator, world.schoolAdmin]) {
      const { error } = await actor.db
        .from('resources')
        .select('id, resource_shares ( id, student_id )')
      expect(error).toBeNull()
    }
  })
})

describe('a share row is about one child', () => {
  test('a guardian sees only their own child’s share', async () => {
    // The material went to two families. Before db/032 this returned both, so
    // each family learned another child had been given the same therapy
    // resource — a fact about that child, not about them.
    const { data } = await world.guardianOfA.db
      .from('resource_shares')
      .select('id, student_id')

    expect(data?.map((r) => r.id)).toEqual([shareToA])
  })

  test('and the other family sees only theirs', async () => {
    const { data } = await world.guardianOfB.db
      .from('resource_shares')
      .select('id, student_id')

    expect(data?.map((r) => r.id)).toEqual([shareToB])
  })

  test('the owner sees both, because they made them', async () => {
    const { data } = await world.specialist.db
      .from('resource_shares')
      .select('id')
      .eq('resource_id', sharedId)

    expect(data?.map((r) => r.id).sort()).toEqual([shareToA, shareToB].sort())
  })
})

describe('who can see a resource', () => {
  test('the owner sees their own, shared or not', async () => {
    const { data } = await world.specialist.db
      .from('resources')
      .select('id')
      .in('id', [privateId, sharedId])

    expect(data?.length).toBe(2)
  })

  test('nobody else sees an unshared one', async () => {
    for (const [label, actor] of [
      ['assigned teacher', world.verifiedEducator],
      ['guardian', world.guardianOfA],
      ['school admin', world.schoolAdmin],
      ['colleague specialist', world.otherSpecialist],
    ] as const) {
      const { data } = await actor.db.from('resources').select('id').eq('id', privateId)
      expect(data ?? [], `${label} should not see an unshared resource`).toEqual([])
    }
  })

  test('an assigned teacher sees one shared with their student', async () => {
    const { data } = await world.verifiedEducator.db
      .from('resources')
      .select('id')
      .eq('id', sharedId)

    expect(data?.length).toBe(1)
  })

  test('a guardian sees one shared with their child', async () => {
    const { data } = await world.guardianOfA.db
      .from('resources')
      .select('id')
      .eq('id', sharedId)

    expect(data?.length).toBe(1)
  })

  test('a school administrator sees their school’s — unlike clinical notes', async () => {
    // Deliberately different from db/028. A practice handout is teaching
    // material, not a therapy record, and an administrator who cannot see what
    // is being given to families cannot do their job.
    const { data } = await world.schoolAdmin.db
      .from('resources')
      .select('id')
      .eq('id', sharedId)

    expect(data?.length).toBe(1)
  })

  test('an unrelated family sees nothing of it', async () => {
    // guardianOfB IS entitled to this resource, through ChildB. So the honest
    // test of "an unrelated family" is the resource that went nowhere.
    const { data } = await world.guardianOfB.db
      .from('resources')
      .select('id')
      .eq('id', privateId)

    expect(data ?? []).toEqual([])
  })

  test('an unverified specialist on the same caseload sees nothing', async () => {
    const { data } = await world.unverifiedSpecialist.db.from('resources').select('id')
    expect(data ?? []).toEqual([])
  })

  test('a platform administrator sees everything', async () => {
    const { data } = await world.platformAdmin.db
      .from('resources')
      .select('id')
      .in('id', [privateId, sharedId])

    expect(data?.length).toBe(2)
  })
})

describe('only a verified specialist uploads, into their own school', () => {
  test('not for another school', async () => {
    const { error } = await world.specialist.db.from('resources').insert({
      school_id: world.otherSchoolId,
      owner_id: world.specialist.id,
      title: 'Wrong school',
      category: 'other',
    })

    expect(error).not.toBeNull()
  })

  test('not under a colleague’s name', async () => {
    const { error } = await world.specialist.db.from('resources').insert({
      school_id: world.schoolId,
      owner_id: world.otherSpecialist.id,
      title: 'Wrong owner',
      category: 'other',
    })

    expect(error).not.toBeNull()
  })

  test('a teacher cannot upload one', async () => {
    const { error } = await world.verifiedEducator.db.from('resources').insert({
      school_id: world.schoolId,
      owner_id: world.verifiedEducator.id,
      title: 'By a teacher',
      category: 'other',
    })

    expect(error).not.toBeNull()
  })

  test('a guardian cannot upload one', async () => {
    const { error } = await world.guardianOfA.db.from('resources').insert({
      school_id: world.schoolId,
      owner_id: world.guardianOfA.id,
      title: 'By a parent',
      category: 'other',
    })

    expect(error).not.toBeNull()
  })

  test('an unverified specialist cannot upload one', async () => {
    const { error } = await world.unverifiedSpecialist.db.from('resources').insert({
      school_id: world.schoolId,
      owner_id: world.unverifiedSpecialist.id,
      title: 'By an unverified specialist',
      category: 'other',
    })

    expect(error).not.toBeNull()
  })
})

describe('sharing is the owner’s decision', () => {
  test('a teacher who received it cannot pass it to another family', async () => {
    // The most realistic misuse. A teacher has the material in front of them
    // and a second family who would benefit; the answer has to be no, because
    // the specialist decides who their clinical material reaches.
    const { error } = await world.verifiedEducator.db.from('resource_shares').insert({
      resource_id: sharedId,
      student_id: world.childB,
      shared_by: world.verifiedEducator.id,
    })

    expect(error).not.toBeNull()
  })

  test('a colleague specialist cannot share somebody else’s resource', async () => {
    const { error } = await world.otherSpecialist.db.from('resource_shares').insert({
      resource_id: sharedId,
      student_id: world.childA,
      shared_by: world.otherSpecialist.id,
    })

    expect(error).not.toBeNull()
  })

  test('the owner cannot share with a child they do not carry', async () => {
    // Otherwise "share" becomes a way of finding out whether a student id is
    // real, by watching which ones are accepted.
    const { error } = await world.specialist.db.from('resource_shares').insert({
      resource_id: sharedId,
      student_id: world.outsiderChild,
      shared_by: world.specialist.id,
    })

    expect(error).not.toBeNull()
  })

  test('a guardian cannot share a resource with their own child', async () => {
    const { error } = await world.guardianOfA.db.from('resource_shares').insert({
      resource_id: privateId,
      student_id: world.childA,
      shared_by: world.guardianOfA.id,
    })

    expect(error).not.toBeNull()
  })

  test('a teacher cannot revoke a share', async () => {
    await world.verifiedEducator.db.from('resource_shares').delete().eq('id', shareToA)
    expect(await exists('resource_shares', 'id', shareToA)).toBe(true)
  })

  test('a guardian cannot revoke a share', async () => {
    await world.guardianOfA.db.from('resource_shares').delete().eq('id', shareToA)
    expect(await exists('resource_shares', 'id', shareToA)).toBe(true)
  })
})

describe('“I have read this” means what it says', () => {
  test('a guardian can record their own read', async () => {
    const { error } = await world.guardianOfA.db
      .from('resource_acknowledgements')
      .insert({ share_id: shareToA, profile_id: world.guardianOfA.id })

    expect(error).toBeNull()
  })

  test('nobody can record it on somebody else’s behalf', async () => {
    // The entire value of the record. A specialist marking a family as having
    // read something would make the field worse than absent.
    const { error } = await world.specialist.db
      .from('resource_acknowledgements')
      .insert({ share_id: shareToA, profile_id: world.guardianOfA.id })

    expect(error).not.toBeNull()
  })

  test('a family cannot acknowledge a share they cannot see', async () => {
    const { error } = await world.guardianOfB.db
      .from('resource_acknowledgements')
      .insert({ share_id: shareToA, profile_id: world.guardianOfB.id })

    expect(error).not.toBeNull()
  })

  test('the other family cannot see that this one confirmed', async () => {
    const { data } = await world.guardianOfB.db
      .from('resource_acknowledgements')
      .select('share_id')

    expect(data ?? []).toEqual([])
  })

  test('the specialist can see that it was read', async () => {
    const { data } = await world.specialist.db
      .from('resource_acknowledgements')
      .select('share_id, profile_id')
      .eq('share_id', shareToA)

    expect(data?.length).toBe(1)
    expect(data?.[0].profile_id).toBe(world.guardianOfA.id)
  })

  test('a confirmation cannot be withdrawn or backdated', async () => {
    // There is no update and no delete policy. "I have read this" is not a
    // claim to be quietly taken back later.
    await world.guardianOfA.db
      .from('resource_acknowledgements')
      .delete()
      .eq('share_id', shareToA)

    const { data } = await admin
      .from('resource_acknowledgements')
      .select('share_id')
      .eq('share_id', shareToA)

    expect(data?.length).toBe(1)
  })
})

describe('deleting a resource', () => {
  test('a teacher cannot delete one', async () => {
    await world.verifiedEducator.db.from('resources').delete().eq('id', sharedId)
    expect(await exists('resources', 'id', sharedId)).toBe(true)
  })

  test('a school administrator cannot delete one', async () => {
    await world.schoolAdmin.db.from('resources').delete().eq('id', sharedId)
    expect(await exists('resources', 'id', sharedId)).toBe(true)
  })

  test('a colleague specialist cannot delete one', async () => {
    await world.otherSpecialist.db.from('resources').delete().eq('id', sharedId)
    expect(await exists('resources', 'id', sharedId)).toBe(true)
  })

  test('the owner can — unlike a behaviour log or a session', async () => {
    // Deliberately different. Those are records of things that happened. This
    // is content, and a video of the wrong child has to be removable.
    const { data: mine } = await admin
      .from('resources')
      .insert({
        school_id: world.schoolId,
        owner_id: world.specialist.id,
        title: 'To be deleted',
        category: 'other',
      })
      .select('id')
      .single()

    await world.specialist.db.from('resources').delete().eq('id', mine!.id)
    expect(await exists('resources', 'id', mine!.id)).toBe(false)
  })
})
