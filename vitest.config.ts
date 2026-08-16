import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    /**
     * ONE TEST FILE AT A TIME. This is not a performance setting.
     *
     * These tests run against the real Supabase project — there is only one
     * (§2.4 of the architecture review). Each file builds a world and, to
     * survive a crashed previous run, clears anything matching the test naming
     * convention first. Run two files at once and the second one's setup
     * deletes the first one's school, users and students halfway through its
     * assertions.
     *
     * It passed the first time both files existed, which is exactly how a race
     * like this gets left in.
     */
    fileParallelism: false,

    /**
     * Building a world creates SIX auth users and signs them all in — nine for
     * buildSpecialistWorld — so the default five seconds is nowhere near
     * enough, and a timeout here reads as a failing policy rather than a slow
     * setup.
     *
     * WHY 60 SECONDS WAS NOT ENOUGH EITHER. `signInWithRetry` waits out the
     * free tier's auth rate limit by sleeping 2s and then 4s: up to six seconds
     * per actor, before any network time at all. Nine actors is 54s of pure
     * sleep against a 60s ceiling, and six is 36s — close enough that a slow
     * afternoon tips it over. That produced two different-looking failures from
     * one cause: a hook timing out here, and a foreign key violation in the
     * NEXT file, because vitest abandons a timed-out hook while its promise
     * keeps running and building the world it was told to stop building.
     *
     * The cleanup scoping in tests/helpers/world.ts stops the second symptom.
     * This stops the first. Both are needed — one is the trigger, the other is
     * the collateral damage.
     */
    hookTimeout: 120_000,
    testTimeout: 20_000,

    include: ['tests/**/*.test.ts'],
  },
})
