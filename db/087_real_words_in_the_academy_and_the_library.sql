-- ---------------------------------------------------------------------------
-- 087 — Real words in the Academy and the Library
-- ---------------------------------------------------------------------------
-- The Academy and the Library are finished screens with nothing in them. A
-- student opening the Academy on 5 September 2026 read a course called `eddsd`
-- containing a module called `eddsd` whose body was the single letter `d`. An
-- educator, a specialist and a school administrator each read "No courses for
-- you yet". The Library's one article was called "testing article".
--
-- None of that is a defect. It is what gets typed while testing a create form,
-- and it was never replaced.
--
-- ---------------------------------------------------------------------------
-- WHO WROTE THIS, WHICH MATTERS MORE THAN USUAL
-- ---------------------------------------------------------------------------
-- Claude drafted every word below, at Saurab's request, and nobody with
-- clinical training has reviewed it. It is deliberately narrow: each module
-- either describes how THIS PRODUCT behaves — which is checkable against the
-- code — or states a practice general enough that any teacher would recognise
-- it. Nothing prescribes a clinical intervention and nothing claims evidence it
-- does not have, which is the standard the Academy screen already holds itself
-- to when it says a tick "is not the same claim as having been assessed".
--
-- Treat it as a first draft. Edit it on the Courses and Articles screens, or
-- unpublish anything you disagree with — that is one click per item.
--
-- ---------------------------------------------------------------------------
-- REWRITTEN IN PLACE, NOT DELETED AND RECREATED
-- ---------------------------------------------------------------------------
-- `course_enrolments` and `module_completions` both cascade from `courses`, and
-- three enrolments already exist — two of them from real use on 31 August and
-- 3 September, before any of this testing. Dropping the placeholder rows to
-- make room would have taken those with them. The junk rows are updated instead
-- and keep their ids, so nobody loses a course they had started.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. The student course: `eddsd` becomes something a young person can read
-- ---------------------------------------------------------------------------
update public.courses
   set title   = 'Asking for what helps',
       summary = 'Getting started, speaking up, and what to do when it has already gone wrong.'
 where title = 'student course';

update public.course_modules
   set title = 'Knowing what helps you',
       body  = $md$Most people can tell you what makes things harder. Fewer can say what makes things easier, and that is the more useful list.

Think about a lesson that went well. Where were you sitting? Was it quiet or noisy? Did you know what was coming? Did you start straight away, or after a minute of doing nothing? The answers are your list, and they are allowed to be small and specific — a seat by the window, instructions written down as well as said, a minute before you start.

You are not asking for a favour. You are telling somebody something they cannot see.$md$
 where title = 'eddsd';

insert into public.course_modules (course_id, title, body, sort_order)
select c.id, 'Starting when starting is the hard part', $md$Knowing what to do and being able to begin are two different problems, and the second one is not laziness.

Make the first step smaller than feels sensible. Not "write the essay" but "write the worst possible first sentence". Not "tidy the desk" but "move one thing". Starting badly is a real strategy, because the hard part was starting and you are now past it.

If you have been staring at it for ten minutes, the task is not the problem. The size of the first step is.$md$, 2
  from public.courses c where c.title = 'Asking for what helps'
    and not exists (select 1 from public.course_modules m where m.course_id = c.id and m.sort_order = 2);

insert into public.course_modules (course_id, title, body, sort_order)
select c.id, 'When it has already gone wrong', $md$Some days go badly and nothing in this course prevents that.

One bad lesson is one lesson. It is not evidence about you, even though it can feel like a verdict at the time. The people who work with you have seen a great many bad lessons and think much less about yours than you do.

If something keeps going wrong in the same way, that is worth saying out loud to a teacher you trust. A pattern is fixable. A bad afternoon just needs to end.$md$, 3
  from public.courses c where c.title = 'Asking for what helps'
    and not exists (select 1 from public.course_modules m where m.course_id = c.id and m.sort_order = 3);


