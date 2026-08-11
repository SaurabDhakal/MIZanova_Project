import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const a = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const iso = (daysAgo, h, m) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
const dateOnly = (daysAgo) => iso(daysAgo, 9, 0).slice(0, 10)

const { data: students } = await a
  .from('students')
  .select('id, first_name, last_name')
const by = (n) => students.find((s) => s.first_name === n).id
const ETHAN = by('Ethan'), MAYA = by('Maya'), SOFIA = by('Sofia'), JULIAN = by('Julian')

const { data: teacher } = await a
  .from('profiles').select('id').eq('email', 'educator@mizanova.com.au').single()
const { data: parent } = await a
  .from('profiles').select('id').eq('role', 'parent').limit(1).single()
const TEACHER = teacher.id

// --- 1. Remove the junk, keep anything carrying real AI output -------------
const { data: strategies } = await a.from('ai_strategies').select('behaviour_log_id')
const keepIds = [...new Set(strategies.map((s) => s.behaviour_log_id))]
const { data: allLogs } = await a.from('behaviour_logs').select('id')
const junk = allLogs.map((l) => l.id).filter((id) => !keepIds.includes(id))
await a.from('behaviour_logs').delete().in('id', junk)
console.log(`deleted ${junk.length} junk logs, kept ${keepIds.length} carrying real AI strategies`)

// Give the kept logs notes a teacher would actually have written. The AI
// strategies attached to them are general classroom advice for the behaviour
// TYPE, which is unchanged, so they still fit.
const rewrites = {
  disruptive: [
    'Called out over the top of three other children during silent reading. Settled after a reminder but repeated it twice.',
    'Left his seat six times during the maths block. Went to the window each time, came back when asked.',
    'Talked over the group during a shared task and took the materials before others had a turn.',
    'Tipped his chair and knocked into the desk behind twice. Apologised both times without prompting.',
    'Interrupted the class discussion four times in ten minutes, each time on topic but without waiting.',
  ],
  withdrawn: [
    'Sat apart from the group for the whole of morning literacy. Did not respond to two invitations to join.',
    'Face down on the desk for most of the reading block. Answered in single words when asked directly.',
    'Stood at the edge of the yard through the whole of first break, watching but not joining.',
  ],
  emotional: [
    'Cried at the start of the spelling test and asked to leave the room. Returned after five minutes.',
    'Became upset when his group changed the plan without asking him. Needed time at the calm table.',
    'Tearful after lunch, said nobody would let him join the game.',
  ],
  physical: [
    'Pushed another child during group work when they took the last of the shared materials.',
    'Threw a pencil case across the desk after a mistake in his work. No one was hit.',
  ],
}
const used = { disruptive: 0, withdrawn: 0, emotional: 0, physical: 0 }
let rewritten = 0
for (const id of keepIds) {
  const { data: log } = await a
    .from('behaviour_logs').select('id, behaviour_type, notes').eq('id', id).single()
  if (!log) continue
  const pool = rewrites[log.behaviour_type]
  const note = pool[used[log.behaviour_type]++ % pool.length]
  await a.from('behaviour_logs').update({ notes: note }).eq('id', id)
  rewritten++
}
console.log(`rewrote ${rewritten} notes into something a teacher would have written`)

// --- 2. New logs, spread across six weeks ---------------------------------
// ended_at null on all of them: a teacher writing up after the fact did not
// time the incident, and the new timer records nothing when nobody pressed
// start. Inventing durations here would put back the exact fault just removed.
const newLogs = [
  [ETHAN, 'disruptive', 'medium', 2, 11, 20, 'Called out during the maths explanation and kept going after a reminder.', false, true],
  [ETHAN, 'emotional', 'high', 4, 13, 45, 'Very upset after losing a game at lunch. Took fifteen minutes at the calm table before he could talk about it.', true, true],
  [ETHAN, 'disruptive', 'standard', 8, 9, 55, 'Out of his seat three times during handwriting. Settled once he had the weighted cushion.', false, false],
  [ETHAN, 'physical', 'high', 11, 14, 10, 'Pushed a child who took the ball. Separated immediately, both spoken to. Parents informed.', true, true],
  [ETHAN, 'withdrawn', 'standard', 15, 10, 5, 'Quiet all morning, would not choose a partner. Worked alone when offered the option.', false, false],
  [ETHAN, 'disruptive', 'medium', 22, 11, 0, 'Interrupted the read-aloud repeatedly. Responded well to being given a job.', false, true],
  [MAYA, 'withdrawn', 'standard', 3, 9, 30, 'Did not speak during the whole of morning circle. Nodded answers when asked directly.', false, true],
  [MAYA, 'emotional', 'medium', 9, 12, 15, 'Tearful when her group changed seats. Settled after being given a moment on her own.', false, false],
  [MAYA, 'withdrawn', 'medium', 17, 13, 20, 'Stayed inside at lunch for the third day this week. Said she was tired.', true, false],
  [SOFIA, 'withdrawn', 'standard', 5, 10, 40, 'Very quiet in the larger group, though talkative one to one with me afterwards.', false, true],
  [SOFIA, 'emotional', 'standard', 12, 14, 0, 'Worried about the class presentation. Asked three times whether she had to do it.', false, false],
  [JULIAN, 'disruptive', 'standard', 6, 11, 45, 'Chatting through the instructions. Stopped when moved to the front.', false, false],
  [JULIAN, 'emotional', 'medium', 19, 9, 15, 'Arrived upset after drop-off. Needed ten minutes before joining the class.', false, true],
]
let made = 0
for (const [sid, type, intensity, days, h, m, notes, flagged, shared] of newLogs) {
  const at = iso(days, h, m)
  const { error } = await a.from('behaviour_logs').insert({
    student_id: sid, logged_by: TEACHER, behaviour_type: type, intensity,
    notes, notes_source: 'typed', started_at: at, ended_at: null, occurred_at: at,
    client_ref: randomUUID(),
    is_risk_flagged: flagged,
    risk_note: flagged ? 'Raised for the safeguarding queue at the time of logging.' : null,
    shared_with_parents: shared,
  })
  if (error) console.log('  log failed:', error.message.slice(0, 70))
  else made++
}
console.log(`added ${made} new behaviour logs across six weeks`)

