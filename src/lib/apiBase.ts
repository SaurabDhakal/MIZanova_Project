/**
 * Where the Express server lives — in one place, for everything that calls it.
 *
 * ---------------------------------------------------------------------------
 * EMPTY IN PRODUCTION, WHICH MEANS "WHEREVER THIS PAGE CAME FROM"
 * ---------------------------------------------------------------------------
 * In development the app is on 5273 and the API on 8887, so it needs the
 * absolute address. Deployed, one server serves both, so a relative `/api/…` is
 * correct by construction and cannot be configured wrongly.
 *
 * It used to fall back to `http://localhost:8787` in every environment. The
 * first deployment therefore had an https page asking every visitor's OWN
 * machine for `/api/invitations`, which the browser blocked:
 *
 *   Access to fetch at 'http://localhost:8787/api/invitations' from origin
 *   'https://mizanova.onrender.com' has been blocked by CORS policy
 *
 * The fix is not to set VITE_API_URL on the host. That would work, and it would
 * be one more variable that can be wrong — the point of serving both from one
 * origin is that the app does not need telling where its own API is.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE
 * ---------------------------------------------------------------------------
 * There were TWO copies of this line, in api.ts and mfa.ts, and fixing the
 * first left two-factor sign-in still pointing at localhost in production —
 * which would have failed only for accounts with an authenticator enrolled, and
 * only after a deploy that otherwise looked fine. One definition cannot drift
 * from itself.
 *
 * VITE_API_URL still wins if set, for the day the API moves to its own host.
 */
// 8887, not the conventional 8787. Two servers cannot hold one port, and the
// one that loses starts with EADDRINUSE at the moment you are looking at the
// other terminal. See the note in vite.config.ts.
export const API_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? 'http://localhost:8887' : '')
