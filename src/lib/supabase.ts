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