// --- 3. Goals ---------------------------------------------------------------
// The plan goes first. It references goals via iep_goals.goal_id, and until
// db/057 an agreed plan made those goals undeletable — which is how that bug
// was found. Removing the dependent record before its dependency is right
// either way.
await a.from('iep_plans').delete().eq('student_id', ETHAN)
await a.from('goals').delete().neq('id', '00000000-0000-0000-0000-000000000000')
console.log('cleared the old goals (flexibility / dance / duplicates)')

const goalSpec = [
  [ETHAN, 'Stay with the group during whole-class teaching', 'By the end of term, Ethan will remain seated and attending for a 15-minute whole-class input in 4 of 5 lessons, with one non-verbal prompt.', 'emotional_regulation', 'on_track', 45,
    [['Remains seated for 5 minutes with a prompt', true], ['Remains seated for 10 minutes with a prompt', true], ['Remains seated for 15 minutes with one prompt', false], ['Remains seated for 15 minutes unprompted', false]]],
  [ETHAN, 'Ask for a break instead of leaving the room', 'By the end of term, Ethan will use the break card to request time out in 4 of 5 instances rather than leaving without warning.', 'emotional_regulation', 'on_track', 33,
    [['Uses the card when reminded by an adult', true], ['Uses the card independently once a week', false], ['Uses the card independently most days', false]]],
  [MAYA, 'Contribute once in morning circle', 'By September, Maya will offer one idea in morning circle at 3 of 5 sessions, with no more than one prompt.', 'social_communication', 'on_track', 50,
    [['Answers a direct question in a group of four', true], ['Offers an idea with a prompt', true], ['Offers an idea unprompted', false], ['Does so at 3 of 5 sessions', false]]],
  [SOFIA, 'Join a shared game at break', 'By the end of term, Sofia will join a running game with peers at least twice a week, initially with adult support.', 'social_communication', 'on_track', 25,
    [['Joins a game with an adult alongside', true], ['Joins a game after an adult introduces her', false], ['Joins a game on her own', false], ['Does so twice in one week', false]]],
  [JULIAN, 'Follow two-step instructions first time', 'By the end of term, Julian will follow a two-step instruction without repetition in 4 of 5 opportunities.', 'other', 'not_started', 0,
    [['Follows a one-step instruction first time', false], ['Follows a two-step instruction with one repeat', false], ['Follows a two-step instruction first time', false]]],
]
const goalIds = {}
for (const [sid, title, description, category, status, percent, milestones] of goalSpec) {
  const { data: g, error } = await a.from('goals').insert({
    student_id: sid, title, description, category, status,
    target_date: dateOnly(-60), progress_percent: percent, created_by: TEACHER,
  }).select('id').single()
  if (error) { console.log('  goal failed:', error.message.slice(0, 80)); continue }
  goalIds[title] = g.id
  let order = 0
  for (const [mTitle, done] of milestones) {
    await a.from('goal_milestones').insert({
      goal_id: g.id, title: mTitle, is_done: done, sort_order: order++,
      done_at: done ? iso(20 - order * 3, 15, 0) : null,
      done_by: done ? TEACHER : null,
    })
  }
}
console.log(`created ${Object.keys(goalIds).length} goals with milestones, some already ticked`)

// --- 4. An agreed education plan for Ethan --------------------------------

const { data: plan, error: planError } = await a.from('iep_plans').insert({
  student_id: ETHAN,
  plan_date: dateOnly(28),
  home_languages: 'English',
  baseline:
    'Ethan is confident with numbers and enjoys construction and building tasks, where he will persist for long periods. He reads fluently and willingly one to one.\n\nHe finds whole-class teaching hard to sustain and will leave his seat when the input runs beyond about ten minutes. He does not yet ask for a break before he needs one. Friendships are important to him and most incidents follow a disagreement in a game rather than a task.',
  proposed_review_date: dateOnly(-14),
  created_by: TEACHER,
}).select('id').single()

