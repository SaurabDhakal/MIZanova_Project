import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Tailwind v4 runs as a Vite plugin. There is no tailwind.config.js and no
  // PostCSS setup — design tokens live in src/index.css instead.
  plugins: [
    react(),
    tailwindcss(),

    /**
     * Service worker — the second half of NFR2.
     *
     * The offline QUEUE (src/lib/offlineQueue.ts) keeps a teacher's log when
     * the network drops. It cannot help if the page itself will not open: a
     * teacher who closes the tab in a corridor with no signal previously got
     * the browser's "no internet" screen and no way back in. This precaches
     * the application so it starts from disk.
     *
     * DECISION 1 — no web app manifest. `manifest: false` is deliberate. The
     * brief is a website; there is no mobile app and nothing should offer to
     * "install" itself to a home screen. This is a service worker for
     * resilience, not a packaged app.
     *
     * DECISION 2 — NOTHING from Supabase is cached, and there is no
     * `runtimeCaching` block at all. Only the shell is stored: JavaScript,
     * CSS, HTML, fonts. Student names, behaviour logs and messages never touch
     * the disk cache.
     *
     * That is a privacy choice, not an oversight. These laptops are shared
     * between classrooms, and a cache survives signing out — so a cached API
     * response is a child's record sitting on a machine that the next teacher
     * signs in to. Being offline therefore means the app opens and the queue
     * accepts new logs, but existing records are not readable. That is the
     * correct trade: a teacher can always record what they are seeing now.
     */
    VitePWA({
      // 'prompt', not 'autoUpdate': swapping the code under someone midway
      // through logging an incident is not acceptable. UpdatePrompt.tsx asks.
      registerType: 'prompt',
      manifest: false,
      // Registered from React so the update prompt can be shown properly.
      injectRegister: null,

      /*
       * injectManifest, NOT generateSW, since push notifications arrived.
       *
       * A generated worker has no place to put a `push` listener. The usual
       * answer is `workbox.importScripts`, which is precisely the thing the
       * note on inlineWorkboxRuntime below was written to prevent: a worker
       * restarted while offline cannot fetch a second script, so it dies
       * before serving one cached file.
       *
       * So the worker is written out in src/sw.ts and bundled. Everything the
       * generated one did is still there — precache, navigation fallback, no
       * runtime caching, wait-to-activate — and inlineWorkboxRuntime is gone
       * because bundling makes it meaningless: there is no second file left to
       * import.
       */
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // svg included so the favicon does not 404 offline — it is a shipped
        // asset, and a console full of failures makes real ones harder to see.
        // `png` is here for the logo. The app is expected to open with the
        // wifi off, and a brand mark that 404s offline leaves every header
        // showing the fallback while the rest of the screen is fine — which
        // reads as a half-broken app rather than as an absent network.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        // (Deep-link fallback now lives in src/sw.ts, as a NavigationRoute.)
        // The bundle is over the default 2 MiB precache limit.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      // The service worker is deliberately off during `npm run dev`. It
      // caches aggressively, which fights Vite's hot reload and produces
      // exactly the "why am I running old code?" confusion that cost real
      // time while building the offline queue. Test it with `npm run preview`.
      devOptions: { enabled: false },
    }),
  ],

  /**
   * NOT VITE'S DEFAULT 5173, DELIBERATELY.
   *
   * 5173 is the port every other Vite project on a machine also claims, and a
   * port IS the identity of an origin. Two apps sharing one origin share one
   * localStorage, one set of saved passwords and one service worker
   * registration — so the browser offers another project's logins on this
   * one's sign-in page, and whatever one of them caches is served to the other.
   *
   * strictPort so a clash FAILS instead of quietly moving to 5274. A silently
   * different port is how you end up debugging the app you are not looking at.
   */
  server: { port: 5273, strictPort: true },
  preview: { port: 4273, strictPort: true },
})
