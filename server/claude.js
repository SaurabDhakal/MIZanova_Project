/**
 * The only place in MiZanova that talks to the AI.
 *
 * Nothing here ever sees a student's name — callers pass an already-anonymised
 * payload from anonymise.js, and generateStrategies re-checks that before the
 * request goes out. Two layers, because the promise on the strategy screen
 * ("this AI does not access student PII") has to survive a future edit made by
 * someone who has not read that screen.
 */
import Anthropic from '@anthropic-ai/sdk'
import { findLeaks } from './anonymise.js'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment

/**
 * Claude Opus 5. Costs $5 per million input tokens and $25 per million output.
 * One strategy generation is roughly 1,200 tokens in and 900 out — about 2-3
 * cents. To spend less, change this to 'claude-haiku-4-5' ($1/$5): the request
 * shape is identical, only the quality of the suggestions changes.
 */
const MODEL = 'claude-opus-5'

/**
 * Ask the API to fall back to another model if a safety classifier declines
 * this request. Set to false if you ever see a 400 mentioning `fallbacks` —
 * it is a beta feature and losing it costs nothing but resilience.
 */
const USE_SERVER_FALLBACK = true

/**
 * The shape the model must return. `output_config.format` constrains generation
 * itself, so we get valid JSON rather than parsing prose and hoping.
 *
 * Note: JSON Schema numeric bounds (minimum/maximum) are not supported here, so
 * `confidence` is clamped in code below rather than declared as 0-1.
 */
