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

    // Building a world creates five auth users and signs them all in. The
    // default five seconds is not enough and a timeout here looks like a
    // failing policy rather than a slow setup.
    hookTimeout: 60_000,
    testTimeout: 20_000,

    include: ['tests/**/*.test.ts'],
  },
})
