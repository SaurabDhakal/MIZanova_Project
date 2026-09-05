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
