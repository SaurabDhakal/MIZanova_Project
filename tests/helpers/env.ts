import { existsSync, readFileSync } from 'node:fs'

/**
 * Credentials, from the environment first and `.env.local` second.
 *
 * The order matters for CI. A GitHub runner has no `.env.local` — it has
 * secrets in the environment — so reading the file first and only would mean
 * the suite could never run anywhere but this laptop. On this laptop the file
 * is what exists, so it is the fallback.
 *
 * Nothing here is printed. It holds the service key.
 */
function loadEnv(): Record<string, string> {
  const fromFile: Record<string, string> = {}

  const path = new URL('../../.env.local', import.meta.url)
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue
      const at = line.indexOf('=')
      fromFile[line.slice(0, at).trim()] = line.slice(at + 1).trim()
    }
  }

  return { ...fromFile, ...pickDefined(process.env) }
}

/** process.env is full of undefined-valued keys; they must not win. */
function pickDefined(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>
}

const env = loadEnv()

export const SUPABASE_URL = env.VITE_SUPABASE_URL
export const PUBLISHABLE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY
export const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SERVICE_KEY) {
  throw new Error(
    'RLS tests need VITE_SUPABASE_URL, a publishable key and SUPABASE_SERVICE_ROLE_KEY in .env.local.',
  )
}
