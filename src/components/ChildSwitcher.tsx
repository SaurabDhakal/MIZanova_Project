import type { StudentRow } from '../lib/api'

/**
 * Which child a parent is looking at.
 *
 * RENDERS NOTHING FOR A FAMILY WITH ONE CHILD, which is most of them. A control
 * with one option is noise, and every screen it appears on is a screen with
 * less room for the thing the parent came for.
 *
 * ONE SWITCHER, ON HOME, AND NOWHERE ELSE. It used to be drawn on all eight
 * parent screens, which is the same control asked eight times — Saurab's call
 * on 8 September, and the right one: the choice already lives in
 * `localStorage` and every screen reads it on mount, so switching on Home
 * changes what the whole role is looking at. Drawing it repeatedly only made
 * a settled decision look unsettled.
 *
 * What every other screen must do instead is NAME the child in its own lead
 * sentence, so a family with two never has to wonder whose page they are on.
 * Seven of the eight already did; Appointments did not, and does now.
 *
 * Tabs rather than a dropdown: with two or three children the whole set is
 * worth showing at once, so a parent can see at a glance that MiZanova knows
 * about both of them. That reassurance is most of the value — the previous
 * version showed only the first child and gave no hint the second existed.
 */
export default function ChildSwitcher({
  children,
  child,
  onSelect,
}: {
  children: StudentRow[]
  child: StudentRow | undefined
  onSelect: (id: string) => void
}) {
  if (children.length < 2) return null

  return (
    /* Not on paper. The printed report names one child in its own header, and a
       row of tabs offering to switch to a sibling is a screen control that has
       no meaning once it is ink. */
    <div className="print-hide mb-6">
      <div
        role="tablist"
        aria-label="Choose a child"
        className="flex flex-wrap gap-2"
      >
        {children.map((option) => {
          const active = option.id === child?.id
          return (
            <button
              key={option.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onSelect(option.id)}
              className={`inline-flex min-h-11 items-center rounded-btn border px-4 py-2 text-sm font-semibold ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground'
              }`}
            >
              {option.first_name} {option.last_name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
