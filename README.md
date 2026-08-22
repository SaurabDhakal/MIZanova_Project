# MiZanova

A support platform for Australian schools working with neurodiverse students.
A teacher records what they saw; the system suggests strategies that have
worked elsewhere; a specialist stays in the loop wherever judgement is needed.

**Live: https://mizanova-project.onrender.com**

> Hosted on a free tier, so the first request after 15 minutes idle takes about
> 50 seconds to wake the server. Open it once before you need it.

---

## What it does

Five roles, one database, and Row-Level Security as the actual security
boundary rather than the user interface.

| Role | What they get |
|---|---|
| **Educator** | roster, student record, behaviour logging with a timer and voice-to-text, goals, messages — and it keeps working with no connection |
| **Specialist** | caseload, a review queue of held AI suggestions with the exact anonymised text that was sent, clinical session notes, shared resources |
| **Parent** | only what the school chose to share, somewhere to record what home is seeing, goals and the IEP, and consent they can withdraw at any moment |
| **School admin** | safeguarding queue with acknowledgement, staff and family directory, KPIs, compliance, invoices |
| **Platform admin** | AI governance and kill switch, teacher verification, screening expiry, audit trail, tenants, billing |

Plus a ten-page public site, and the front doors: invitation, guardian access
code, and an enquiry form.

**Two things the product refuses to do**, and they shape everything else:

- **The AI never sees a child.** Names, contact details and dates of birth are
  stripped before any observation is sent, the exact text that went is stored,
  and low-confidence or sensitive suggestions are held for a specialist before
  a teacher ever sees them.
- **Nobody creates their own account.** An invitation makes a staff account
  already attached to a school; a code makes a family account already linked to
  a child. There is no fourth door.

---

## Who built what

| | Area |
|---|---|
| **Saurab Dhakal** | foundation, auth, the public site, parent and platform admin screens |
| **Oshiet Upreti** | educator screens, and the student record three roles share |
| **Prabin Raj Bhandari** | school admin screens |
| **Tahmid Ferdous** | specialist screens, resources and the review queue |

Every area arrived through its own reviewed pull request. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how the work is split and the rules that
keep four people out of each other's way.

---

## Running it

Node 22 or newer.

```bash
git clone https://github.com/SaurabDhakal/MIZanova_Project.git
cd MIZanova_Project
npm install
```

Copy `.env.example` to `.env.local` and fill in the Supabase values. Then two
terminals:

```bash
npm run dev      # the app,  http://localhost:5273
npm run server   # the API,  http://localhost:8887
```

**Not 5173 and 8787** — those are the ports nearly every other Vite and Express
project claims, and two apps sharing one origin share one localStorage and one
set of saved passwords.

### The database

57 numbered scripts in `db/` build the schema: 43 tables and 97 row-level
security policies. Against an empty Supabase project:

```bash
npm run apply-db
```

It applies them in order, records what succeeded, and resumes from the file
that failed rather than starting over.

---

## Built with

React 19 · TypeScript · Vite 8 · Tailwind v4 · React Router 7 · TanStack Query 5
· Express 5 · Supabase Postgres (Sydney) · Anthropic API, server-side only

66 pages, 43 shared components, 18 test files.

---

## Checks

```bash
npm run lint            # must be silent
npm run build           # type check and production build
npm test                # row-level security, against the real database
npm run security-check  # four suites: anonymous attack surface, anonymisation,
                        # secrets in the bundle, colour contrast
npm run storage-check   # file storage policies, signing in as real people
```

All of it runs in CI on every pull request.

**Watch the duration, not the tick.** The database job takes about six minutes.
If it ever finishes in under one, it is skipping and the green tick means
nothing — that has happened once and went unnoticed for two days.

### Why the tests sign in as real users

They create a school, five people and some students, then act through the same
API a browser uses — no mocking, because a mocked row-level security test only
proves the mock works. Every assertion reads the row back with the service key,
because Postgres does not error when RLS filters an UPDATE: it reports success
and changes nothing.

---

## Known state

- **Email is not configured on the deployment.** Render blocks outbound SMTP.
  Invitations are created correctly and the link can be copied by hand.
- **Confirm email is off** in Supabase so the test suite can create throwaway
  accounts. It must go back on before anyone real uses this.
- Payments are Stripe test mode.