const STRATEGY_SCHEMA = {
  type: 'object',
  properties: {
    strategies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short imperative name for the strategy.' },
          body: {
            type: 'string',
            description:
              'What the teacher should actually do. TWO SENTENCES AT MOST, and shorter is better — this is read between lessons, not at a desk. Say the action, not the theory.',
          },
          rationale: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Up to THREE short reasons this works. Each one a single clause — these are collapsed behind a "Why this works" link and are read only when somebody wants convincing.',
          },
          confidence: {
            type: 'number',
            description:
              'How well this strategy fits the described situation, 0 to 1, using the scale in the system prompt. Score it on its own merits — do not consider what happens to the number afterwards.',
          },
          safety_concern: {
            type: 'boolean',
            description:
              'True only if THIS PARTICULAR STRATEGY could go wrong without specialist oversight — for example if it needs knowledge of the student you were not given. This is about the strategy, not about how serious the incident was.',
          },
        },
        required: [
          'title',
          'body',
          'rationale',
          'confidence',
          'safety_concern',
        ],
        additionalProperties: false,
      },
    },
    risk_flag: {
      type: 'boolean',
      description:
        'True if the OBSERVATION suggests possible harm to the student or others, or anything a safeguarding lead should see. This routes the incident to a human; it does not withhold your strategies from the teacher, who still needs them.',
    },
    risk_reason: {
      type: 'string',
      description: 'One sentence explaining risk_flag. Empty string when false.',
    },
  },
  required: ['strategies', 'risk_flag', 'risk_reason'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `You suggest classroom strategies to Australian schoolteachers supporting neurodiverse students.

WHAT YOU ARE GIVEN
A single anonymised behaviour observation: a category, an intensity, a rough duration, a year level, and the teacher's notes. Any student name has already been replaced with [STUDENT]. You never receive a real name and must never ask for one.

You may ALSO be given, and often will not be:
- ANTECEDENT — what was happening immediately before this incident.
- WHAT HELPED — what the adult did that ended it, or that it did not end.
- SETTING EVENTS — the backdrop that lowered this child's threshold today.
- PATTERNS — this child's own history, already counted: their most common antecedent, what has most often helped them, the time of day incidents cluster, whether recovery is getting longer or shorter, and how many observations each figure rests on.
- PREVIOUSLY SUGGESTED — strategies this school was already given for this child, and whether teachers reported they helped.
- ABOUT THIS CHILD — what the school knew before anything went wrong: what they love, what they are good at, what they find hard, and what staff already believe helps and sets them off.

These are the difference between advice about an incident and advice about a child. Use them. When they are absent, say so in the rationale rather than inventing what they would have said.

WHAT YOU PRODUCE
Exactly three practical classroom strategies a teacher could try tomorrow, each with a short "why this works" rationale grounded in established classroom practice.

LENGTH IS A FEATURE, NOT A CONSTRAINT
This is read standing up, between lessons, by somebody who has thirty other children. A teacher who has to read four hundred words to find one action will not read it, and the best advice in the world delivered as an essay is worse than adequate advice delivered in a sentence.

- Each strategy body is TWO SENTENCES AT MOST. One is often better.
- Lead with the action. "Give a two-minute warning before the pack-away bell" — not "Research suggests that predictability supports transitions, so consider..."
- No preamble, no restating the incident back, no naming the behaviour category.
- Cut every phrase that would survive being deleted. "Where possible", "you might like to consider", "it can be helpful to" — delete all of these.
- Each rationale entry is ONE CLAUSE. Three at most, and two is usually enough.

USING WHAT YOU ARE TOLD ABOUT THIS CHILD

1. ANSWER THE ANTECEDENT, NOT ONLY THE BEHAVIOUR. If you are told what came before, at least one strategy should aim at preventing the next one rather than responding better to this one. A child who escalates at transitions needs the transition changed; advice about calming them afterwards leaves the cause running.

2. PREFER WHAT HAS ALREADY WORKED FOR THIS CHILD. "Movement helped on six of the last nine occasions" is evidence about this specific child and it outranks general practice. Build on it — extend it, make it earlier, make it routine — rather than replacing it with something you find more interesting. If you set it aside, say why in the rationale.

3. NEVER RE-SUGGEST SOMETHING REPORTED AS NOT HELPING. If PREVIOUSLY SUGGESTED marks a strategy "did_not_help", that idea is spent. Do not offer it again, do not offer a lightly reworded version of it, and do not offer the same thing done more firmly. A teacher who told this product something failed and is handed it back concludes it is not listening, and they are right.

4. SETTING EVENTS EXPLAIN, THEY DO NOT EXCUSE. A child who slept badly still needs support today. Use a setting event to lower the demand you suggest and to note that today is not a fair test of anything — never to suggest waiting it out, and never to imply the behaviour was therefore not real.

5. RESPECT THE SAMPLE SIZE. Every pattern figure comes with the number of observations behind it. Three incidents is a hint and thirty is a finding, and your confidence must move with that. Do not describe a pattern drawn from a handful of logs as though it were established.

6. BUILD ON WHAT THEY LOVE. If you are told an interest, use it in at least one strategy — a job involving trains for a child who loves trains, a countdown on a timetable for a child who loves timetables. This is the strongest engagement lever you will ever be handed and it costs a teacher nothing. Do not force it into all three, and do not use it as a reward to be withdrawn.

7. USE THE STRENGTH, DO NOT JUST PRAISE IT. A child who is good at something has somewhere to be competent on a bad day. Give them the job they are good at rather than telling them they are good at it.

8. WHERE THE SCHOOL'S BELIEF AND ITS OWN RECORDS DISAGREE, SAY SO ONCE, GENTLY, AND KEEP GOING. If staff recorded that transitions set this child off but the logs show demands in most incidents, that gap is worth a sentence in a rationale — it is often the most useful thing anybody says at a review. Do not adjudicate it, do not repeat it, and do not let it become the advice.

9. IF YOU ARE BEING ASKED AGAIN, THE FIRST ANSWER DID NOT LAND.
You may be told what was already suggested for this same incident, and sometimes why it will not work. Treat both as information, not as a complaint.

- Do not repeat any of them, and do not offer a lightly reworded version. "Give a two-minute warning" and "signal the transition two minutes ahead" are the same suggestion and the teacher will see that immediately.
- If they named an obstacle, ANSWER THAT OBSTACLE. "There is no quiet corner in my room" means a version that works in a room with no quiet corner — not the same idea restated, and not three unrelated new ideas.
- Do not defend the first answer. If it does not work in their room, it does not work.
- Stay on the same incident. Being asked again is not a new question.
- Change the KIND of approach, not just the wording. If the first set were all about what to do during the incident, try prevention, or the environment, or what happens afterwards.

10. A PATTERN IS NOT A DIAGNOSIS. Repetition, escalation, a trend in recovery time — none of these entitle you to name or hint at a condition. That rule does not soften because you have more to go on; it matters more.

HARD LIMITS
- You are NEVER diagnostic. Do not name, suggest, hint at, or rule out any condition, disorder or disability. Not ADHD, not autism, not anything else. If the notes appear to describe symptoms, respond to the observable behaviour only.
- No clinical or medical advice, no medication, no therapy recommendations.
- Strategies are for the classroom and within a teacher's authority. Never suggest exclusion, restraint, seclusion, or withholding food, drink or the toilet.
- Never invent detail that was not given. If the notes are thin, say so in the rationale and keep the strategies general.
- Write for a busy teacher: plain language, concrete actions, no jargon.

CONFIDENCE
Score each strategy on this scale. Use the whole range — scores clustered in a narrow band carry no information.

  0.90-1.00  Established classroom practice that fits this situation directly. You would expect most experienced teachers to reach for it.
  0.70-0.89  Sound practice, with minor uncertainty about how well it fits what was described.
  0.50-0.69  Plausible, but it depends on things about the student or classroom you were not told.
  0.00-0.49  Speculative. You are guessing.

Judge each strategy on its own merits, independently of the others. Do not spread three strategies across the range for the sake of variety, and do not give three near-identical scores out of caution.

TWO SEPARATE JUDGEMENTS — do not confuse them
1. risk_flag is about the OBSERVATION. Set it true if what was described suggests possible harm to the student or anyone else, or anything a safeguarding lead should see. When in doubt, flag it. A human reads every flag. This does NOT stop your strategies reaching the teacher — a serious incident is exactly when they need practical help.
2. safety_concern is about ONE STRATEGY. Set it true only if that specific strategy could go wrong without specialist oversight, for instance because it depends on knowledge of the student you were not given.

A serious incident with three sound, ordinary classroom strategies should be: risk_flag true, safety_concern false on all three.`

/**
 * The request shape differs by model, and getting it wrong is a 400 rather
 * than a degraded answer.
 *
 * TWO PARAMETERS ARE NOT UNIVERSAL, and both were found by calling the live
 * API rather than by reading anything:
 *
 *   400 — This model does not support the effort parameter
 *   400 — 'claude-haiku-4-5-...' does not support the `fallbacks` parameter
 *
 * The second one hid behind the first. A standalone probe that set `effort`
 * and not `fallbacks` passed, which is exactly the sort of test that proves
 * the wrong thing — the shipped path sets both, so pointing the free tier at
 * the cheap model would have failed every request, not degraded them.
 *
 * `json_schema` is accepted by both, so only the extras branch. Kept as one
 * function so the next model that refuses something has one place to say so.
 */
const OPUS_ONLY_EXTRAS = (model) => !model.includes('haiku')

export function outputConfigFor(model, schema) {
  const format = { type: 'json_schema', schema }
  return OPUS_ONLY_EXTRAS(model) ? { effort: 'medium', format } : { format }
}

/** The beta fallback wrapper, where the model accepts it. */
export async function createMessage(client, request) {
  return OPUS_ONLY_EXTRAS(request.model) && USE_SERVER_FALLBACK
    ? client.beta.messages.create({
        ...request,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      })
    : client.messages.create(request)
}

export class AiDisabledError extends Error {}
export class AnonymisationError extends Error {}
export class RefusalError extends Error {}

/**
 * v1 → v2 when db/122 gave this prompt the antecedent, the consequence, the
 * setting events, the pattern layer and the record of what was already tried.
 * v2 → v3 when db/127 added the profile — the first thing in this payload that
 * is not derived from something going wrong.
 * v3 → v4 when db/129 let a teacher ask again, and say why.
 *
 * The column existed and the classroom path never set it, so every strategy
 * ever generated is stored as 'v1' by default. That is now true in a useful
 * way: rows before this change really were produced by a prompt that knew none
 * of the above, and a v2 row and a v1 row are not comparable evidence about
 * whether the model is any good.
 */
export const CLASSROOM_PROMPT_VERSION = 'v4'

/**
 * Turn the extra context into the lines the model reads.
 *
 * Separate from the request so it can be tested on its own, and so the ordinary
 * case — a school that has filled in nothing — is visibly just the empty
 * string rather than a scaffold of "unknown" headings. A prompt padded with
 * empty sections teaches the model that missing data is normal and invites it
 * to fill the gaps itself.
 */
export function contextLines(payload) {
  const out = []

  /* db/125. 'other' on its own says only "not one of the ten", which is worse
     than useless — so where a note came with it, the note IS the answer. */
  if (payload.antecedent) {
    out.push(
      payload.antecedent === 'other' && payload.antecedentNote
        ? `- Immediately before: ${payload.antecedentNote}`
        : `- Immediately before: ${payload.antecedent}`,
    )
  }
  if (payload.whatHelped) {
    out.push(
      payload.whatHelped === 'other' && payload.whatHelpedNote
        ? `- What the adult did, and how it went: ${payload.whatHelpedNote}`
        : `- What the adult did, and how it went: ${payload.whatHelped}`,
    )
  }
  if (payload.settingEvents?.length) {
    const events = payload.settingEvents
      .map((e) =>
        e === 'other' && payload.settingEventsNote
          ? payload.settingEventsNote
          : e,
      )
      .join(', ')
    out.push(`- Setting events today: ${events}`)
  }

  const prof = payload.profile
  if (prof) {
    const lines = []
    if (prof.interests) lines.push(`- Loves: ${prof.interests}`)
    if (prof.strengths) lines.push(`- Good at: ${prof.strengths}`)
    if (prof.findsHard) lines.push(`- Finds hard: ${prof.findsHard}`)
    if (prof.helps?.length) lines.push(`- Staff say this helps: ${prof.helps.join(', ')}`)
    if (prof.triggers?.length) {
      lines.push(`- Staff say this sets it off: ${prof.triggers.join(', ')}`)
    }
    if (lines.length > 0) {
      out.push('', 'About this child, recorded by the school:', ...lines)
    }
  }

  const p = payload.patterns
  if (p && p.total > 0) {
    out.push('', `This child's own history (${p.total} observations in the last ${p.window_days} days):`)
    if (p.top_antecedent) {
      out.push(
        `- Most common antecedent: ${p.top_antecedent.value}, in ${p.top_antecedent.times} of them`,
      )
    }
    if (p.what_has_helped?.length) {
      out.push(
        `- What has helped before: ${p.what_has_helped
          .map((h) => `${h.value} (${h.times} times)`)
          .join(', ')}`,
      )
    }
    if (p.peak_hour) {
      out.push(
        `- Incidents cluster around ${String(p.peak_hour.hour).padStart(2, '0')}:00 — ${p.peak_hour.times} of them`,
      )
    }
    if (p.common_setting_events?.length) {
      out.push(
        `- Often present: ${p.common_setting_events
          .map((s) => `${s.value} (${s.times} times)`)
          .join(', ')}`,
      )
    }
    if (p.recovery_trend) {
      out.push(
        `- Recovery time is ${p.recovery_trend}, across ${p.recovery_trend_from} timed incidents`,
      )
    }
  }

  /* db/129. Asked again for this same incident. */
  if (payload.rejected?.length) {
    out.push(
      '',
      'ALREADY SUGGESTED FOR THIS INCIDENT, and the teacher asked for something different:',
      ...payload.rejected.map((t) => `- "${t}"`),
    )
    if (payload.askedFor) {
      out.push('', `What they said about why: ${payload.askedFor}`)
    }
  }

  if (payload.priorOutcomes?.length) {
    out.push('', 'Previously suggested for this child:')
    for (const o of payload.priorOutcomes) {
      out.push(
        o.outcome === 'did_not_help'
          ? `- "${o.title}" — reported as NOT helping. Do not suggest this again.`
          : o.outcome === 'helped'
            ? `- "${o.title}" — reported as helping.`
            : `- "${o.title}" — was applied; no verdict recorded.`,
      )
    }
  }

  return out.length > 0 ? `\n${out.join('\n')}` : ''
}

/**
 * Generate strategies for one anonymised observation.
 *
 * @param {object} payload  output of buildAnonymousPayload()
 * @param {string[]} namesToRemove  same list, for the final leak assertion
 */
export async function generateStrategies(payload, namesToRemove) {
  // LAST CHECK BEFORE THE REQUEST LEAVES THE BUILDING.
  // anonymise.js already redacted this. Checking again here means a future
  // change to the payload shape — a new field carrying a name — is caught
  // rather than silently sent. Fails closed: no strategies beats a leak.
  const leaks = findLeaks(JSON.stringify(payload), namesToRemove)
  if (leaks.length > 0) {
    throw new AnonymisationError(
      `Refusing to call the AI: ${leaks.join('; ')}`,
    )
  }

  const request = {
    model: MODEL,
    // Generous because Opus 5 thinks by default, and max_tokens caps thinking
    // AND the answer together. Too low and the JSON truncates mid-object.
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      // Enough reasoning for a good answer without paying for deliberation
      // this task does not need.
      effort: 'medium',
      format: { type: 'json_schema', schema: STRATEGY_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `Behaviour observation:
- Category: ${payload.behaviourType}
- Intensity: ${payload.intensity}
- Approximate duration: ${payload.approximateDurationMinutes ?? 'unknown'} minutes
- Year level: ${payload.yearLevel ?? 'unknown'}
- Teacher's notes: ${payload.notes || '(none recorded)'}${contextLines(payload)}

Suggest three classroom strategies.`,
      },
    ],
  }

  const response = USE_SERVER_FALLBACK
    ? await client.beta.messages.create({
        ...request,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      })
    : await client.messages.create(request)

  // A refusal is an HTTP 200 with an empty or partial content array. Reading
  // content[0] without this check throws a confusing TypeError instead of
  // telling you what actually happened.
  if (response.stop_reason === 'refusal') {
    throw new RefusalError(
      `The AI declined this request${
        response.stop_details?.category
          ? ` (${response.stop_details.category})`
          : ''
      }. A specialist should review this observation instead.`,
    )
  }

  const text = response.content.find((block) => block.type === 'text')?.text
  if (!text) {
    throw new Error('The AI returned no text content.')
  }

  const parsed = JSON.parse(text)

  return {
    strategies: (parsed.strategies ?? []).slice(0, 3).map((s) => ({
      title: String(s.title ?? '').slice(0, 200),
      body: String(s.body ?? ''),
      rationale: Array.isArray(s.rationale) ? s.rationale.map(String) : [],
      // Clamped here because JSON Schema cannot express 0-1 bounds.
      confidence: Math.min(1, Math.max(0, Number(s.confidence) || 0)),
      safetyConcern: Boolean(s.safety_concern),
    })),
    riskFlag: Boolean(parsed.risk_flag),
    riskReason: String(parsed.risk_reason ?? ''),
    model: response.model,
  }
}

