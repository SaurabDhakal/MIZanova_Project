/**
 * The three states every screen backed by a database has, in one component.
 *
 * The previous project built screens against hardcoded arrays, which have no
 * loading state, never fail, and are never empty. Real data has all three, and
 * a screen that only handles the happy path breaks the first time the Wi-Fi
 * drops in a classroom. Handling them once here means every screen gets them.
 */
/**
 * Did this fail because there is no connection?
 *
 * Asked of the ERROR, not of `navigator.onLine`. The browser's opinion is
 * unreliable — it reports "online" for an access point that goes nowhere, and
 * DevTools' service-worker Offline switch does not change it at all. The
 * request itself is the only thing that actually found out.
 */
const NETWORK_FAILURE =
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|timed? ?out/i

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  const offline = NETWORK_FAILURE.test(message)

  return (
    <div
      role="alert"
      className={`rounded-card border p-6 ${
        offline
          ? 'border-warning bg-warning-subtle'
          : 'border-danger bg-danger-subtle'
      }`}
    >
      {/* "TypeError: Failed to fetch" tells a teacher nothing, and reads as a
          broken app rather than a missing connection. The raw text is kept
          below in small print so it is still there when debugging. */}
      <p
        className={`font-semibold ${
          offline ? 'text-warning-foreground' : 'text-danger-foreground'
        }`}
      >
        {offline ? 'You appear to be offline' : 'Could not load this data'}
      </p>
      <p
        className={`mt-1 max-w-prose text-sm ${
          offline ? 'text-warning-foreground' : 'text-danger-foreground'
        }`}
      >
        {offline
          ? 'This information is stored on the school’s server, not on this device, so it cannot be shown right now. You can still log behaviour — new logs are kept here and upload by themselves.'
          : message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`mt-3 rounded-btn border px-3 py-2 text-sm font-semibold ${
            offline
              ? 'border-warning text-warning-foreground'
              : 'border-danger text-danger-foreground'
          }`}
        >
          Try again
        </button>
      )}
      {offline && (
        <p className="mt-2 text-xs text-warning-foreground opacity-70">
          {message}
        </p>
      )}
    </div>
  )
}

/**
 * Empty is not an error, and the wording matters. "No students yet" is a fact;
 * "you have not been assigned any students" tells someone what to do about it.
 */
export function EmptyState({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <div className="rounded-card border border-border bg-card shadow-raised p-10 text-center">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {detail}
      </p>
    </div>
  )
}

/** Grey blocks in the shape of the content, so the layout does not jump. */
export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-card border border-border bg-card shadow-raised"
        />
      ))}
    </div>
  )
}
