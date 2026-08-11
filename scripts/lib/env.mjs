import { existsSync, readFileSync } from 'node:fs'

/**
 * Credentials, from the environment first and `.env.local` second.
 *
 * Both matter. On this laptop the file is what exists; on a CI runner there is
 * no file at all, only secrets in the environment. Reading only the file meant
 * every check here could run in exactly one place, which is most of the reason
 * they were only ever run when somebody remembered.
 *
 * Never prints a value.
 */
export function loadEnv() {
  const fromFile = {}
  // Resolved from THIS file, not from the caller. Callers live at different
  // depths — scripts/x.mjs and tests/helpers/x.ts — and passing the caller's
  // URL made the path wrong for one of them, which then read no file, found
  // no secrets, and reported success because it had nothing to search for.
  const path = new URL('../../.env.local', import.meta.url)

  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue
      const at = line.indexOf('=')
      fromFile[line.slice(0, at).trim()] = line.slice(at + 1).trim()
    }
  }

  const fromProcess = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => typeof v === 'string' && v !== ''),
  )

  return { ...fromFile, ...fromProcess }
}
