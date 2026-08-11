/**
 * Does file storage actually work, and does it refuse the right people?
 *
 *   npm run storage-check
 *
 * WHY THIS IS SEPARATE FROM security-check. That script acts as an anonymous
 * visitor. This one signs in as a real verified specialist, a real guardian and
 * a real signed-in stranger, because the interesting failures here are between
 * people who all have accounts.
 *
 * WHAT IT COVERS that reading the SQL does not:
 *
 *   - the bucket is private. If it is ever public, every object is served to
 *     anyone with the URL and no policy is consulted at all.
 *   - the three policies on storage.objects exist. They are on a table this
 *     project does not own, so they are the statements in db/030 most likely
 *     to have silently not applied.
 *   - a resource row can be read back immediately after being written. That
 *     round trip is what the upload flow depends on, and db/031 exists because
 *     it did not work.
 *   - THE EXACT QUERY THE SCREEN MAKES runs for a guardian. db/032 introduced
 *     a policy that called itself through another policy, and the whole page
 *     died with "infinite recursion detected in policy". Compiling, linting
 *     and every other check here passed while that was true.
 *   - a family sees their OWN child's share row and not the other families who
 *     were given the same material.
 *   - a signed-in stranger cannot download the file.
 *
 * A missing storage policy fails CLOSED, so nothing leaks either way — uploads
 * simply never work. That is the safe direction and the confusing one.
 *
 * Names everything 'RLS ...' / 'rls-...' so the test suite's own cleanup would
 * sweep up anything a crash leaves behind.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { loadEnv } from './lib/env.mjs'

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let failures = 0
const ok = (m) => console.log(`  ok    ${m}`)
const bad = (m) => {
  failures++
  console.log(`  FAIL  ${m}`)
}

const stamp = randomBytes(4).toString('hex')

/** Signs a new account in and hands back a client subject to RLS. */
async function actor(label, role, { schoolId = null, verified = false } = {}) {
  const email = `rls-storage-${label}-${stamp}@mizanova-test.invalid`
  const password = randomBytes(18).toString('base64url')

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: label, last_name: 'Test', role },
  })
  if (error) throw new Error(`${label}: ${error.message}`)

  await admin
    .from('profiles')
    .update({ school_id: schoolId, is_verified: verified })
    .eq('id', data.user.id)

  const db = createClient(url, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await db.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`${label} sign-in: ${signInError.message}`)

  return { id: data.user.id, db }
}

// --- 1. the buckets ----------------------------------------------------------
for (const id of ['resources', 'iep-documents']) {
  const { data: bucket, error } = await admin.storage.getBucket(id)
  if (error) bad(`bucket "${id}" missing — ${error.message}`)
  else if (bucket.public === true) {
    bad(`BUCKET "${id}" IS PUBLIC — every object is served to anyone with the URL`)
  } else {
    ok(`bucket "${id}" private, limit ${bucket.file_size_limit} bytes`)
  }
}

// --- 2. the tables -----------------------------------------------------------
for (const table of ['resources', 'resource_shares', 'resource_acknowledgements']) {
  const { error } = await admin.from(table).select('*', { head: true, count: 'exact' })
  if (error) bad(`${table} — ${error.message}`)
  else ok(`${table} exists`)
}

// --- 3. a world --------------------------------------------------------------
const { data: school } = await admin
  .from('schools')
  .insert({ name: `RLS Storage Probe ${stamp}` })
  .select('id')
  .single()

const { data: students } = await admin
  .from('students')
  .insert([
    { school_id: school.id, first_name: 'ProbeA', last_name: 'Alpha' },
    { school_id: school.id, first_name: 'ProbeB', last_name: 'Beta' },
  ])
  .select('id')
const [childA, childB] = students.map((s) => s.id)

const specialist = await actor('specialist', 'specialist', {
  schoolId: school.id,
  verified: true,
})
const teacher = await actor('teacher', 'educator', { schoolId: school.id, verified: true })
const guardianA = await actor('parenta', 'parent')
// Verified, and at the same school, but assigned to nobody. The interesting
// stranger: someone whose account is entirely legitimate.
const outsider = await actor('outsider', 'educator', { schoolId: school.id, verified: true })

