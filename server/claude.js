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
            description: 'What the teacher should actually do, in two or three sentences.',
          },
          rationale: {
            type: 'array',
            items: { type: 'string' },
            description: 'Two to four short reasons this works, for the "Why this works" list.',
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

WHAT YOU PRODUCE
Exactly three practical classroom strategies a teacher could try tomorrow, each with a short "why this works" rationale grounded in established classroom practice.

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

export class AiDisabledError extends Error {}
export class AnonymisationError extends Error {}
export class RefusalError extends Error {}

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
- Teacher's notes: ${payload.notes || '(none recorded)'}

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
