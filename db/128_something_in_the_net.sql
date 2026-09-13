-- ---------------------------------------------------------------------------
-- 128 — Something in the net
-- ---------------------------------------------------------------------------
-- db/118 built the safety net, db/124 taught it to aim, and the library has had
-- zero rows in it the entire time. So the crisis path — the kill switch, an
-- outage, a classroom with no signal — has always ended in:
--
--     503 "AI suggestions are switched off at the moment, and the evidence
--          library has nothing recorded for this behaviour yet."
--
-- A safety net with nothing in it is a hole with a label on it.
--
-- ---------------------------------------------------------------------------
-- WHAT "OFFLINE AI" ACTUALLY IS IN THIS PRODUCT
-- ---------------------------------------------------------------------------
-- Not a model on the device. A small local model would need a several-hundred-
-- megabyte download onto shared ECEC tablets — the market the research calls
-- "device scarce" — and it would give worse advice than the rows below while
-- destroying every safety property this product has: no anonymisation audit,
-- no confidence routing, no specialist review, and nothing to check when it
-- says something wrong about a child.
--
-- The answer is the opposite shape: EXPERT ANSWERS WRITTEN IN ADVANCE by
-- people who are accountable for them, cached on the device, and selected
-- locally by the thing the teacher already tapped. It is better than a local
-- model precisely because a person wrote it and can be asked why.
--
-- ---------------------------------------------------------------------------
-- THE PROVENANCE ON THESE ROWS IS HONEST, AND IT IS NOT A CITATION
-- ---------------------------------------------------------------------------
-- db/118 made `provenance` not-null because "a strategy in an evidence database
-- with no evidence is just an opinion with better placement". The right way to
-- honour that is NOT to attach a plausible-looking reference to a guideline
-- nobody has checked — a fabricated citation on a screen a parent reads is
-- worse than an uncited strategy.
--
-- So every row below says what it actually is: ordinary classroom practice,
-- uncontroversial enough to be safe during an outage, and NOT yet reviewed by a
-- Special Miles specialist. `created_by` is null, which is the same statement
-- in a second place — no named professional stands behind these yet.
--
-- A specialist replacing one of these with a properly sourced version is an
-- INSERT in the same lineage (db/118), and their version becomes current. That
-- is the intended path, and these exist so the net is not empty while they do
-- it.
--
-- Nothing here is diagnostic, none of it needs specialist oversight to be safe,
-- and none of it involves exclusion, restraint, seclusion, or withholding food,
-- drink or the toilet — the same limits the model prompt carries.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. The link db/118 promised and never added
-- ---------------------------------------------------------------------------
-- From db/118's own header: "`ai_strategies.evidence_id` can then point at the
-- exact version a classroom was handed, permanently." It was never created, so
-- a strategy served from the library could not say which row it came from and
-- a revised lineage lost the words somebody was actually given.
alter table public.ai_strategies
  add column if not exists evidence_id uuid
    references public.evidence_strategies(id) on delete set null;

comment on column public.ai_strategies.evidence_id is
  'db/118 and db/128. The exact evidence version a classroom was handed. Null '
  'when the model answered. `on delete set null` rather than cascade: losing '
  'the source must never delete the record of what somebody was told.';

create index if not exists ai_strategies_evidence_idx
  on public.ai_strategies (evidence_id)
  where evidence_id is not null;


-- ---------------------------------------------------------------------------
-- 2. Starter content, so the net catches something
-- ---------------------------------------------------------------------------
-- Idempotent by title: running this twice does not duplicate the library, and
-- it will not overwrite a specialist's revision of the same lineage because it
-- only inserts where no row with that title exists at all.
insert into public.evidence_strategies
  (lineage_id, behaviour_type, title, body, rationale, provenance, applies_to)
select
  gen_random_uuid(), v.behaviour_type::public.behaviour_type, v.title, v.body,
  v.rationale, v.provenance, v.applies_to
