# Working on MiZanova, four of us at once

Read this before your first line of code. It is short, and every rule in it
exists because of a specific way this goes wrong — not as ceremony.

---

## 0. Who owns what

Split by **role area**, end to end. The folders already work this way, so four
people can build at once without touching each other's files.

| Person | Folder | Screens |
|---|---|---|
| Saurab | `src/pages/platformAdmin/` + `src/pages/parent/` | 19 |
| Prabin | `src/pages/schoolAdmin/` | 9 |
| Osheit | `src/pages/educator/` | 5 |
| Tahmid | `src/pages/specialist/` | 5 |

**You do not edit another person's folder.** If you need something changed in
one, ask them.

**One ordering rule, once:** Osheit's educator pull request merges first.
`educator/StudentRoster` and `educator/StudentDetail` are reused by the school
admin and the specialist rather than copied — three roles open a child's record
through the same screen. After his lands, the rest of us are independent.

---

## 1. Getting it running on your machine

Install Node 22 or newer, Git and VS Code first.

```bash
git clone https://github.com/SaurabDhakal/MIZanova_Project.git
cd MIZanova_Project
npm install
```

Copy `.env.example` to `.env.local` and fill in the three values Saurab sends
you privately. **Restart the dev server after editing it** — Vite reads that
file only at startup.

Two terminals:

```bash
npm run dev      # the app, http://localhost:5273
npm run server   # the API, http://localhost:8887
```

**Not the usual 5173 and 8787.** Those are the ports nearly every other Vite and
Express project claims, and a port is the identity of an origin. Two apps on one
origin share one localStorage and one set of saved passwords — so the browser
starts offering another project's logins on this one's sign-in page.

`.env.local` is git-ignored and will never arrive with a clone. That is
deliberate — it holds the key that bypasses every security policy in the
database.

**Do not ask for the `ANTHROPIC_API_KEY`.** One key is one bill and one rate
limit, and nobody can tell whose request went wrong. The app runs without it;
the AI features simply say what is missing. Get your own if you need them.

---

## 2. THE DATABASE IS SHARED. THE CODE IS NOT.

Git branches protect code. **Nothing protects the Supabase project** — there is
one, and all four of us point at it.

- **Never run a script in `db/` without saying so in the group chat first.** Not
  a pull request — an actual message, before you run it. It changes the app for
  everyone instantly, with no branch and no undo.
- **Never edit a script that has already been applied.** They are a history, not
  source code. Add `db/0NN_next_thing.sql` instead.
- **Claim your migration numbers up front.** Two people creating `058_*.sql`
  independently is a guaranteed collision, and the second one to run wins
  silently.
- Every script must be **safe to run twice** — `create ... if not exists`,
  `create or replace`, `drop policy if exists` before `create policy`.
- **Commit the script before you run it.** The free tier has no backups. The
  files in `db/` are the backup.

### Only one person runs `npm test` at a time

The suite builds its own school, students and five users, then deletes them **by
naming convention**. Two people running it at once means one person's cleanup
destroys the other's world mid-assertion — and it surfaces as a broken-looking
suite rather than a busy database. Say so in the chat before you run it.

A fresh database is built by `npm run apply-db`, which applies every numbered
file in `db/` in order and resumes from wherever it last failed.

---

## 3. Branches and pull requests

`main` is protected. Nobody pushes to it, including Saurab. Every change goes
through a pull request with **1 approval** and **green CI**.

```bash
git checkout main
git pull                          # always, before starting
git checkout -b educator          # or school-admin, specialist, parent…
# ...work...
git add -A
git commit -m "what this does, in a sentence"
git push -u origin educator
```

GitHub then offers a **Compare & pull request** button.

**Commit as you go — many small commits, not one enormous one.** They are what
show who built what.

Before approving someone's pull request, check the branch out and run:

```bash
npm run lint
npm run build
npm run security-check
```

All three must pass. `security-check` matters most: it attacks every table as an
anonymous visitor, and **an accidentally-opened table produces no error and no
symptom** — nothing else will tell you.

**When merging, choose "Create a merge commit" — never "Squash and merge".**
Squash crushes fifteen commits into one and erases who did the work.

---

## 4. The two files we all have to touch

Everything else is separated by folder. These two are shared lists:

- `src/App.tsx` — the lazy imports, `BUILT_SCREENS` and `DETAIL_ROUTES`
- `src/components/AppShell.tsx` — the sidebar

Each has a block with your name on it. **Add to your own block only.**

**When git reports a conflict in either file, KEEP BOTH SIDES.** It is never a
real disagreement — it is two people adding two different screens to the same
list. Deleting the other side to "fix" the conflict deletes their work.

Do not reorder, reformat or tidy those files while someone else has work open.

### How a screen gets switched on

Anything not listed in `BUILT_SCREENS` renders a `<Placeholder>` naming the
milestone that will build it. So a half-finished product is *visibly*
half-finished rather than quietly missing. To turn your screen on: add its lazy
import, then one line to `BUILT_SCREENS`.

---

## 5. The habit that has actually found the bugs

Every real defect in this project was found by **using the app**, not by reading
code. Lint, TypeScript and the production build were green for every single one
— because in each case the code did exactly what was written, and what was
written was not the feature.

So when you finish something: open it, press the button, and check the thing the
screen *promises* actually happens. Prefer testing what should be **prevented**
— a control is only proven by what it stops.

Two traps worth knowing before you write a mutation:

- A Supabase `update` filtered out by Row-Level Security **returns success with
  zero rows changed**. Use `assertChanged()` in `src/lib/api.ts` on anything that
  depends on a policy.
- An empty result from an RLS-filtered query means **"unknown to you"**, not
  "zero". Never render it as a count.

**A number that cannot be wrong is a number that was never right.** When a screen
reports a count, ask what it shows when the question could not be asked.

---

## 6. Known settings that are wrong on purpose

- **Supabase → Authentication → Email → Confirm email is OFF.** Without this the
  test suite cannot create throwaway accounts, because it signs up at a reserved
  domain that can never receive mail. It must go back **ON** before this is used
  by real people, or anyone can register an address they do not own.
- **There are no seeded user accounts.** The first platform admin is made by
  signing up at `/signup` with a real address, then running TASK 4 in
  `db/admin_tasks.sql`. The signup trigger can only create a parent, deliberately
  — staff arrive by invitation.

---

## 7. Things not to re-decide

Settled. If you disagree, raise it — do not quietly change it:

- Australian compliance language (APP, Privacy Act 1988, AUD) — not HIPAA/FERPA
- Parents see first name plus initial, enforced by a generated column
- Exactly five roles. No new roles without agreement.
- The AI is never diagnostic; anonymise before every call; server-side only
- An account is never created by someone simply appearing. An invitation makes a
  staff account, a code makes a family account. There is no fourth door.
