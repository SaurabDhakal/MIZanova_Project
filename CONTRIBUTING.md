# Working on MiZanova with someone else

Written after a previous attempt at this project fell apart — not because the
code was bad, but because two people changed things faster than either could
follow. The rules below exist to prevent that specific failure, not to be
ceremony.

---

## 0. Before your first line of code

Read these, in order. A fresh Claude session knows none of it:

1. `docs/05-Resume-Here.md` — where the build actually is
2. `docs/03-Decisions-Log.md` — what was decided and why (do not re-litigate)
3. `docs/02-Session-Handoff.md` — traps already paid for
4. `docs/06-End-to-End-Test.md` — how to prove the app still works

Start your Claude session by telling it to read them. It will not know
otherwise, and it will cheerfully rebuild something that already exists.

---

## 1. THE DATABASE IS SHARED. THE CODE IS NOT.

Git branches protect code. Nothing protects the Supabase project — there is
one, and both of you point at it.

**If you run a script in `db/`, it changes the app for both of you, instantly,
with no branch and no undo.**

So:

- **Never run a `db/` script without telling the other person first.** Not a
  pull request — an actual message, before you run it.
- **Never edit an already-applied script.** They are a history, not source
  code. Add `db/0NN_next_thing.sql` instead.
- **Claim your migration numbers up front.** Agree something like: Saurab takes
  015–019, the other person takes 020–024. Two people creating `015_*.sql`
  independently is a guaranteed conflict, and the second one to run wins
  silently.
- Every script must be **safe to run twice** — `create ... if not exists`,
  `create or replace`, `drop policy if exists` before `create policy`. The
  Supabase SQL editor does not wrap scripts in a transaction, so a script that
  fails halfway leaves the first half applied.
- **Commit the script before you run it.** The free tier has no backups. Those
  files are the backup.

If this becomes painful, the alternative is a second Supabase project (Sydney
region) for the second person, with `db/001`–`0NN` and `seed_test_data.sql` run
in order. Fully isolated, at the cost of separate test accounts.

---

## 2. Split by area, not by "whoever gets there first"

The thing that went wrong last time was two people touching the same feature
and each assuming the other had not started.

Agree an owner per area before you start. For example:

| Area | Files |
|---|---|
| Educator screens | `src/pages/educator/*` |
| Parent screens | `src/pages/parent/*` |
| Specialist | `src/pages/specialist/*` |
| School Admin | `src/pages/schoolAdmin/*` |
| Platform Admin | `src/pages/platformAdmin/*` |
| AI server | `server/*` |

Two files are shared by everything and are where conflicts actually happen:

- `src/lib/api.ts`
- `src/App.tsx`

**Only append to those.** New functions at the end of the relevant section, new
routes at the end of `BUILT_SCREENS`. Do not reorder, reformat or tidy them
while someone else has work in progress.

---

## 3. Branches and pull requests

```bash
git pull                      # always, before starting
git checkout -b feature/parent-messages
# ...work...
git add -A && git commit
git push -u origin feature/parent-messages
```

Then open a pull request on GitHub. **Nobody pushes to `main` directly.**

Before merging, the other person checks out the branch and runs:

```bash
npm install
npm run lint
npm run build
npm run security-check
```

All four must pass. `security-check` matters most: it attacks every table as an
anonymous visitor, and **an accidentally-opened table produces no error and no
symptom** — nothing else will tell you.

---

## 4. Your own secrets

`.env.local` is git-ignored and will not arrive with the clone. Each person
needs their own copy:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` — same for both, from
  the Supabase dashboard (public by design)
- `SUPABASE_SERVICE_ROLE_KEY` — the secret key. Share it out of band, never in
  a commit, a chat, or a screenshot.
- `ANTHROPIC_API_KEY` — **get your own.** Sharing one key means sharing one
  bill and one rate limit, and you cannot tell whose request went wrong.

Copy `.env.example` to `.env.local` and fill it in. Restart the dev server
afterwards — Vite reads that file only at startup.

---

## 5. The habit that has actually found the bugs

Every real defect in this project so far was found by **using the app**, not by
reading code. Lint, TypeScript and the production build were green for every
single one — because in each case the code did exactly what was written, and
what was written was not the feature.

So when you finish something: open it, press the button, and check that the
thing the screen *promises* actually happens. Prefer testing what should be
**prevented** — a control is only proven by what it stops.

Two traps worth knowing:

- A Supabase `update` filtered out by Row-Level Security **returns success with
  zero rows changed**. Use `assertChanged()` in `src/lib/api.ts` on any new
  mutation that depends on a policy.
- An empty result from an RLS-filtered query means **"unknown to you"**, not
  "zero". Never render it as a count.

---

## 6. Things not to re-decide

These are settled and written up in `docs/03-Decisions-Log.md` with reasons.
If you disagree, raise it — do not quietly change it:

- Australian compliance language (APP, Privacy Act 1988, AUD) — not HIPAA/FERPA
- Parents see first name plus initial, enforced by a generated column
- Exactly five roles. No new roles without agreement.
- The AI is never diagnostic; anonymise before every call; server-side only
- Invented Figma metrics (model accuracy, compliance scores, CSAT) are replaced
  with figures that can actually be computed, and the screen says what is
  missing and why