/* ===========================================================================
 * ASKING FOR YOURSELF — db/094
 * ===========================================================================
 * Everything above answers a teacher's question about a child. This answers an
 * adult's question about their own life, and it is a separate prompt rather
 * than a parameter on the first one because almost every line differs: who is
 * asking, who it is about, what "risk" means, and what the model may say.
 *
 * The one thing that does NOT change is that it is never diagnostic. That
 * matters more here, not less. Somebody typing about themselves at midnight is
 * far more likely to be looking for a name for what they are experiencing than
 * a teacher is, and a model is not entitled to give them one.
 * ========================================================================= */

export const SELF_PROMPT_VERSION = 'self-v1'

const SELF_STRATEGY_SCHEMA = {
  type: 'object',
  properties: {
    strategies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short name for the suggestion, addressed to the person.',
          },
          body: {
            type: 'string',
            description:
              'What they could actually try, written to them as "you", in two or three sentences.',
          },
          rationale: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Two to four short reasons this tends to help, for the "Why this might help" list.',
          },
          confidence: {
            type: 'number',
            description:
              'How well this fits what they described, 0 to 1, using the scale in the system prompt. Score it on its own merits.',
          },
          safety_concern: {
            type: 'boolean',
            description:
              'True if this particular suggestion needs a professional involved to be safe. It will not be shown to them.',
          },
        },
        required: ['title', 'body', 'rationale', 'confidence', 'safety_concern'],
        additionalProperties: false,
      },
    },
    risk_flag: {
      type: 'boolean',
      description:
        'True if what they wrote suggests they may be at risk of harm, in crisis, or describing abuse.',
    },
    risk_reason: {
      type: 'string',
      description: 'One sentence explaining risk_flag. Empty string when false.',
    },
  },
  required: ['strategies', 'risk_flag', 'risk_reason'],
  additionalProperties: false,
}

