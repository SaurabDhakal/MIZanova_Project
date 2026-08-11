import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { ICON_NAMES } from '../lib/icons'
import StatTile from '../components/StatTile'

/**
 * Design-token proof sheet — a developer reference, not a product screen.
 *
 * Keep it: when a colour looks wrong on a real screen later, this page tells
 * you instantly whether the token is wrong or the usage is.
 */

/**
 * One row of the token reference table.
 *
 * THE HEX IS READ FROM THE STYLESHEET, NOT TYPED HERE. It used to be a prop,
 * and by the time anybody looked three of the sixteen had gone stale: this page
 * was still advertising `sidebar #1e3a5f` and `primary #2563eb` long after both
 * had changed, and `muted-foreground` was out by a shade. A reference sheet that
 * confidently states the wrong value is worse than no sheet, because it is the
 * thing you check when you already suspect something is wrong.
 *
 * That is the same fault this product keeps finding in itself — something
 * reporting a result it never measured — and the fix is the same one: ask the
 * source. `--color-<name>` is the source, so drift is now impossible rather than
 * merely discouraged.
 */
function Swatch({ name, note }: { name: string; note?: string }) {
  // Read straight through: no state and no effect, because the answer cannot
  // change while this page is open and the read is idempotent. Putting it in an
  // effect only bought a render where the sheet showed nothing.
  const hex = getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-${name}`)
    .trim()

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4">
        <span
          className="inline-block h-6 w-6 rounded-btn border border-border align-middle"
          style={{ backgroundColor: `var(--color-${name})` }}
        />
      </td>
      <td className="py-2 pr-4 font-mono text-sm text-foreground">{name}</td>
      <td className="py-2 pr-4 font-mono text-sm text-muted-foreground">
        {/* An empty string means the token does not exist. Saying so is more
            use than printing nothing and looking like a rendering glitch. */}
        {hex || <span className="text-danger-foreground">not defined</span>}
      </td>
      <td className="py-2 text-sm text-muted-foreground">{note}</td>
    </tr>
  )
}

export default function DesignTokens() {
  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <Link to="/" className="text-sm font-medium text-primary hover:underline">
        ← Back
      </Link>

      <h1 className="mt-4 text-title text-foreground">
        Design tokens — proof sheet
      </h1>
      <p className="mt-1 text-muted-foreground">
        Compare against{' '}
        <span className="font-medium">Classroom Overview Dashboard.png</span>.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* THE REAL COMPONENT, not a copy of it. This page had its own
            StatCard — a fourth hand-rolled version of the same tile, blank
            square and all — so the reference for how a tile looks was itself
            drifting from the tiles. */}
        <StatTile
          label="Total students"
          value={24}
          icon="students"
          hint={<span className="text-muted-foreground">Across 2 classes</span>}
        />
        <StatTile
          label="Critical alerts"
          value={3}
          icon="safeguarding"
          tone="danger"
          hint={
            <span className="font-medium text-danger-foreground">
              Needs review
            </span>
          }
        />
        {/* The state worth showing on a reference page: a figure that could
            not be loaded. It is an em-dash and says why, because a zero here
            would be a lie the rest of this product works hard to avoid. */}
        <StatTile
          label="Recent logs"
          value={undefined}
          icon="observations"
        />
      </div>

      <h2 className="mt-10 text-lg font-semibold text-foreground">
        Status colours
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Light fill plus the darkened text token — that pairing is what passes
        WCAG AA. The plain mid-tone would not.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-btn bg-success-subtle px-3 py-1 text-sm font-medium text-success-foreground">
          On track
        </span>
        <span className="rounded-btn bg-warning-subtle px-3 py-1 text-sm font-medium text-warning-foreground">
          In progress
        </span>
        <span className="rounded-btn bg-danger-subtle px-3 py-1 text-sm font-medium text-danger-foreground">
          Needs review
        </span>
        <span className="rounded-btn bg-accent-subtle px-3 py-1 text-sm font-medium text-accent-foreground">
          IEP meeting
        </span>
      </div>

      {/* THE WHOLE SET, SO A NEW ONE CAN BE COMPARED BEFORE IT SHIPS. Icons
          drawn by hand drift: a stroke that is heavier than its neighbours or
          a drawing that sits smaller in its box is invisible one at a time and
          obvious in a grid. */}
      <h2 className="mt-10 text-lg font-semibold text-foreground">Icons</h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        Inline SVG, no library — an icon font is a second request that has to
        succeed before a screen is readable, and this app opens with the wifi
        off. Each one takes <code>currentColor</code>, so it is the colour of
        whatever it sits in.
      </p>
      <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
        {ICON_NAMES.map((name) => (
          <li
            key={name}
            className="flex flex-col items-center gap-2 rounded-card border border-border bg-card shadow-raised p-4 text-center"
          >
            <Icon name={name} className="h-7 w-7 text-foreground" />
            <span className="text-xs break-all text-muted-foreground">
              {name}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-foreground">Buttons</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Press <kbd className="font-mono">Tab</kbd> — a blue focus ring must
        appear on each.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:brightness-110"
        >
          Log behaviour
        </button>
        <button
          type="button"
          className="rounded-btn border border-border bg-card px-4 py-2.5 font-semibold text-foreground hover:bg-background"
        >
          View details
        </button>
      </div>

      <h2 className="mt-10 text-lg font-semibold text-foreground">
        Every token
      </h2>
      <div className="mt-3 overflow-x-auto rounded-card border border-border bg-card shadow-raised p-5">
        <table className="w-full text-left">
          <caption className="sr-only">
            MiZanova design tokens with their hex values
          </caption>
          <tbody>
            <Swatch name="sidebar" note="Left navigation" />
            <Swatch
              name="primary"
              note="Buttons, active nav, links"
            />
            <Swatch name="primary-subtle" note="Icon tiles" />
            <Swatch name="background" note="Page behind cards" />
            <Swatch name="card" note="Panels" />
            <Swatch name="border" note="Outlines, dividers" />
            <Swatch
              name="foreground"
              note="Headings, body text"
            />
            <Swatch
              name="muted-foreground"
              note="Helper text"
            />
            <Swatch name="success" note="Shapes only" />
            <Swatch
              name="success-foreground"
              note="Success text"
            />
            <Swatch name="warning" note="Shapes only" />
            <Swatch
              name="warning-foreground"
              note="Warning text"
            />
            <Swatch name="danger" note="Shapes only" />
            <Swatch
              name="danger-foreground"
              note="Danger text"
            />
            <Swatch name="accent" note="IEP / calendar chips" />
            <Swatch
              name="accent-foreground"
              note="Accent text"
            />
          </tbody>
        </table>
      </div>
    </div>
  )
}
