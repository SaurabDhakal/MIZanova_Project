/**
 * ---------------------------------------------------------------------------
 * A LIVED-IN INDIVIDUAL ACCOUNT, FOR SHOWING THE PRODUCT
 * ---------------------------------------------------------------------------
 * Every individual screen is designed twice: once for somebody who has been
 * using it for two months, and once for somebody who signed up an hour ago.
 * Only the second one was ever visible, because the demo account has never had
 * any data in it — so Home, Goals, Suggestions, Sessions and What works for me
 * all showed their empty state, and the half of the design that carries the
 * product could not be seen by anybody being shown it.
 *
 * This fills one account with six weeks of plausible history: goals with
 * check-ins written the way somebody writes at the end of a bad Tuesday,
 * suggestions marked helped and not-helped, two courses part-finished, and a
 * session that has been accepted.
 *
 * ---------------------------------------------------------------------------
 * THIS WRITES TO THE REAL DATABASE, WHICH IS WHY IT IS THIS CAREFUL
 * ---------------------------------------------------------------------------
 * There is one Supabase project behind both localhost and mizanova-project.com
 * — the same rows serve both — and there are three accounts with role
 * 'individual' on it, two of them belonging to actual people. So:
 *
 *   - the account is named by email on the command line, never guessed, never
 *     defaulted, and never selected by "the first individual";
 *   - the script refuses any profile whose role is not 'individual', and any
 *     email on the protected list below;
 *   - `--remove` takes every row back out, so nothing here is one-way.
 *
 * ---------------------------------------------------------------------------
 *   node --env-file=.env.local scripts/seed-individual-demo.mjs <email>
 *   node --env-file=.env.local scripts/seed-individual-demo.mjs <email> --remove
 * ---------------------------------------------------------------------------
 *
 * THE CONTENT IS INVENTED AND IS MEANT TO READ AS IF IT IS NOT. The persona is
 * the one this role exists for and the one the Suggestions page already writes
 * its starter prompts for: an adult whose difficulty is starting, finishing and
 * remembering, not a child in a classroom. Nothing here is copied from a real
 * account.
 *
 * The AI rows are written as the server writes them — `asked` holds the text
 * AFTER redaction, the model is the one `server/claude.js` names, and
 * `prompt_version` matches `SELF_PROMPT_VERSION` — so the AI governance and
 * audit screens read these the same way they read genuine ones. One request
 * carries a redaction and a withheld suggestion, because a demo where nothing
 * was ever stripped or held back does not show what the product does.
 */

import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

/**
 * Accounts this script will not touch under any argument. Two real people
 * signed up as individuals on the live project; a fat-fingered email should
 * fail loudly rather than write six weeks of invented history into somebody's
 * actual account.
 */
const NEVER = ['joeabboud743@gmail.com', 'raquibdoza@gmail.com']

/**
 * Everything below runs inside a function rather than at the top level for one
 * reason found by testing the refusals: `process.exit()` here races libuv's
 * teardown of the keep-alive socket supabase-js leaves open, and on Windows
 * that aborts the process with an assertion AND an exit code of 127 — "command
 * not found" to anything wrapping this script, for what is really "no profile
 * with that email". Returning a code and letting the event loop drain reports
 * the failure the script actually had.
 */