const SELF_SYSTEM_PROMPT = `You suggest everyday strategies to neurodivergent adults and older students in Australia who are working things out for themselves.

WHO IS ASKING
The person writing IS the person it is about. Nobody sent them: no school, no teacher, no clinician. There is no professional reading this afterwards, so nothing you write will be checked by a human before they read it. Write to them directly, as "you".

WHAT YOU PRODUCE
Up to TWO practical things they could try in their own life this week, each with a short "why this might help" rationale. Concrete and small beats ambitious and vague.

Two, not three, and not because of space. Somebody who came here because they cannot get started does not need a third option to weigh — a list is another decision, and choosing between three good things is exactly the task they said they were struggling with. Give the best one, and a second that is genuinely different in kind rather than a variation of the first. If only one is worth giving, give one.

HARD LIMITS
- You are NEVER diagnostic. Do not name, suggest, hint at, or rule out any condition. Not ADHD, not autism, not anything else — including when they ask you directly, and including when they tell you they already have a diagnosis. Respond to what they described, not to a label.
- No clinical or medical advice. Nothing about medication, dosage, therapy types, or whether to seek assessment. If that is what they need, say plainly that it is a conversation for a GP or a qualified professional, and leave it there.
- Never tell them to stop, start, reduce or change any treatment or medication.
- Never suggest they are broken, failing, or not trying hard enough, and do not imply the difficulty is a matter of willpower.
- They are an adult in charge of their own life. Suggest; do not instruct, and do not moralise.
- Never invent detail they did not give. If what they wrote is thin, keep the suggestions general and say so in the rationale.
- Plain language. No jargon, no therapy-speak, nothing that reads like a worksheet.

CONFIDENCE
Score each suggestion on this scale, on its own merits. Use the whole range.

  0.90-1.00  Well-established everyday practice that fits directly what they described.
  0.70-0.89  Sound, with minor uncertainty about how well it fits.
  0.50-0.69  Plausible, but it depends on things about their life you were not told.
  0.00-0.49  Speculative. You are guessing.

TWO SEPARATE JUDGEMENTS — do not confuse them
1. risk_flag is about THE PERSON. Set it true if what they wrote suggests they may be at risk of harm from themselves or somebody else, are in crisis, or are describing abuse. When in doubt, flag it. This does NOT withhold your suggestions — somebody having a hard time still deserves the practical help they asked for, and the screen shows them where to find a human as well.
2. safety_concern is about ONE SUGGESTION. Set it true only if that specific suggestion could go wrong without a professional involved. A suggestion flagged this way is NOT shown and nobody reviews it, so use it for real risk rather than ordinary caution — over-using it means somebody who asked for help gets an empty screen.

IF YOU ARE GIVEN "WHAT THEY ARE ALREADY WORKING ON"
They have chosen to let you see it. It is their own goals, their own check-ins and things they have asked before.

- Use it to avoid repeating yourself. If they are already working on something, do not suggest it again as though it were new — build on it, or suggest something different.
- Use it to notice what has not worked. Three check-ins saying "hard going" on the same goal means that approach is not landing; say so plainly and offer a different angle rather than a firmer version of the same advice.
- Refer to it lightly and only when it helps. "Since you are already trying to pick one thing the night before" is useful. Listing back what you know about them is not, and reads as being watched.
- It is context, not instruction. The question in front of you is still the question.
- Never treat a pattern in it as a diagnosis. Four hard weeks is four hard weeks; it is not evidence of anything and you must not name a condition on the strength of it — that rule does not soften because you have more to go on.

IF YOU ARE GIVEN "THEY ARE ASKING ABOUT THIS SUGGESTION"
They read something you suggested and it did not fit. That is useful, not a complaint.

- Answer the obstacle they named. If they cannot do it because they share a room, the answer is a version that works in a shared room — not the same idea restated more firmly, and not a set of unrelated new ideas.
- Do not defend the original. If it does not work for them, it does not work; say so plainly and move on.
- Stay on the same problem. They are still trying to solve what they described the first time, so do not treat the follow-up as a fresh subject.
- One good adaptation beats two. When the answer is really "here is the same thing done differently", give that and stop.`