await admin.from('student_educators').insert([
  { student_id: childA, profile_id: specialist.id, assignment: 'specialist' },
  { student_id: childB, profile_id: specialist.id, assignment: 'specialist' },
  { student_id: childA, profile_id: teacher.id, assignment: 'class_teacher' },
])
await admin.from('student_guardians').insert({ student_id: childA, profile_id: guardianA.id })

// --- 4. upload ---------------------------------------------------------------
const { data: resource, error: resourceError } = await specialist.db
  .from('resources')
  .insert({
    school_id: school.id,
    owner_id: specialist.id,
    title: 'Storage probe',
    category: 'handout',
  })
  .select('id')
  .single()

if (resourceError) {
  bad(`a verified specialist could not create a resource — ${resourceError.message}`)
} else {
  ok('a verified specialist can create a resource row')
}

let path = null
if (resource) {
  path = `${resource.id}/probe.pdf`
  const body = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], {
    type: 'application/pdf',
  })

  const { error: uploadError } = await specialist.db.storage
    .from('resources')
    .upload(path, body, { contentType: 'application/pdf' })

  if (uploadError) {
    bad(`UPLOAD REFUSED — the insert policy on storage.objects is missing. ${uploadError.message}`)
  } else {
    ok('the owner can upload into their own resource folder')
  }

  await specialist.db
    .from('resources')
    .update({ storage_path: path, mime_type: 'application/pdf', size_bytes: 5 })
    .eq('id', resource.id)

  const { error: downloadError } = await specialist.db.storage
    .from('resources')
    .download(path)
  if (downloadError) bad(`owner could not read back their own file — ${downloadError.message}`)
  else ok('the owner can read their own file')

  // --- 5. shared with two children, from two different families -------------
  const { error: shareError } = await specialist.db.from('resource_shares').insert([
    { resource_id: resource.id, student_id: childA, shared_by: specialist.id },
    { resource_id: resource.id, student_id: childB, shared_by: specialist.id },
  ])
  if (shareError) bad(`the owner could not share it — ${shareError.message}`)
  else ok('the owner can share it with children on their caseload')

  // --- 6. the guardian, using THE EXACT QUERY THE SCREEN MAKES --------------
  // Written out rather than simplified. A policy that recurses only shows
  // itself on the real query, and the simplified version would have passed
  // while the Resources page was completely dead.
  const { data: seen, error: seenError } = await guardianA.db
    .from('resources')
    .select(
      `id, owner_id, title, description, category, storage_path, mime_type,
       size_bytes, created_at,
       resource_shares ( id, student_id,
                         students ( first_name, last_name ),
                         resource_acknowledgements ( profile_id, acknowledged_at ) )`,
    )
    .order('created_at', { ascending: false })

  if (seenError) {
    bad(`THE PARENT RESOURCES PAGE WOULD FAIL — ${seenError.message}`)
  } else if ((seen ?? []).length !== 1) {
    bad(`a guardian saw ${(seen ?? []).length} resource(s), expected 1`)
  } else {
    ok('a guardian can load the Resources page')

    const shares = seen[0].resource_shares ?? []
    if (shares.length !== 1) {
      bad(
        `a guardian saw ${shares.length} share row(s) — they must see only their own child, not the other families given the same material`,
      )
    } else if (shares[0].student_id !== childA) {
      bad('a guardian saw the wrong child’s share row')
    } else {
      ok('a guardian sees only their own child’s share row')
    }
  }

  const { error: guardianDownload } = await guardianA.db.storage
    .from('resources')
    .download(path)
  if (guardianDownload) bad(`a guardian could not open a file shared with them — ${guardianDownload.message}`)
  else ok('a guardian can open a file shared with their child')

  // --- 7. the stranger ------------------------------------------------------
  const { data: stolen } = await outsider.db.storage.from('resources').download(path)
  if (stolen) bad('A SIGNED-IN STRANGER DOWNLOADED THE FILE — the select policy is wrong')
  else ok('a signed-in stranger cannot download it')

  const { data: stolenRow } = await outsider.db
    .from('resources')
    .select('id')
    .eq('id', resource.id)
  if ((stolenRow ?? []).length > 0) bad('a stranger can read the resource row')
  else ok('a stranger cannot read the resource row')

  // --- 8. delete ------------------------------------------------------------
  const { error: deleteError } = await specialist.db.storage.from('resources').remove([path])
  if (deleteError) bad(`owner could not delete their own file — ${deleteError.message}`)
  else ok('the owner can delete their own file')
}