async function main() {
  const args = process.argv.slice(2)
  const email = args.find((a) => !a.startsWith('--'))
  const remove = args.includes('--remove')

  if (!email) {
    console.error(
      'Name the account:\n' +
        '  node --env-file=.env.local scripts/seed-individual-demo.mjs <email> [--remove]',
    )
    return 1
  }
  if (NEVER.includes(email.toLowerCase())) {
    console.error(`Refusing: ${email} is on the protected list in this script.`)
    return 1
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('email', email)
    .maybeSingle()

  if (profileError) {
    console.error('Could not read profiles:', profileError.message)
    return 1
  }
  if (!profile) {
    console.error(`No profile with email ${email}.`)
    return 1
  }
  if (profile.role !== 'individual') {
    console.error(
      `Refusing: ${email} has role '${profile.role}', not 'individual'.`,
    )
    return 1
  }

  const ME = profile.id
  console.log(`Account: ${profile.full_name} <${profile.email}> (${ME})`)

  /** Days back from now, at a given hour, as an ISO timestamp. */
  const ago = (days, h = 9, m = 0) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }
  /** Days forward from now. */
  const ahead = (days, h = 10, m = 0) => ago(-days, h, m)
  const dateOnly = (days) => ago(days).slice(0, 10)

  // ---------------------------------------------------------------------------
  // REMOVE — every table this script writes, for this profile only.
  // ---------------------------------------------------------------------------
  // Ordered children-first even though the foreign keys cascade, so the counts
  // printed are the counts actually deleted rather than a cascade's silence.
  // ---------------------------------------------------------------------------
  async function wipe() {
    const { data: goals } = await db
      .from('individual_goals')
      .select('id')
      .eq('profile_id', ME)
    const goalIds = (goals ?? []).map((g) => g.id)

    const { data: requests } = await db
      .from('individual_ai_requests')
      .select('id')
      .eq('profile_id', ME)
    const requestIds = (requests ?? []).map((r) => r.id)

    const { data: enrolments } = await db
      .from('course_enrolments')
      .select('id')
      .eq('profile_id', ME)
    const enrolmentIds = (enrolments ?? []).map((e) => e.id)

    const counts = {}
    const del = async (table, column, values) => {
      if (values.length === 0) return (counts[table] = 0)
      const { error, count } = await db
        .from(table)
        .delete({ count: 'exact' })
        .in(column, values)
      if (error) throw new Error(`${table}: ${error.message}`)
      counts[table] = count
    }

    await del('individual_goal_checkins', 'goal_id', goalIds)
    await del('individual_ai_suggestions', 'request_id', requestIds)
    await del('module_completions', 'enrolment_id', enrolmentIds)
    await del('individual_goals', 'id', goalIds)
    await del('individual_ai_requests', 'id', requestIds)
    await del('course_enrolments', 'id', enrolmentIds)

    const { error: bookingError, count: bookingCount } = await db
      .from('individual_bookings')
      .delete({ count: 'exact' })
      .eq('profile_id', ME)
    if (bookingError) throw new Error(`individual_bookings: ${bookingError.message}`)
    counts.individual_bookings = bookingCount

    for (const [table, n] of Object.entries(counts)) {
      console.log(`  removed ${String(n).padStart(3)}  ${table}`)
    }
  }

  await wipe()
  if (remove) {
    console.log('Removed. The account is back to empty.')
    return 0
  }

  // ---------------------------------------------------------------------------
  // GOALS, AND THE CHECK-INS UNDER THEM
  // ---------------------------------------------------------------------------
  // One of each status, because the Goals screen renders active, done and parked
  // differently and a demo that only has 'active' shows a third of the page.
  //
  // The notes are the point. A check-in reading "went well" proves the field
  // saves; a check-in reading "Sat down at 11. Opened email first, which was the
  // mistake." is what somebody actually types, and it is the difference between
  // a screen that looks populated and one that looks used.
  // ---------------------------------------------------------------------------
  const goalSpec = [
    {
      title: 'Be at my desk and started by 9:30',
      why: 'Because I keep promising myself Tuesday will be different, and then it is Thursday.',
      status: 'active',
      target_date: dateOnly(-18),
      created: ago(42, 20, 15),
      checkins: [
        [38, 'hard', 'Sat down at 11. Opened email first, which was the mistake.'],
        [34, 'mixed', 'Ten to ten. Closer. Left my phone in the kitchen overnight.'],
        [27, 'good', 'Started at 9:25 and had the first paragraph written before I checked anything.'],
        [20, 'hard', 'Bad night. Wrote off the morning by about 10 and felt awful about it all day.'],
        [13, 'good', 'Three mornings running now. The night-before note is doing most of the work.'],
        [6, 'mixed', 'Twenty to ten, but without the panic, which I am counting.'],
        [2, 'good', 'Quarter past nine. Did not look at my phone until the first thing was done.'],
      ],
    },
    {
      title: 'Answer messages the same day I read them',
      why: 'People think I am ignoring them. I am not — I read it, decide to reply properly later, and later does not arrive.',
      status: 'active',
      target_date: null,
      created: ago(21, 21, 40),
      checkins: [
        [16, 'mixed', 'Cleared four. Left two for when I have the words. Those two are still there.'],
        [9, 'good', 'Answered everything within the hour. Short replies are still replies.'],
        [3, 'hard', 'Fourteen unread by Friday. Lost the thread somewhere on Wednesday.'],
      ],
    },
    {
      // No `why`, on purpose: the column is optional and somebody who cannot
      // articulate the reason should still be able to set the goal.
      title: 'One proper break at lunch, away from the screen',
      why: null,
      status: 'active',
      target_date: dateOnly(-25),
      created: ago(9, 12, 30),
      checkins: [
        [5, 'good', 'Walked to the end of the road and back. Twelve minutes and it felt like an hour off.'],
        [1, 'mixed', 'Ate at the desk but did not work while I did. Half a win.'],
      ],
    },
    {
      title: 'Get the tax return sent',
      why: 'It has been on the list since July and it is the thing I think about at two in the morning.',
      status: 'done',
      done_at: ago(5, 16, 20),
      target_date: dateOnly(2),
      created: ago(24, 22, 5),
      checkins: [
        [18, 'hard', 'Opened the folder. Closed the folder.'],
        [11, 'mixed', 'Got every receipt into one place. That turned out to be the whole of it.'],
        [5, 'good', 'Sent. Forty minutes, once the receipts were in one place.'],
      ],
    },
    {
      title: 'Read for twenty minutes before bed instead of my phone',
      why: 'Parking this. I was trying to change three things at once and none of them stuck.',
      status: 'parked',
      target_date: null,
      created: ago(35, 22, 50),
      checkins: [[29, 'hard', 'Managed it twice in a week. The phone was back by Thursday.']],
    },
  ]

  const goalRows = goalSpec.map((g) => ({
    profile_id: ME,
    title: g.title,
    why: g.why,
    status: g.status,
    target_date: g.target_date,
    created_at: g.created,
    updated_at: g.done_at ?? g.created,
    done_at: g.done_at ?? null,
  }))

  const { data: goals, error: goalError } = await db
    .from('individual_goals')
    .insert(goalRows)
    .select('id, title')
  if (goalError) throw new Error(`individual_goals: ${goalError.message}`)
  console.log(`  wrote  ${goals.length}  individual_goals`)

  const checkinRows = goalSpec.flatMap((g) => {
    const id = goals.find((row) => row.title === g.title).id
    return g.checkins.map(([days, how, note]) => ({
      goal_id: id,
      how_it_went: how,
      note,
      created_at: ago(days, 21, 10),
    }))
  })
  const { error: checkinError, count: checkinCount } = await db
    .from('individual_goal_checkins')
    .insert(checkinRows, { count: 'exact' })
  if (checkinError) throw new Error(`individual_goal_checkins: ${checkinError.message}`)
  console.log(`  wrote ${String(checkinCount).padStart(3)}  individual_goal_checkins`)

  // ---------------------------------------------------------------------------
  // WHAT WAS ASKED, AND WHAT CAME BACK
  // ---------------------------------------------------------------------------
  // `asked` is the text AFTER anonymisation, which is what the server stores and
  // what the privacy claim is audited against — so the third request carries a
  // [DATE] where a date was stripped, and says so with `redaction_count: 1`.
  //
  // Outcomes are mixed on purpose. A demo where everything helped is a brochure,
  // and db/108 exists precisely so "I tried this and it did not work" is
  // recorded — the What works for me page is built from both answers.
  // ---------------------------------------------------------------------------
  const MODEL = 'claude-opus-5'
  const PROMPT_VERSION = 'self-v1'

  const requestSpec = [
    {
      days: 40,
      asked:
        'I lose the whole morning before I start anything. I sit down about half eight and then it is eleven and I have read the news, answered two emails and made three coffees. I have tried writing a list the night before and it works for about two days.',
      redaction_count: 0,
      withheld_count: 0,
      withheld_reason: null,
      suggestions: [
        {
          title: 'Put tomorrow’s first task somewhere that is not the list',
          body: 'Leave the actual first step open on the screen or on paper before you finish for the day — the document, the form, the half-written reply. A list has to be read and decided on; an open document only has to be continued.',
          rationale: [
            'The list is doing two jobs: remembering the task and choosing it. Choosing is the part that costs you the morning.',
            'Continuing something already open skips the decision entirely.',
            'It survives a bad night, because it needed no decision from you.',
          ],
          confidence: 0.91,
          outcome: 'helped',
          outcomeDays: 34,
        },
        {
          title: 'Start with the worst two minutes, not the whole task',
          body: 'Agree with yourself to do two minutes of the thing you are avoiding, and to stop if you want to. Most of the resistance is in the opening, and two minutes is short enough that arguing about it takes longer than doing it.',
          rationale: [
            'The avoidance is attached to starting, not to the work itself.',
            'A two-minute commitment is too small to be worth negotiating with.',
            'Stopping after two minutes is allowed, which is what makes it work.',
          ],
          confidence: 0.87,
          outcome: 'helped',
          outcomeDays: 31,
        },
        {
          title: 'Keep the night-before note to one line',
          body: 'A list of eight is a decision waiting for you in the morning. One line — the single thing you will open first — is an instruction. You can write the other seven somewhere else if they will not leave you alone.',
          rationale: [
            'Lists that stopped working after two days usually grew rather than failed.',
            'One line cannot be triaged, so there is nothing to put off.',
          ],
          confidence: 0.85,
          outcome: null,
        },
      ],
    },
    {
      days: 26,
      asked:
        'Meetings leave me wiped out for the rest of the day. I am fine in them, then afterwards I cannot do anything that needs thinking and I end up doing nothing useful until the evening.',
      redaction_count: 0,
      withheld_count: 0,
      withheld_reason: null,
      suggestions: [
        {
          title: 'Put the recovery in the calendar, not after it',
          body: 'Block fifteen minutes immediately after each meeting and put something in it that is not work — a walk, a kettle, standing outside. Unbooked time gets filled by the next thing, and then the tiredness arrives with a task already attached to it.',
          rationale: [
            'Time that is not booked is not protected, and the flat hour afterwards is when you need it most.',
            'A named activity is easier to actually do than "rest".',
            'Fifteen minutes is short enough to defend to somebody else.',
          ],
          confidence: 0.89,
          outcome: 'helped',
          outcomeDays: 19,
        },
        {
          title: 'Move the thinking work to before the meeting',
          body: 'If the day has a meeting in it, treat the hours before it as the only hours that will take concentration. Put the admin, the replies and the tidying-up after, where the tiredness can carry them.',
          rationale: [
            'You describe being fine in the meeting and flat afterwards, which makes the morning the reliable half.',
            'Admin tolerates a tired brain in a way that writing and planning do not.',
            'It changes the order of the day rather than asking for more from it.',
          ],
          confidence: 0.86,
          outcome: 'didnt_help',
          outcomeDays: 14,
        },
        {
          title: 'Write the three things down before you leave the room',
          body: 'Before the call ends, write what you agreed, what you owe somebody and by when. Two minutes while it is still in your head, rather than an hour of reconstruction on Thursday when it is not.',
          rationale: [
            'Reconstructing a meeting later costs far more than recording it at the time.',
            'It also removes the low background worry of having forgotten something.',
          ],
          confidence: 0.88,
          outcome: 'helped',
          outcomeDays: 12,
        },
      ],
    },
    {
      days: 12,
      // A date was in the original and the anonymiser took it out. This is what
      // the stored text looks like when that happens.
      asked:
        'I have a review coming up on [DATE] and I want to ask for some adjustments but I do not know how to put it. I am worried it sounds like I am asking for special treatment or making excuses.',
      redaction_count: 1,
      withheld_count: 1,
      withheld_reason: 'It was too much of a guess to be worth your time.',
      suggestions: [
        {
          title: 'Ask for the change, not for the reason',
          body: 'Say what would help and what it would change about your work: "If I get the agenda the day before, I come with the answers rather than having to find them in the room." A request that names a result is easier to say yes to than one that needs a diagnosis first.',
          rationale: [
            'You are not obliged to explain a condition to ask for a working arrangement.',
            'A stated benefit gives the other person something to agree with.',
            'It keeps the conversation about the work, which is where you want it.',
          ],
          confidence: 0.9,
          outcome: 'helped',
          outcomeDays: 6,
        },
        {
          title: 'Take two written down and leave the rest',
          body: 'Pick the two that would change the most and write them on one piece of paper. A list of six reads as a set of demands and invites a negotiation; two reads as somebody who has thought about it.',
          rationale: [
            'Two is short enough to be answered in the meeting rather than taken away.',
            'Having it on paper means you do not have to find the words under pressure.',
          ],
          confidence: 0.85,
          outcome: null,
        },
      ],
    },
    {
      days: 4,
      asked:
        'I keep putting off the same task every week. It is not even a big one, it is sending an invoice, and it moves to the next week every single time.',
      redaction_count: 0,
      withheld_count: 0,
      withheld_reason: null,
      suggestions: [
        {
          title: 'Find the bit you are actually avoiding',
          body: 'A small task that survives eight weeks is usually two tasks, one of which you do not want to do. Write out what sending it actually involves — checking the hours, wording the email, the chance they query it — and see which line you flinch at.',
          rationale: [
            'A task avoided for weeks is rarely avoided for its stated size.',
            'Naming the specific step turns an undefined dread into one solvable thing.',
            'The rest of the steps usually take minutes once the sticking point is out.',
          ],
          confidence: 0.92,
          outcome: null,
        },
        {
          title: 'Attach it to something that already happens',
          body: 'Pick a fixed point in your week that happens whether you decide anything or not — the Friday coffee, the end of a standing meeting — and do it there. Recurring tasks need a trigger rather than an intention.',
          rationale: [
            'Intentions compete with everything else in the day; triggers do not.',
            'Something already reliable in your week carries the new thing with it.',
          ],
          confidence: 0.87,
          outcome: null,
        },
        {
          title: 'Write it badly and send it anyway',
          body: 'Give yourself permission for the invoice email to be three lines with no pleasantries. The version you have been putting off is the polished one, and the plain one is worth the same amount of money.',
          rationale: [
            'The delay is often attached to the standard rather than the task.',
            'A sent plain version beats a perfect unsent one by the whole amount.',
          ],
          confidence: 0.86,
          outcome: null,
        },
      ],
    },
  ]

  let suggestionTotal = 0
  for (const r of requestSpec) {
    const { data: request, error } = await db
      .from('individual_ai_requests')
      .insert({
        profile_id: ME,
        asked: r.asked,
        redaction_count: r.redaction_count,
        risk_flagged: false,
        withheld_count: r.withheld_count,
        withheld_reason: r.withheld_reason,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        created_at: ago(r.days, 20, 30),
      })
      .select('id')
      .single()
    if (error) throw new Error(`individual_ai_requests: ${error.message}`)

    const { error: suggestionError } = await db
      .from('individual_ai_suggestions')
      .insert(
        r.suggestions.map((s) => ({
          request_id: request.id,
          title: s.title,
          body: s.body,
          rationale: s.rationale,
          confidence: s.confidence,
          outcome: s.outcome ?? null,
          outcome_at: s.outcome ? ago(s.outcomeDays, 19, 0) : null,
          created_at: ago(r.days, 20, 30),
        })),
      )
    if (suggestionError)
      throw new Error(`individual_ai_suggestions: ${suggestionError.message}`)
    suggestionTotal += r.suggestions.length
  }
  console.log(`  wrote   ${requestSpec.length}  individual_ai_requests`)
  console.log(`  wrote  ${suggestionTotal}  individual_ai_suggestions`)

  // ---------------------------------------------------------------------------
  // TWO COURSES, NEITHER OF THEM FINISHED
  // ---------------------------------------------------------------------------
  // Part-done is the honest state and the more useful one to look at: it puts a
  // real number on Home's "parts finished" figure and gives the Academy a course
  // to continue rather than only courses to start. Nothing is marked complete,
  // so `completed_at` stays null and the "finished" badge is not being faked.
  // ---------------------------------------------------------------------------
  const { data: courses, error: courseError } = await db
    .from('courses')
    .select('id, title, audiences, is_published, course_modules(id, sort_order)')
    .eq('is_published', true)
  if (courseError) throw new Error(`courses: ${courseError.message}`)

  const forMe = courses.filter((c) => c.audiences.includes('individual'))
  if (forMe.length === 0) {
    console.log('  no published course has individuals in its audience — skipped')
  }

  // How many modules of each to mark done, in the order the courses come back.
  const doneCounts = [2, 1]

  let completionTotal = 0
  for (const [i, course] of forMe.entries()) {
    const { data: enrolment, error } = await db
      .from('course_enrolments')
      .insert({
        course_id: course.id,
        profile_id: ME,
        enrolled_at: ago(i === 0 ? 31 : 8, 21, 0),
      })
      .select('id')
      .single()
    if (error) throw new Error(`course_enrolments: ${error.message}`)

    const modules = [...course.course_modules].sort(
      (a, b) => a.sort_order - b.sort_order,
    )
    const take = Math.min(doneCounts[i] ?? 1, modules.length)
    if (take === 0) continue

    const { error: completionError } = await db.from('module_completions').insert(
      modules.slice(0, take).map((m, n) => ({
        enrolment_id: enrolment.id,
        module_id: m.id,
        completed_at: ago((i === 0 ? 29 : 6) - n * 3, 21, 20),
      })),
    )
    if (completionError)
      throw new Error(`module_completions: ${completionError.message}`)
    completionTotal += take
  }
  console.log(`  wrote   ${forMe.length}  course_enrolments`)
  console.log(`  wrote   ${completionTotal}  module_completions`)

  // ---------------------------------------------------------------------------
  // A SESSION THAT WAS ASKED FOR AND ACCEPTED
  // ---------------------------------------------------------------------------
  // One in the past and one coming up, so "Coming up" on the Sessions screen has
  // something in it and the history underneath is not empty either. Booked with
  // whichever specialist has actually published hours — inventing a booking
  // against somebody with no availability would show a state the product cannot
  // reach.
  // ---------------------------------------------------------------------------
  const { data: bookable } = await db
    .from('bookable_specialists')
    .select('id, full_name')
    .limit(1)

  const specialistId = bookable?.[0]?.id ?? null

  if (!specialistId) {
    console.log('  no specialist has published hours — no booking written')
  } else {
    const slot = (days, h) => {
      const starts = new Date(ahead(days, h, 0))
      const ends = new Date(starts.getTime() + 45 * 60 * 1000)
      return { starts_at: starts.toISOString(), ends_at: ends.toISOString() }
    }
    const rows = [
      {
        profile_id: ME,
        specialist_id: specialistId,
        ...slot(-17, 14),
        duration_minutes: 45,
        status: 'accepted',
        purpose:
          'Wanted to talk through the mornings, and whether the things I have been trying are the right ones to keep going with.',
        created_at: ago(24, 22, 10),
        updated_at: ago(23, 9, 30),
      },
      {
        profile_id: ME,
        specialist_id: specialistId,
        ...slot(6, 11),
        duration_minutes: 45,
        status: 'accepted',
        purpose:
          'Adjustments at work — I have a review coming up and I would like to practise saying it out loud first.',
        created_at: ago(3, 21, 45),
        updated_at: ago(2, 10, 15),
      },
    ]
    const { error: bookingError } = await db
      .from('individual_bookings')
      .insert(rows)
    if (bookingError) {
      // A clash with somebody else's real booking is the likely cause, and it is
      // not worth failing the whole seed over — everything above is already in.
      console.log(`  bookings skipped: ${bookingError.message}`)
    } else {
      console.log(`  wrote   ${rows.length}  individual_bookings`)
    }
  }

  console.log(
    '\nDone. Sign in as this account and the individual screens have six weeks behind them.' +
      '\nTo undo: rerun with --remove.',
  )

  return 0
}

try {
  process.exitCode = (await main()) ?? 0
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