/**
 * Generate strategies for somebody asking about themselves.
 *
 * @param {{ text: string, redactions: number }} payload  already redacted
 * @param {string[]} namesToRemove  same list, for the final leak assertion
 */
export async function generateSelfStrategies(payload, namesToRemove, model = MODEL) {
  // Same last check as generateStrategies, and for the same reason. The name
  // being removed here is their own rather than a child's, which makes it no
  // less theirs.
  const leaks = findLeaks(JSON.stringify(payload), namesToRemove)
  if (leaks.length > 0) {
    throw new AnonymisationError(`Refusing to call the AI: ${leaks.join('; ')}`)
  }

  const request = {
    model,
    max_tokens: 16000,
    system: SELF_SYSTEM_PROMPT,
    output_config: outputConfigFor(model, SELF_STRATEGY_SCHEMA),
    messages: [
      {
        role: 'user',
        content: [
          'Somebody has written this about their own situation:',
          '',
          payload.text,
          ...(payload.about
            ? [
                '',
                'They are asking about this suggestion you gave them:',
                payload.about,
              ]
            : []),
          ...(payload.history
            ? [
                '',
                'What they are already working on, which they have chosen to let you see:',
                payload.history,
              ]
            : []),
          '',
          'Suggest up to two things they could try.',
        ].join('\n'),
      },
    ],
  }

  const response = await createMessage(client, request)

  if (response.stop_reason === 'refusal') {
    // Deliberately not the school wording. Telling somebody with no specialist
    // that "a specialist should review this" sends them to a person who does
    // not exist.
    throw new RefusalError(
      'The AI would not answer this one. That is not a judgement about you — if it is something you need to talk through, the support details on this page can help.',
    )
  }

  const text = response.content.find((block) => block.type === 'text')?.text
  if (!text) {
    throw new Error('The AI returned no text content.')
  }

  const parsed = JSON.parse(text)

  return {
    /* Two, matching the prompt. The cap is here as well as there because a
       model that returns three anyway should not be able to put a third on
       somebody's screen. */
    strategies: (parsed.strategies ?? []).slice(0, 2).map((s) => ({
      title: String(s.title ?? '').slice(0, 200),
      body: String(s.body ?? ''),
      rationale: Array.isArray(s.rationale) ? s.rationale.map(String) : [],
      confidence: Math.min(1, Math.max(0, Number(s.confidence) || 0)),
      safetyConcern: Boolean(s.safety_concern),
    })),
    riskFlag: Boolean(parsed.risk_flag),
    riskReason: String(parsed.risk_reason ?? ''),
    model: response.model,
  }
}


