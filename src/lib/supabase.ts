import { createClient } from '@supabase/supabase-js'

/**
 * The one connection to our Supabase database.
 *
 * Import this anywhere that needs data:
 *   import { supabase } from '../lib/supabase'
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS FUSSY ABOUT KEY NAMES
 * ---------------------------------------------------------------------------
 * Supabase renamed the browser key. The dashboard's Connect panel now emits
 * VITE_SUPABASE_PUBLISHABLE_KEY (value starts `sb_publishable_`), while older
 * projects and every older tutorial use VITE_SUPABASE_ANON_KEY (an `eyJ…` JWT).
 *
 * Code that reads only one name silently gets `undefined` from the other, and
 * the client ends up null. That failure is horrible to diagnose because it
 * surfaces later as a vague "something went wrong" in the UI rather than as an
 * error here. So: read both names, and fail loudly and specifically if neither
 * is present.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  const missing = [
    !url && 'VITE_SUPABASE_URL',
    !key && 'VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY)',
  ]
    .filter(Boolean)
    .join(' and ')

  throw new Error(
    `Supabase is not configured: ${missing} is missing.\n\n` +
      'Fix it in three steps:\n' +
      '  1. Open .env.local in the project root.\n' +
      '  2. Paste the values from the Supabase dashboard (green "Connect"\n' +
      '     button, or Project Settings -> API Keys).\n' +
      '  3. STOP the dev server with Ctrl+C and run `npm run dev` again.\n' +
      '     Vite only reads .env.local at startup - saving the file while the\n' +
      '     server is running does nothing.',
  )
}

/**
 * ---------------------------------------------------------------------------
 * THE REASON A BROKEN EMAIL LINK LOOKED LIKE AN ORDINARY SIGN-IN PAGE
 * ---------------------------------------------------------------------------
 * When Supabase refuses a link from an email — expired, already used, a
 * confirmation for a change that no longer exists — it does not show a page of
 * its own. It sends the browser back to this app with the reason in the URL
 * FRAGMENT:
 *
 *   https://…/account/profile#error=access_denied&error_code=otp_expired
 *                             &error_description=Email+link+is+invalid+or+has+expired
 *
 * Nothing here read that. `detectSessionInUrl` (on by default) consumes the
 * fragment and wipes it, the route guard finds no session, and the person is
 * shown the sign-in form — the same screen they would get from clicking
 * nothing at all. Somebody who has just followed a link from their inbox is
 * told that their link did nothing, in a way indistinguishable from the mail
 * never having worked. An hour went into "the email is broken" when the email
 * was fine and the LINK had expired.
 *
 * SUCCESS IS JUST AS SILENT, and that is the half that started this. A link
 * Supabase ACCEPTS comes back the same way, carrying what it was for:
 *
 *   https://…/account/profile#access_token=…&type=email_change
 *
 * The address really has changed at that point, and nothing said so. Somebody
 * who had just been told to watch for a link followed it, landed on a screen
 * that mentioned none of it, and had no way to tell success from the silence
 * of a link that failed. That is the whole reason this file reads the fragment
 * at all; the error case above is the same wound on the other side.
 *
 * Read ABOVE createClient deliberately: this module's job is to hand back a
 * client, and the client clears the fragment as it starts. Reading here is the
 * only place guaranteed to run first. Synchronous and side-effect free apart
 * from the read — nothing is cleaned up, because the client is about to.
 *
 * Only sound because the client is left on its default IMPLICIT flow, which
 * puts all of this in the fragment. Setting `flowType: 'pkce'` would move it to
 * a `?code=` query parameter and every field below would silently read null.
 */
type AuthRedirect = {
  /** Supabase refused the link. Already a sentence, meant to be shown. */
  error: string | null
  /** What the link was for: 'email_change', 'recovery', 'signup', 'invite'. */
  type: string | null
  /**
   * Supabase's own note when a link is accepted but the job is NOT finished —
   * what "Secure email change" returns after the first of two confirmations.
   */
  message: string | null
}

function readAuthRedirect(): AuthRedirect {
  const empty = { error: null, type: null, message: null }
  if (typeof window === 'undefined') return empty

  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return empty

  // URLSearchParams decodes `+` and percent-escapes on `get`, so what comes
  // back is already display-ready prose.
  const params = new URLSearchParams(hash)
  const description = params.get('error_description')
  const code = params.get('error_code')

  return {
    error: description ?? (code ? `Sign-in link refused: ${code}.` : null),
    type: params.get('type'),
    message: params.get('message'),
  }
}

/**
 * What the link in the email turned out to mean, or an empty result when this
 * page load did not come from one. Read once, at module load — a later read
 * finds the fragment already gone.
 */
export const authRedirect = readAuthRedirect()

export const supabase = createClient(url, key)

// Development only: expose the client on `window` so you can poke at the
// database from the browser console while debugging — e.g.
//   await supabase.from('students').select('*')
// to see exactly what YOUR signed-in account is allowed to read.
//
// import.meta.env.DEV is false in a production build, so this line is removed
// entirely by the bundler and never ships.
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { supabase: typeof supabase }).supabase = supabase
}
