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
      workbox: {
        // Put the Workbox runtime INSIDE sw.js instead of a second file it
        // pulls in with importScripts at startup.
        //
        // Without this the service worker is only alive while it happens to be
        // running. The browser shuts idle workers down and restarts them on the
        // next request — and a restart offline cannot fetch workbox-*.js, so
        // importScripts throws and the worker dies before it can serve a single
        // cached file. Offline then fails in a way that looks random, because
        // it depends on whether the worker was already awake.
        inlineWorkboxRuntime: true,
        // svg included so the favicon does not 404 offline — it is a shipped
        // asset, and a console full of failures makes real ones harder to see.
        // `png` is here for the logo. The app is expected to open with the
        // wifi off, and a brand mark that 404s offline leaves every header
        // showing the fallback while the rest of the screen is fine — which
        // reads as a half-broken app rather than as an absent network.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        // Deep links must work offline too. Without this, /educator/students
        // opens from cache but /educator/students/<id> does not, because the
        // browser asks the network for a URL that only React Router knows.
        navigateFallback: 'index.html',
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
})