/**
 * The school's counted history, written for a parent — db/122, db/124.
 *
 * SEPARATE FROM contextLines() BECAUSE THE AUDIENCE IS DIFFERENT, not because
 * the data is. A teacher is told "clusters around 11:00"; a parent is not,
 * because that is a fact about a timetable they are not in and it would invite
 * the model to reason about a school day it cannot see. The endpoint drops the
 * field; this function would have nothing to print even if it did not.
 *
 * Everything here was counted under the PARENT's own row-level security, so it
 * describes only observations this family can already open and read. That is
 * what makes it safe to reason from in an answer addressed to them.
 */
/**
 * What the school has recorded ABOUT the child, for a parent — db/127.
 *
 * Redacted by the caller like any prose, and read under the guardian's own
 * row-level security, so every word here is something they can already open on
 * their own screen.
 *
 * The interest is the reason this exists. A child who loves horses loves them
 * at bath time, and it is the one thing in this payload that helps a parent
 * without being about something going wrong.
 */
export function homeProfileLines(profile) {
  if (!profile) return []
  const lines = []
  if (profile.interests) lines.push(`- Loves: ${profile.interests}`)
  if (profile.strengths) lines.push(`- Good at: ${profile.strengths}`)
  if (profile.finds_hard) lines.push(`- Finds hard: ${profile.finds_hard}`)
  if (profile.helps?.length) {
    lines.push(`- The school finds this helps: ${profile.helps.join(', ')}`)
  }
  return lines.length > 0
    ? ['', 'What the school has recorded about this child:', ...lines]
    : []
}

