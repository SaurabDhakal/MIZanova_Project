/**
 * The status filter on a triage queue, with how many are behind each one.
 *
 * WHAT THIS FIXES. Both queues open on "new". Both showed "Nothing waiting"
 * while rows sat one tab away, and somebody looked at that and concluded the
 * feature was broken. The screen was telling the truth about the tab and
 * looked like it was telling the truth about the system.
 *
 * The number goes ON THE TAB rather than into the empty state, because the tab
 * is where the question is actually asked. A message saying "nothing here, but
 * there are 3 in Contacted" answers it after somebody has already drawn the
 * wrong conclusion.
 *
 * NO NUMBER AT ALL WHEN THE COUNT COULD NOT BE TAKEN. `counts` is undefined
 * while loading and when the query failed, and the tabs simply render without
 * numbers. A tab reading "0" because a count errored is this project's
 * most-repeated fault, and it is not being written a tenth time.
 *
 * Radios rather than buttons, as on Pricing: a screen reader announces "3 of 6"
 * and arrow keys move between them, which six styled buttons would not do.
 */
export default function QueueTabs<T extends string>({
  name,
  tabs,
  value,
  onChange,
  counts,
}: {
  /** Must be unique on the page — it groups the radios. */
  name: string
  tabs: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  counts: Record<string, number> | undefined
}) {
  return (
    <fieldset className="mb-6">
      <legend className="sr-only">Show only</legend>
      <div className="inline-flex flex-wrap rounded-btn border border-border bg-card p-1">
        {tabs.map((tab) => {
          const count = counts?.[tab.value]
          const active = value === tab.value
          return (
            <label
              key={tab.value}
              className={`cursor-pointer rounded-btn px-4 py-2 text-sm font-semibold ${
                active ? 'bg-primary text-primary-foreground' : 'text-foreground'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={tab.value}
                checked={active}
                onChange={() => onChange(tab.value)}
                className="sr-only"
              />
              {tab.label}
              {count !== undefined && (
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                    active
                      ? 'bg-primary-foreground/20'
                      : count > 0
                        ? 'bg-primary-subtle text-primary'
                        : 'text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              )}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
