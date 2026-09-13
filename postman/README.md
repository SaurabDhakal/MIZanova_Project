# Testing the API with Postman

The collection covers the Express API in `server/index.js` — the part of
MiZanova a browser cannot reach around, because it holds the service key and
the Anthropic key.

| File | What it is |
|---|---|
| `MiZanova.postman_collection.json` | the requests and their tests |
| `MiZanova.example.postman_environment.json` | the variables, empty — this is the one in git |
| `MiZanova.local.postman_environment.json` | the same file with your values, git-ignored |

## Before you open Postman

The API must be running, and it needs `.env.local`:

```bash
npm run server
```

It listens on **8887**, not 8787. `http://localhost:8887/api/health` in a
browser is the fastest way to know it is up.

## Importing

In Postman: **Import** → drop both JSON files in → pick **MiZanova local** in
the environment dropdown, top right.

`MiZanova.local.postman_environment.json` already carries the Supabase URL and
the publishable key, taken from your `.env.local`. Two fields are blank and
only you can fill them:

- **authEmail** / **authPassword** — an account that already exists. There are
  no seeded accounts and the test suite's passwords are random per run, so use
  one you created yourself.
- **studentId** — a child the account above may see. Open that student in the
  app and take the id from the address bar.

## Running it

Folders run in order and the order matters:

1. **Health** — is the server up, and is what it depends on configured
2. **Sign in** — Supabase returns an access token, saved into `accessToken`
3. **Public endpoints** — the enquiry form, guardian codes, invitation links
4. **Signed in** — needs step 2 to have worked
5. **Without a token** — the same endpoints refusing an anonymous caller

Folders 1, 3 and 5 need no account. Press **Run** on the collection to execute
all of them with their tests, or open a single request and press **Send**.

`POST /api/strategies` is **switched off in the runner on purpose** — it bills
a real Anthropic key on every call. Set `behaviourLogId` and tick it back on
when you want to show the AI path working.

## Running it from the command line

The same collection, same assertions, no GUI — useful for a screenshot of the
whole run in one block:

```bash
npx newman run postman/MiZanova.postman_collection.json -e postman/MiZanova.local.postman_environment.json
```

Without credentials in the environment, restrict it to the folders that do not
need one:

```bash
npx newman run postman/MiZanova.postman_collection.json -e postman/MiZanova.local.postman_environment.json --folder "1. Health" --folder "3. Public endpoints" --folder "5. Without a token"
```

## What the tests actually assert

Mostly what should be **prevented**. A 200 proves an endpoint answered; a 401
on `POST /api/strategies` proves a stranger cannot spend the AI budget on a
child's observation, and a 404 on an unknown guardian code proves the server
gives the same answer for never-existed, already-used and withdrawn — because
distinguishing them would tell a stranger which codes are real.

Two responses are worth knowing before a result looks wrong:

- **`/api/health` says `degraded`, not `ok`.** That is honest, not broken: the
  Stripe key in `.env.local` is a placeholder with the right shape, so
  `stripe_key_works` is false while everything else is true.
- **A repeated enquiry still answers 200.** The same address and kind within
  ten minutes is treated as one enquiry, not two, so re-running the collection
  does not pile up rows.

## What is not in here

Nearly everything the app reads and writes never touches this API. The browser
talks to Supabase directly and Row-Level Security decides what comes back, so
those paths are tested by `npm test` signing in as real users — not by Postman.
This collection is the server-side surface only: the AI endpoints, billing,
invitations, guardian codes, push, and the public forms.