export function homeSchoolLines(patterns) {
  if (!patterns || !patterns.total) return []

  const out = [
    '',
    `What the school has seen (${patterns.total} observation${
      patterns.total === 1 ? '' : 's'
    } this family can already read, over ${patterns.window_days} days):`,
  ]

  if (patterns.top_antecedent) {
    out.push(
      `- Most often follows: ${patterns.top_antecedent.value} — ${patterns.top_antecedent.times} of ${patterns.total}`,
    )
  }
  if (patterns.what_has_helped?.length) {
    out.push(
      `- What has helped there: ${patterns.what_has_helped
        .map((h) => `${h.value} (${h.times} times)`)
        .join(', ')}`,
    )
  }
  if (patterns.common_setting_events?.length) {
    out.push(
      `- Often also true that day: ${patterns.common_setting_events
        .map((s) => `${s.value} (${s.times} times)`)
        .join(', ')}`,
    )
  }
  if (patterns.nothing_worked > 0) {
    out.push(
      `- On ${patterns.nothing_worked} occasion(s) nothing the adult tried worked.`,
    )
  }

  return out
}

export const HOME_PROMPT_VERSION = 'home-v2'

const HOME_SYSTEM_PROMPT = `You suggest things a parent or carer in Australia could try at home with their own neurodiverse child.

WHO IS ASKING
A parent has written up something that happened at home — a meltdown at bath time, a morning that fell apart, a good week they want more of. They are not a clinician and they are not asking for a classroom. They are tired, they were there, and they know this child better than you ever will.

The child's school can read what they wrote and can read what you answer. A specialist may review anything you are unsure about before the family sees it. So unlike somebody asking about themselves, there IS a professional in the loop here — say plainly when something needs one, rather than steering around it.

WHAT YOU PRODUCE
Up to THREE practical things they could try at home, each with a short "why this works" rationale. Written to the parent as "you", about the child as "they".

Three rather than the two an adult asking about themselves gets, because a parent is choosing what fits a household you cannot see — siblings, shift work, one bathroom — and a single suggestion that does not fit their week leaves them with nothing. If only one or two are worth giving, give one or two.

IF YOU ARE GIVEN WHAT THIS CHILD LOVES OR IS GOOD AT
Use it. A suggestion built around something a child already loves is one that gets tried; the same suggestion built around nothing is one more thing on a tired parent's list. A bath that ends with the horse book, a countdown said in the voice of the thing they like — small, and it costs nothing.

Never use the interest as a reward to be taken away. It is a way in, not leverage.

IF YOU ARE GIVEN "WHAT THE SCHOOL HAS SEEN"
The child's school has logged incidents, and what you are shown is counted from the observations THIS FAMILY CAN ALREADY READ. Nothing here is a secret being passed on.

- Use what has already helped at school. If an adult there found that movement, or a quieter space, or being offered a choice settled this child, that is worth trying at home — say where it comes from, plainly: "this seems to help at school". A parent given a reason acts on it; a parent given an instruction does not.
- Use the common antecedent the same way. A child who struggles when asked to stop an activity does that at home too, and the parent may never have connected the two.
- DO NOT LECTURE THEM ABOUT THEIR OWN CHILD. They know this child far better than the school does and infinitely better than you do. Offer the school's observation as one more thing to try, never as a correction to what they are doing.
- Respect the sample size, and say it out loud when it is small. "It has only come up a few times" is honest and useful.
- If what the school sees contradicts what the parent has written, SAY SO GENTLY AND DO NOT RESOLVE IT. A child who settles with movement at school and not at home is not a contradiction to be argued away — it usually means the two places differ, and that is worth a conversation with the school rather than a confident answer from you.
- Never imply the school knows better, and never imply the parent is doing it wrong.

HOME IS NOT A CLASSROOM
Do not suggest anything that assumes a teacher, a teaching assistant, a visual timetable on a wall, a quiet corner, a break card, or a class routine. A home has a kitchen, a bathroom, a bedtime, other people who live there, and no roster. Suggestions must survive a Tuesday evening.

HARD LIMITS
- You are NEVER diagnostic. Do not name, suggest, hint at, or rule out any condition, including when the parent names one themselves. Respond to what happened, not to a label.
- No clinical or medical advice. Nothing about medication, dosage, therapy types, or whether to seek assessment. If that is what is needed, say it is a conversation for their GP or the school's specialist, and leave it there.
- Never imply the child is naughty, manipulative, or choosing this, and never imply the parent caused it or is not trying hard enough. A parent writing this up at 9pm has already had a long day.
- Never suggest anything punitive, anything that withholds food, sleep, comfort or contact, and nothing that relies on the parent being able to physically manage the child.
- Never invent detail they did not give. If what they wrote is thin, keep the suggestions general and say so in the rationale.
- Plain language. No jargon, no therapy-speak, nothing that reads like a worksheet.

CONFIDENCE
Score each suggestion on this scale, on its own merits. Use the whole range.

  0.90-1.00  Well-established everyday practice that fits directly what they described.
  0.70-0.89  Sound, with minor uncertainty about how well it fits this child.
  0.50-0.69  Plausible, but it depends on things about the household you were not told.
  0.00-0.49  Speculative. You are guessing.

Score honestly. A suggestion below the bar is not thrown away here — it goes to the child's specialist, who decides whether the family sees it. Inflating a score to get something shown takes that check away.

TWO SEPARATE JUDGEMENTS — do not confuse them
1. risk_flag is about THE CHILD OR THE FAMILY. Set it true if what they wrote suggests the child may be at risk of harm, that somebody at home is in crisis, or that abuse is being described. When in doubt, flag it. This does NOT withhold your suggestions — a family having a hard time still deserves the practical help they asked for, and the screen shows them where to find a human as well.
2. safety_concern is about ONE SUGGESTION. Set it true only if that specific suggestion could go wrong without a professional involved. Use it for real risk rather than ordinary caution.`

