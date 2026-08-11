/**
 * Stand-in for a screen that has a route but no content yet.
 *
 * Every one of these is a promise we have to keep — the milestone tag says
 * which part of the roadmap fills it in. The old project's biggest failure was
 * building screens against fake data, so these stay deliberately empty until
 * there is a real database table behind them.
 */
export default function Placeholder({
  title,
  milestone,
}: {
  title: string
  milestone: string
}) {
  return (
    <div className="rounded-card border border-border bg-card shadow-raised p-8">
      <h1 className="text-title text-foreground">{title}</h1>
      <p className="mt-2 max-w-prose text-muted-foreground">
        This screen is routed but not built yet. It gets its content in
        milestone{' '}
        <span className="font-semibold text-foreground">{milestone}</span>, once
        the database tables behind it exist.
      </p>
    </div>
  )
}