if (planError) console.log('  plan failed:', planError.message.slice(0, 90))
else {
  for (const [name, role] of [['Sarah Mitchell', 'Parent'], ['Educator 1', 'Class teacher'], ['A. Rai', 'Speech pathologist'], ['J. Blake', 'Learning support']]) {
    await a.from('iep_plan_participants').insert({ plan_id: plan.id, person_name: name, person_role: role })
  }
  const areas = [
    ['Self regulation',
     'By the end of the year, Ethan will use an agreed break routine to manage frustration in 4 of 5 observed instances, without leaving the classroom unannounced.',
     'By the end of this term, Ethan will use the break card with one adult prompt in 3 of 5 instances.',
     'Break card kept on his desk, not in the tray. Agreed non-verbal signal with the class teacher. Five-minute warning before any transition. Weighted cushion available during whole-class input.'],
    ['Social — playground',
     'By the end of the year, Ethan will resolve a disagreement in a game without physical contact in 4 of 5 observed instances.',
     'By the end of this term, Ethan will seek an adult when a game breaks down, in 3 of 5 instances.',
     'Rehearse two scripts weekly with learning support. Named adult on duty he can go to. Restorative conversation after any incident, same day.'],
    ['Transition to Year 5',
     'By the end of the year, Ethan will have visited his Year 5 classroom four times and met his teacher, with a transition book he has helped make.',
     'By the end of this term, two visits completed and the book started.',
     'Fortnightly visits from week 4. Photographs for the book taken by Ethan. Handover meeting with both teachers and the family in the last fortnight.'],
  ]
  const linkFor = {
    'Self regulation': goalIds['Ask for a break instead of leaving the room'],
    'Social — playground': goalIds['Stay with the group during whole-class teaching'],
  }
  let order = 0
  for (const [area, longTerm, shortTerm, strategiesText] of areas) {
    await a.from('iep_goals').insert({
      plan_id: plan.id, area_of_concern: area,
      long_term_goal: longTerm, short_term_goal: shortTerm,
      strategies: strategiesText, sort_order: order++,
      // Linked BY NAME, not by position. A first draft used `order === 1`
      // after `order++` had already run, which tied "Stay with the group" to
      // the playground area — the pill on the profile said so plainly.
      goal_id: linkFor[area] ?? null,
    })
  }
  for (const [day, staff, role, intervention, hours] of [
    ['monday', 'J. Blake', 'Learning support', 'In-class support, literacy block', 1.5],
    ['tuesday', 'A. Rai', 'Speech pathologist', 'Small group, social scripts', 0.75],
    ['wednesday', 'J. Blake', 'Learning support', 'In-class support, maths block', 1.5],
    ['thursday', 'J. Blake', 'Learning support', 'Playground support at first break', 0.5],
    ['friday', 'J. Blake', 'Learning support', 'In-class support, literacy block', 1.5],
  ]) {
    await a.from('iep_support_sessions').insert({
      plan_id: plan.id, weekday: day, staff_name: staff, staff_role: role,
      intervention, hours,
    })
  }
  await a.from('iep_plans').update({ status: 'agreed' }).eq('id', plan.id)
  console.log('created an AGREED plan for Ethan: 3 areas of concern, 4 participants, 5 support sessions')
}

// --- 5. A few notes from home ---------------------------------------------
if (parent) {
  // Re-runnable: remove the ones this script wrote before writing them again.
  await a.from('home_observations').delete().in('title', ['Rough night', 'Good week at swimming', 'Worried about the test'])
  for (const [sid, days, title, body] of [
    [ETHAN, 3, 'Rough night', 'Awake from about 4am and very tired at breakfast. He may be short-tempered today.'],
    [ETHAN, 10, 'Good week at swimming', 'He has been much calmer since swimming started on Tuesdays. He talks about it all week.'],
    [MAYA, 6, 'Worried about the test', 'She has mentioned the spelling test three times this weekend. Reassurance did not settle it.'],
  ]) {
    await a.from('home_observations').insert({
      student_id: sid, logged_by: parent.id, title, body,
      observed_on: dateOnly(days), category: 'other',
    })
  }
  console.log('added 3 notes from home')
}

// --- What it looks like now -----------------------------------------------
console.log('\nPER STUDENT')
for (const s of students) {
  const c = async (t, col = 'student_id') =>
    (await a.from(t).select('*', { count: 'exact', head: true }).eq(col, s.id)).count
  console.log(`  ${(s.first_name + ' ' + s.last_name).padEnd(22)} logs:${String(await c('behaviour_logs')).padStart(3)}  goals:${await c('goals')}  plans:${await c('iep_plans')}  fromHome:${await c('home_observations')}`)
}