// ---------------------------------------------------------------------------
// 9. The IEP bucket — db/034
// ---------------------------------------------------------------------------
// Different rules from resources and therefore a different bucket. A resource
// is shared with chosen children; a plan is visible to everyone already
// entitled to that child, without anyone deciding to share it.
const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], {
  type: 'application/pdf',
})

const { data: iepDoc, error: iepError } = await teacher.db
  .from('iep_documents')
  .insert({ student_id: childA, name: 'Probe IEP', created_by: teacher.id })
  .select('id')
  .single()

let iepPath = null
if (iepError) {
  bad(`an assigned teacher could not register an IEP document — ${iepError.message}`)
} else {
  ok('an assigned teacher can register an IEP document')
  iepPath = `${iepDoc.id}/plan.pdf`

  const { error: iepUpload } = await teacher.db.storage
    .from('iep-documents')
    .upload(iepPath, pdf, { contentType: 'application/pdf' })

  if (iepUpload) {
    bad(`the teacher could not attach the file — ${iepUpload.message}`)
    /**
     * EVERYTHING BELOW IS SKIPPED, NOT PASSED.
     *
     * The refusal tests download a file that now does not exist, and a missing
     * file is refused to everybody. They would print "an unassigned teacher
     * cannot open it" — true, and worthless, because there was nothing to
     * open. Reporting that as a pass is the exact fault this project has hit
     * in four other places.
     */
    bad('the IEP refusal tests could not run — there is no file to refuse')
  } else {
    ok('an assigned teacher can attach the file')

    const { error: familyRead } = await guardianA.db.storage
      .from('iep-documents')
      .download(iepPath)
    if (familyRead) bad(`the family could not open their child's plan — ${familyRead.message}`)
    else ok('the family can open their child’s plan')

    const { data: stolenIep } = await outsider.db.storage
      .from('iep-documents')
      .download(iepPath)
    if (stolenIep) bad('AN UNASSIGNED TEACHER DOWNLOADED A CHILD’S IEP')
    else ok('an unassigned teacher cannot open it')

    // A family may read a plan. They may never put one there — otherwise "the
    // school wrote this" stops being true of everything in the bucket.
    const { error: familyWrite } = await guardianA.db.storage
      .from('iep-documents')
      .upload(`${iepDoc.id}/forged.pdf`, pdf, { contentType: 'application/pdf' })
    if (familyWrite) ok('a family cannot add a file to a plan')
    else bad('A FAMILY UPLOADED INTO THE IEP BUCKET — the insert policy is wrong')
  }
}

// --- cleanup -----------------------------------------------------------------
for (const a of [specialist, teacher, guardianA, outsider]) await a.db.auth.signOut()
if (iepPath) {
  // Storage does not cascade from a table. Deleting the document row would
  // leave these behind for good.
  await admin.storage
    .from('iep-documents')
    .remove([iepPath, `${iepPath.split('/')[0]}/forged.pdf`])
}
if (path) await admin.storage.from('resources').remove([path])
if (resource) await admin.from('resources').delete().eq('id', resource.id)
await admin.from('students').delete().eq('school_id', school.id)
const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 })
for (const u of users?.users ?? []) {
  if ((u.email ?? '').startsWith(`rls-storage-`)) await admin.auth.admin.deleteUser(u.id)
}
await admin.from('schools').delete().eq('id', school.id)

console.log(
  failures === 0
    ? '\nPASS — storage and the resource policies behave for every role tested.'
    : `\nFAIL — ${failures} problem(s). Do not build on this yet.`,
)
process.exit(failures === 0 ? 0 : 1)