-- ---------------------------------------------------------------------------
-- 2. Empowered Parenting keeps its name and gains a body
-- ---------------------------------------------------------------------------
update public.course_modules
   set body = $md$A child who has stopped listening has usually stopped being able to listen. That is the distinction worth holding onto: most of what looks like refusal is a nervous system that has run out of room, and instructions given at that moment do not land no matter how reasonably they are put.

You cannot reason someone back into regulation, and you do not have to. What helps is almost always smaller and duller than it feels like it should be: fewer words, more time, less audience.

The conversation about what happened is worth having. It is worth having later.$md$
 where title = 'Understanding regulation';

insert into public.course_modules (course_id, title, body, sort_order)
select c.id, 'The five minutes before', $md$Most difficult moments at home are more predictable than they feel. Transitions, hunger, the end of something absorbing, an unexpected change to a plan — the same few triggers account for a great deal.

Noticing the five minutes before is more useful than getting better at the five minutes after. A warning before a transition, a visible countdown, or letting a child finish the level rather than stopping mid-way costs almost nothing and removes the moment entirely.

If you are not sure what the pattern is, write down three days of them. It is usually obvious by the third.$md$, 2
  from public.courses c where c.title = 'Empowered Parenting'
    and not exists (select 1 from public.course_modules m where m.course_id = c.id and m.sort_order = 2);

insert into public.course_modules (course_id, title, body, sort_order)
select c.id, 'What to write in a home observation', $md$Home observations go to the staff assigned to your child, and they are often the only thing telling the school what the day looked like from your side.

The useful ones are specific and short. "Slept badly, three wake-ups" before a hard morning at school explains more than a paragraph of interpretation. So does a good week — teachers see the difficult days by default and rarely hear about the settled ones.

You are not writing a report and nobody is marking it. Nothing is notified when you post one, so if something is urgent, ring the school.$md$, 3
  from public.courses c where c.title = 'Empowered Parenting'
    and not exists (select 1 from public.course_modules m where m.course_id = c.id and m.sort_order = 3);


-- ---------------------------------------------------------------------------
-- 3. The three roles that had nothing
-- ---------------------------------------------------------------------------
insert into public.courses (title, summary, audiences, is_published, published_at)
select 'Writing a log somebody can use',
       'Twenty seconds of typing that is still useful in three months.',
       array['educator']::public.user_role[], true, now()
 where not exists (select 1 from public.courses where title = 'Writing a log somebody can use');

insert into public.course_modules (course_id, title, body, sort_order)
select c.id, m.title, m.body, m.n
  from public.courses c
  cross join (values
    ('What a useful log actually contains', $md$A log is read three times: by you next week, by a specialist who has never met the child, and by a parent who was not there. It has to survive all three readings, and most of what makes that work is leaving things out.

Write what you saw and what happened around it. "Tore up the worksheet after the second correction" can be pictured by somebody who was not in the room. "Was disruptive" cannot — it is a judgement with the evidence removed, and a specialist reading it three months later has nothing to work with.

Say what came just before. That single detail is what turns a list of incidents into a pattern, and it is the thing most often missing.$md$, 1),
    ('Before, during, after — without the jargon', $md$You may have met this as ABC: antecedent, behaviour, consequence. The words are unhelpful and the shape is not.

Before: what was being asked, what had just changed, who was nearby.
During: what the child did, for how long, how it ended.
After: what you did, and whether it helped.

The third part is the one people skip, and it is the only part that tells the next reader what to try. A log that ends at the behaviour describes a problem. A log that records what you tried is the beginning of an answer.$md$, 2),
    ('Flagging, and what happens next', $md$Flagging a log sends it to your school administrator's safeguarding queue. It does not email anybody and it does not reach Special Miles.

You can keep adding detail until an administrator acknowledges it. After that the record is locked and you cannot edit it — that is the point of acknowledging, and it is why the administrator has to write what they did before the button will work.

Flag when a child may be at risk, not when an incident was serious. A hard day is not a safeguarding matter, and a queue full of hard days is a queue nobody reads carefully.$md$, 3)
  ) as m(title, body, n)
 where c.title = 'Writing a log somebody can use'
   and not exists (select 1 from public.course_modules x where x.course_id = c.id);


