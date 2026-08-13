# MiZanova — working contract

Read this first. Then read the guide for the half you are touching:

| You are changing | Read |
|---|---|
| Anything under `src/` | [src/CLAUDE.md](src/CLAUDE.md) |
| Anything under `server/`, `db/` or `scripts/` | [server/CLAUDE.md](server/CLAUDE.md) |

`CONTRIBUTING.md` is the human team agreement (who owns which folder, branch and
PR rules). This file and the two guides are the technical contract.

---

## What this is

A support platform for Australian schools working with neurodiverse students.
Five roles, one database, Row-Level Security as the actual security boundary.

| Piece | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite 8, Tailwind v4, React Router 7, TanStack Query 5 |
| Backend | Express 5 on plain JavaScript (ESM, no build step) |
| Database | Supabase Postgres — schema and policies in `db/*.sql` |
| AI | Anthropic SDK, server-side only, `claude-opus-5` |
| Payments | Stripe |

The browser talks to Supabase **directly** for reads and writes. The Express
server exists only for what must never run in a browser: the Anthropic key, the
Supabase `service_role` key, Stripe secrets, and outbound mail.

---

## Commands

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run server
```

App on **http://localhost:5273**, API on **http://localhost:8887**. Not 5173 /
8787 — a shared origin means a shared `localStorage` and shared saved passwords
with every other Vite project on the machine.

`.env.local` is read only at process start. Restart both after editing it.

Before you call anything done:

```bash
npm run lint && npm run build && npm run security-check
```

`npm test` hits the one shared Supabase project and deletes rows by naming
convention — **announce it in the group chat before running it**, and never run
it while someone else is.

---

## How I want work done

1. **Do not commit.** Leave changes in the working tree; I verify and commit.
2. **No unnecessary comments.** Comment only what the code cannot say itself —
   a non-obvious *why*, a trap, an ordering that matters. Never narrate *what*.
3. **One line if it fits on one line.** Do not expand a ternary into an
   if/else, or a single expression into a temp variable, for its own sake.
4. **Everything modular.** Concrete rules are in each guide; the principle is
   that a file has one job and a new feature area gets a new file rather than
   another 200 lines in an existing one.
5. **Frontend and backend are managed separately.** A change to one should not
   require a change to the other unless the feature genuinely spans both. Say
   so explicitly when it does.

---

## Invariants — do not change these without asking

- **RLS is the security boundary.** `ProtectedRoute`, sidebar filtering and any
  `if (role === …)` in JavaScript are convenience. If a screen must not show
  data, a policy in `db/` is what stops it.
- **Only `VITE_`-prefixed variables may reach the browser.** Everything else is
  server-only. `npm run bundle-secret-check` scans the built bundle for leaks.
- **Nothing identifying reaches the AI.** `server/anonymise.js` is the only
  thing making that promise true, and `npm run anonymisation-check` proves it.
- **The AI is never diagnostic.** It suggests classroom strategies. It does not
  assess, diagnose or label a child.
- **Exactly five roles**, listed in `src/lib/roles.ts` and compiled into every
  RLS policy. `super_admin` is retired. No sixth role without agreement.
- **Australian compliance language** — APP, Privacy Act 1988, AUD, `en-AU` date
  formatting. Not HIPAA, not FERPA, not USD.
- **Parents see first name plus initial**, enforced by a generated column in
  Postgres, not by frontend formatting.
- **Accounts are never created by someone simply appearing.** An invitation
  makes a staff account; a guardian code makes a family account. Self-signup
  can only ever produce a `parent`.
- **A consent is a record, not a setting.** Withdrawing stamps `revoked_at`.
  Nothing in the consent trail is ever deleted.

---

## Two traps that have cost real time here

**A Supabase `update` filtered out by RLS returns success with zero rows
changed.** Any mutation that depends on a policy must call `assertChanged()`
(`src/lib/api.ts`) or a refusal is indistinguishable from a dead button.

**An empty result from an RLS-filtered query means "unknown to you", not
"zero".** Never render it as a count. When a screen reports a number, ask what
it shows when the question could not be asked.

---

## Shared files — the only ones four people touch at once

- `src/App.tsx` — lazy imports, `BUILT_SCREENS`, `DETAIL_ROUTES`
- `src/components/AppShell.tsx` — the sidebar frame
- `src/lib/roles.ts` — `ROLE_CONFIG` nav
- `src/lib/api.ts` — every database call
- `server/index.js` — route wiring

Each has per-person blocks. Add to your own block only. **On a git conflict in
any of them, keep both sides** — it is two people adding two different things to
one list, never a disagreement.

---

## Current state

`src/pages/educator/`, `parent/` and `platformAdmin/` are empty — those branches
have not merged yet. `src/pages/specialist/` and `src/pages/shared/` are built.

`DETAIL_ROUTES.specialist` in `src/App.tsx` points at `StudentDetail`,
`IepPlans` and `IepPlanEditor`. `IepPlans` and `IepPlanEditor` exist in
`src/pages/shared/`; **`StudentDetail` does not exist yet** — it is Osheit's
`educator/StudentDetail`, reused rather than copied, and his PR lands first.
Until then `npm run build` cannot pass with that route in place.