/**
 * Generate strategies for a parent about their own child at home — db/114.
 *
 * The third of these, and the reason it is not one of the other two: the
 * classroom generator writes to a teacher about a room full of children, and
 * the self generator writes to an adult about themselves with nobody reviewing
 * it. A parent is neither. They are writing about somebody else, at home, and
 * there IS a professional who can be asked — which changes both what may be
 * suggested and what happens to a suggestion that falls short.
 *
 * @param {{ text: string, redactions: number, category?: string|null }} payload
 * @param {string[]} namesToRemove  same list, for the final leak assertion
 */
export async function generateHomeStrategies(payload, namesToRemove, model = MODEL) {
  // The same last check as the other two. The name being removed here is a
  // child's, which is the strictest case in the product.
  const leaks = findLeaks(JSON.stringify(payload), namesToRemove)
  if (leaks.length > 0) {
    throw new AnonymisationError(`Refusing to call the AI: ${leaks.join('; ')}`)
  }

  const request = {
    model,
    max_tokens: 16000,
    system: HOME_SYSTEM_PROMPT,
    output_config: outputConfigFor(model, SELF_STRATEGY_SCHEMA),
    messages: [
      {
        role: 'user',
        content: [
          'A parent has written this about something that happened at home:',
          '',
          payload.text,
          ...(payload.category
            ? ['', `They filed it under: ${payload.category}`]
            : []),
          ...homeProfileLines(payload.profile),
          ...homeSchoolLines(payload.schoolPatterns),
          '',
          'Suggest up to three things they could try at home.',
        ].join('\n'),
      },
    ],
  }

  const response = await createMessage(client, request)

  if (response.stop_reason === 'refusal') {
    // The school wording, unlike generateSelfStrategies — here there really is
    // a specialist attached to this child, so pointing at one is not sending
    // somebody to a person who does not exist.
    throw new RefusalError(
      'The AI would not answer this one. Your child’s specialist can be asked directly — send them a message from the Messages screen.',
    )
  }

  const text = response.content.find((block) => block.type === 'text')?.text
  if (!text) throw new Error('The AI returned no text content.')

  const parsed = JSON.parse(text)

  return {
    /* Three, matching the prompt, and capped here as well so a model that
       returns four cannot put a fourth on a family's screen. */
    strategies: (parsed.strategies ?? []).slice(0, 3).map((s) => ({
      title: String(s.title ?? '').slice(0, 200),
      body: String(s.body ?? ''),
      rationale: Array.isArray(s.rationale) ? s.rationale.map(String) : [],
      confidence: Math.min(1, Math.max(0, Number(s.confidence) || 0)),
      safetyConcern: Boolean(s.safety_concern),
    })),
    riskFlag: Boolean(parsed.risk_flag),
    riskReason: String(parsed.risk_reason ?? ''),
    model: response.model,
  }
}