insert into public.courses (title, summary, audiences, is_published, published_at)
select 'Reviewing what the AI suggests',
       'Why a suggestion reaches you, and what you are actually deciding.',
       array['specialist']::public.user_role[], true, now()
 where not exists (select 1 from public.courses where title = 'Reviewing what the AI suggests');

insert into public.course_modules (course_id, title, body, sort_order)
select c.id, m.title, m.body, m.n
  from public.courses c
  cross join (values
    ('Why this one was held', $md$Every suggestion carries a confidence score. Below the school's threshold it is held for a human instead of going to the teacher, and the card tells you which reason applied.

A held suggestion is not a wrong one. It is one the model was less sure about, which usually means the log was short, ambiguous, or unlike anything else on file. Those are the cases where your reading of the child matters most, which is exactly why the threshold sends them to you.$md$, 1),
    ('Read what was actually sent', $md$Every card has "Exactly what was sent to the AI". Open it.

Names are removed before anything leaves MiZanova — the child's, the family's, and every other child at the school, so a log reading "he pushed Maya" does not leak a child the request had nothing to do with. The panel shows you the result rather than asking you to take it on trust.

It is also the fastest way to see why a suggestion missed. If the anonymised text lost something that mattered, the model never had it, and the answer is a better log rather than a better model.$md$, 2),
    ('Release, rewrite, or refuse', $md$Releasing sends it to the teacher as a suggestion, not an instruction. Nothing is recorded as tried until somebody records it.

Rewrite freely. A suggestion in your words, referring to what you know about the child, is worth more than a fluent one that does not fit — and the teacher cannot tell which parts came from you, which is fine, because you are the one accountable for it either way.

Refusing is a real outcome and it costs nothing. The queue exists so that something unsuitable stops with you.$md$, 3)
  ) as m(title, body, n)
 where c.title = 'Reviewing what the AI suggests'
   and not exists (select 1 from public.course_modules x where x.course_id = c.id);


insert into public.courses (title, summary, audiences, is_published, published_at)
select 'The safeguarding queue, and consent',
       'Two responsibilities the software records and cannot carry for you.',
       array['school_admin']::public.user_role[], true, now()
 where not exists (select 1 from public.courses where title = 'The safeguarding queue, and consent');

