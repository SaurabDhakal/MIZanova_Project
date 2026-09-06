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
      half-configured. **Joe's call, not an engineering task.**
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
