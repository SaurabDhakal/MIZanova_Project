/**
 * Full-page loading state.
 *
 * `role="status"` and the visible label mean a screen reader announces what is
 * happening rather than leaving the user in silence. The animation is a border
 * spin, which the global prefers-reduced-motion rule in index.css neutralises
 * for anyone who has asked for less movement.
 */
export default function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-screen flex-col items-center justify-center gap-3"
    >
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
        aria-hidden="true"
      />
      <p className="text-sm text-muted-foreground">{label}…</p>
    </div>
  )
}