insert into public.course_modules (course_id, title, body, sort_order)
select c.id, m.title, m.body, m.n
  from public.courses c
  cross join (values
    ('What acknowledging actually does', $md$Acknowledging a flagged incident does two things at once: it records what the school did about it, and it locks the record so the teacher who wrote it can no longer edit it.

That is why the note is required. An acknowledgement with nothing written in it seals a child's incident with no account of what followed, and the screen would be claiming something it could not show.

Write what was done, not what was decided. "Spoke to the family on Tuesday, moved seating for the rest of term" is a record. "Noted" is not.$md$, 1),
    ('Consent you hold on paper', $md$Compliance lets you record a consent a family has already given elsewhere — at enrolment, on a form, in a meeting. The screen asks whether you hold it in writing before it will save, because what you are recording is a claim about a document, not the document.

Two of the six consents are enforced by this software: AI strategy generation, and a child's own sign-in. Without them the features do not run at all. The other four are recorded for you to honour, and the screen says so on every one of them rather than implying the software is doing more than it is.$md$, 2),
    ('Withdrawal is not deletion', $md$When a family withdraws a consent, the record of having given it stays. That is deliberate: the history is what lets the school show it acted on the family's decision, and on what date.

Withdrawing AI consent stops new suggestions immediately. It does not remove suggestions already generated, and it does not undo anything a teacher did on the strength of one. If a family asks for that, it is a conversation, not a button.$md$, 3)
  ) as m(title, body, n)
 where c.title = 'The safeguarding queue, and consent'
   and not exists (select 1 from public.course_modules x where x.course_id = c.id);


-- ---------------------------------------------------------------------------
-- 4. The Library
-- ---------------------------------------------------------------------------
-- "testing article" is rewritten rather than deleted, for the same reason the
-- courses were: it is already published and already visible to every audience,
-- so replacing its words is one change instead of a delete and an insert.
-- ---------------------------------------------------------------------------
update public.articles
   set title   = 'What the AI sees, and what it never sees',
       summary = 'One behaviour log goes. Here is what is stripped out of it first, and what is never sent at all.',
       body    = $md$When a teacher asks for classroom strategies, MiZanova sends one behaviour log to an AI service and asks for suggestions. This is what goes, and what does not.

REMOVED BEFORE IT LEAVES. The child's name, the family's names, contact details, and the names of every other child at the school. That last one matters more than it sounds: a log reading "he pushed Maya" would otherwise carry a second child into a request that has nothing to do with her.

NEVER SENT AT ALL. The safeguarding record, messages, plan documents, home observations, and anything about any other child. One log goes, and nothing else.

NOT SENT WITHOUT CONSENT. The check happens before the anonymisation, not after, so a child whose family has not given consent has nothing prepared and nothing transmitted. A teacher pressing the button is told why it did not run.

Every specialist reviewing a held suggestion can open the exact text that was sent. The claim on this page is checkable inside the product, which is the only kind of claim worth making about privacy.$md$
 where title = 'testing article';

insert into public.articles (kind, title, summary, body, audiences, is_published, published_at, consent_confirmed)
select 'article',
       'Why a parent sees "Ethan M."',
       'Full names for staff, first name and initial almost everywhere else — and the reason is not what most people assume.',
       $md$Across most of MiZanova a child appears as a first name and an initial. Staff see full names; the short form is used wherever a screen could show more than one household's children.

It is not there to keep anything from a family — a parent reads their own child's full name on their own screens. It is there so that a list, a chart, or a screenshot shared in a staff meeting cannot carry somebody else's surname out of the room.

The rule is kept by the database rather than by each screen remembering it. The short name is computed when the record is written, so a page added next year gets it without anybody having to know the rule exists.

Where you do see a full name — a teacher's roster, a family's own child — that is a decision somebody made on purpose, not a gap.$md$,
       array['parent','educator','specialist','school_admin']::public.user_role[], true, now(), false
 where not exists (select 1 from public.articles where title = 'Why a parent sees "Ethan M."');

insert into public.articles (kind, title, summary, body, audiences, is_published, published_at, consent_confirmed)
select 'article',
       'What MiZanova will not tell you',
       'Four things this product does not do, written down so you do not discover them at a bad moment.',
       $md$A short list of things this product does not do, written down so you do not have to discover them at a bad moment.

IT DOES NOT EMAIL YOU. Not when a resource is shared, not when a plan needs agreeing, not when a message arrives. Invitations and access codes are sent by email; nothing else is. If you are waiting to hear about something, check the screen rather than the inbox.

IT IS NOT FOR EMERGENCIES. Messages here are read when somebody next opens the app, which may be tomorrow. Ring the school.

AN EMPTY SCREEN IS NOT ALWAYS GOOD NEWS. Where a count could not be loaded, MiZanova says "not known" rather than showing a zero — but a genuinely empty list means only that nothing has been recorded, not that nothing has happened.

A TICK IS NOT AN ASSESSMENT. Marking an Academy module done records that you read it. There are no certificates and nothing is scored, because being told something is not the same as having been assessed on it.$md$,
       array['parent','educator','specialist','school_admin','student']::public.user_role[], true, now(), false
 where not exists (select 1 from public.articles where title = 'What MiZanova will not tell you');


-- ---------------------------------------------------------------------------
-- Check it.
-- ---------------------------------------------------------------------------
--   select c.title, c.audiences, count(m.id) as modules
--   from public.courses c left join public.course_modules m on m.course_id = c.id
--   group by c.id, c.title, c.audiences order by c.title;
--
--   select title, audiences from public.articles order by title;
--
-- Expect five courses with three modules each, and three articles. Nothing
-- should be called `eddsd` or "testing article" any more.
