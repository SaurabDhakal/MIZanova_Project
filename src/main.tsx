import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import AuthProvider from './components/AuthProvider.tsx'
import { initServiceWorker } from './lib/swUpdate.ts'
import { isOfflineFailure } from './lib/offlineQueue.ts'

// TanStack Query caches server data and gives every screen loading, error and
// retry handling for free. Without it, each screen hand-rolls three useStates
// and gets one of them subtly wrong.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * WHY 'always' AND NOT THE DEFAULT.
       *
       * React Query's default is to PAUSE a query when the browser reports no
       * network. A paused query stays `pending` forever, so every screen built
       * on one shows its loading skeleton and never resolves — which is
       * exactly what the educator dashboard did offline: empty white cards,
       * no explanation, no end.
       *
       * We would rather run the request, let it fail, and say "you appear to
       * be offline" — which the error states already do. Failing is
       * information; pausing is a spinner nobody can dismiss.
       */
      networkMode: 'always',

      /**
       * Schools have bad Wi-Fi, so a dropped request is worth retrying — but
       * not when there is plainly no connection at all. Two retries with
       * backoff against a disconnected machine only delays the message and
       * fills the console with a hundred identical failures.
       */
      retry: (failureCount, error) =>
        isOfflineFailure(error) ? false : failureCount < 2,

      // Treat data as fresh for 30s, so moving between screens does not
      // re-query the database for something we just fetched.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

// Before rendering, and outside React entirely. Registering from a component
// meant it only ran once someone was signed in — so a first visit, which lands
// on /login, registered nothing and the app could never open offline.
initServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