from (values
  -- --- disruptive ---------------------------------------------------------
  ('disruptive',
   'Give the ending before it arrives',
   'Say what is coming twice: once a few minutes out and once right before. Tie it to something the child can see or hear rather than to minutes — two more turns, the end of the song, when the sand runs out. Use the same words every time so it becomes a signal rather than a negotiation.',
   array['A transition is easier to accept when it stops being a surprise.',
         'A concrete marker is usable by a child who cannot yet judge how long five minutes is.',
         'Identical wording each time means the warning itself does the work, without a discussion.'],
   'Ordinary classroom practice for transitions. Starter entry — not yet reviewed by a Special Miles specialist.',
   array['transition','change']),

  ('disruptive',
   'Make the ask smaller than the refusal',
   'When a request is refused, offer a visibly smaller version of the same thing rather than repeating it — one line instead of the paragraph, the first step rather than the task, or doing it together. Accept the smaller version as a success and move on.',
   array['A demand that has already been refused rarely succeeds on repetition, and repeating it raises the stakes for both people.',
         'A smaller ask keeps the expectation intact while giving the child a way back that is not a climbdown.',
         'Accepting it as a success is what makes the next ask possible.'],
   'Ordinary classroom practice for demand refusal. Starter entry — not yet reviewed by a Special Miles specialist.',
   array['demand','correction']),

  ('disruptive',
   'Build the movement in before you need it',
   'Put a short, purposeful job into the timetable just before the part of the day that usually goes wrong — delivering something, handing out materials, a lap of the corridor. Keep it fixed, so it happens on good days too and is never something that has to be earned or lost.',
   array['Support that arrives before the difficulty prevents it; support that arrives after it only ends it.',
         'A scheduled job avoids teaching that upset is what produces a break.',
         'A purposeful errand is easier to accept than being told to calm down.'],
   'Ordinary classroom practice. Starter entry — not yet reviewed by a Special Miles specialist.',
   array['waiting','discomfort']),

  -- --- withdrawn ----------------------------------------------------------
  ('withdrawn',
   'Offer a way to answer without speaking',
   'Put a simple non-verbal option within reach — a card on the desk, a thumbs up or down, a tray to drop a note into, or drawing instead of telling. Introduce it to the whole class so nobody is singled out, and check it at fixed points rather than waiting to be approached.',
   array['A child who has gone quiet may still want to signal something and have no words available.',
         'Introducing it class-wide removes the spotlight that would stop it being used.',
         'A fixed check means the child does not have to start the conversation.'],
   'Ordinary classroom practice. Starter entry — not yet reviewed by a Special Miles specialist.',
   array['peer','sensory','correction']),

  ('withdrawn',
   'Lower the cost of joining in',
   'For a few days, take away the part that requires going first: partner talk before whole-class talk, a written or drawn answer instead of a spoken one, and a rehearsed line they already know will be asked for. Do not cold-call.',
   array['Withdrawal often follows the risk of being wrong in public rather than the work itself.',
         'A rehearsed contribution lets a child participate without gambling.',
         'Removing cold-calling removes the reason to stay invisible.'],
   'Ordinary classroom practice. Starter entry — not yet reviewed by a Special Miles specialist.',
   array['demand','peer']),

  ('withdrawn',
   'Check in briefly, and do not require an answer',
   'Find a quiet moment, get to their level, and say what you noticed without asking them to explain it: "You have been quiet today. I am here if you want to tell me, and that is fine if you do not." Say when you will be free again, and leave it.',
   array['Naming what you noticed makes it easier to speak later without forcing it now.',
         'A private moment avoids adding an audience to something already difficult.',
         'Saying when you are next available leaves the door open on their terms.'],
   'Ordinary classroom practice. Starter entry — not yet reviewed by a Special Miles specialist.',
   -- GENERAL, not tagged. This is the strategy for when nobody knows why, and
   -- db/124 refuses 'unknown' in applies_to for exactly that reason: a strategy
   -- cannot be written FOR the absence of information. An empty array is the
   -- honest answer and still ranks above a mismatched tag.
   array[]::text[]),

  -- --- emotional ----------------------------------------------------------
  ('emotional',
   'Reduce the input before adding words',
   'Move to somewhere with less going on — fewer people, less noise, lower light — before trying to talk about it. Stay nearby, say little, and wait. Conversation comes after the settling, not as the means of it.',
   array['Talking is hard work, and a child who is overwhelmed has little capacity for it.',
         'Presence without demand is calming where questions are another thing to answer.',
         'A quieter space removes the cause rather than managing the effect.'],
   'Ordinary classroom practice. Starter entry — not yet reviewed by a Special Miles specialist.',
   array['sensory','peer','correction']),

  ('emotional',
   'Offer two options you are happy with',
   'Instead of one instruction, give a real choice between two acceptable things — this table or that one, now or after the next question, with me or on your own. Accept either answer without comment.',
   array['A choice restores some control at the moment it feels lost, which is often what the distress is about.',
         'Two options is a decision a distressed child can still make; an open question is not.',
         'Accepting either answer is what makes it a genuine choice rather than a longer instruction.'],
   'Ordinary classroom practice. Starter entry — not yet reviewed by a Special Miles specialist.',
   array['demand','denied']),

  ('emotional',
   'Make the recovery predictable',
   'Agree, on a calm day, what happens after an upset: where they go, who is there, and how they come back. Keep it the same every time and let them rejoin without discussing what happened until much later, if at all.',
   array['Knowing what happens next shortens the upset, because the aftermath stops being another unknown.',
         'Agreeing it calmly means it is a plan rather than a consequence.',
         'Returning without a post-mortem makes coming back easy rather than something to avoid.'],
   'Ordinary classroom practice. Starter entry — not yet reviewed by a Special Miles specialist.',
   array['change','transition']),

  -- --- physical -----------------------------------------------------------
  ('physical',
   'Move the room, not the child',
   'Give space by quietly moving other children and furniture back, rather than moving or holding the child. One adult stays at a calm distance and says very little; anyone not needed leaves. Practise it once as a neutral drill so it is automatic.',
   array['Space reduces the chance of anyone being hurt without anyone being handled.',
         'One calm adult is less escalating than several.',
         'Rehearsing it means it happens smoothly rather than being improvised under pressure.'],
   'Ordinary classroom practice for keeping people safe. Starter entry — not yet reviewed by a Special Miles specialist. Does not involve restraint, seclusion or removal.',
   array['peer','sensory','denied']),

  ('physical',
   'Find the point before the throw',
   'For a fortnight, note the minute or two before each incident — what was asked, who was near, what had just ended. Look for the earliest visible sign and respond to that instead: a quiet job, a change of seat, a smaller ask. Review it with a colleague.',
   array['Almost every incident has a run-up, and the run-up is the part that can still be changed.',
         'Responding to the earliest sign is prevention; responding to the behaviour is management.',
         'Two weeks is usually enough to see a repeat, and a second pair of eyes catches what habit hides.'],
   'Ordinary classroom practice; the observe-then-respond approach behind functional behaviour assessment. Starter entry — not yet reviewed by a Special Miles specialist.',
   -- Also general: this is what you reach for precisely when the antecedent is
   -- not known yet, which is the state it exists to end.
   array[]::text[]),

  ('physical',
   'Give the strength somewhere to go',
   'Offer heavy, purposeful work as a routine part of the day — carrying, pushing, stacking, tidying chairs. Schedule it rather than offering it as a response, and let them choose which job.',
   array['Purposeful physical work is often settling, and is available in any classroom without equipment.',
         'Scheduling it avoids teaching that force is how a break is obtained.',
         'A choice of job gives some control alongside the activity.'],
   'Ordinary classroom practice. Starter entry — not yet reviewed by a Special Miles specialist.',
   array['waiting','discomfort','transition'])
) as v(behaviour_type, title, body, rationale, provenance, applies_to)
where not exists (
  select 1 from public.evidence_strategies e where e.title = v.title
);

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   select count(*) from public.evidence_strategies;          -- 12
--   select title, targeted from public.evidence_for('disruptive', 'transition');
--   -- "Give the ending before it arrives" leads, targeted = true
--
--   select title, targeted from public.evidence_for('physical', null);
--   -- three rows, targeted = false throughout
--
-- Running this file twice inserts nothing the second time, and never replaces a
-- specialist's revision — it inserts only where no row with that title exists.
--
-- db/verify.sql: no new tables and no new policies; `ai_strategies` gains
-- evidence_id.
-- ---------------------------------------------------------------------------
