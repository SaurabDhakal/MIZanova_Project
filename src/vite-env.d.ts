/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * Tells TypeScript which environment variables exist, so `import.meta.env`
 * autocompletes and a typo like VITE_SUPBASE_URL is caught while you type
 * rather than at runtime as `undefined`.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  /** Current name from the Supabase Connect panel (`sb_publishable_…`). */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Older name for the same thing (`eyJ…` JWT). Supported as a fallback. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
