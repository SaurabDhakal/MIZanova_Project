import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { MFA_REQUIRED_ROLES } from '../lib/roles'

/**
 * NFR5 — "sessions must timeout after 20 minutes".
 *
 * The Security tab has been admitting this one for as long as it has existed:
 * "the design for this screen also shows SMS codes, a 20-minute auto-lock …
 * none of those exist yet". It is the only requirement in the client documents
 * still outstanding that is a security control rather than a feature, which is
 * why it went ahead of the remaining screens.
 *
 * ---------------------------------------------------------------------------
 * THE FOUR ROLES THAT NEED IT, NOT ALL SIX
 * ---------------------------------------------------------------------------
 * `Final Requirements` puts NFR5 under §1.3, the Neurodiverse Specialist's
 * requirements, and pairs it with the mandatory 2FA that this product already
 * enforces for exactly four roles. So it follows `MFA_REQUIRED_ROLES` rather
 * than inventing a second list: educator, specialist, school admin, platform
 * admin — the four with somebody else's child on screen, and the four this
 * codebase keeps describing as working on shared classroom machines.
 *
 * A parent, a student or an individual is on their own phone, looking at their
 * own family. Signing them out every twenty minutes would protect nobody and
 * would land hardest on the parent reading a plan in a hospital waiting room.
 * The threat NFR5 is about is a laptop left open in a staffroom.
 *
 * ---------------------------------------------------------------------------
 * IT WARNS FIRST, AND THAT IS NOT A COURTESY
 * ---------------------------------------------------------------------------
 * A teacher is most likely to be idle in this product while typing — reading a
 * child's face, deciding what to write, halfway through a behaviour log that
 * exists nowhere but the form. Signing them out on the twentieth minute with
 * no warning would delete that, and the next thing they would learn is not to
 * trust the product with anything long.
 *
 * A minute of warning with one button costs nothing and turns a data-loss
 * event into an interruption. `Stop the clock` is deliberately not a
 * navigation: pressing it must not move them off the form they are in.
 *
 * ---------------------------------------------------------------------------
 * A BANNER, NOT A MODAL
 * ---------------------------------------------------------------------------
 * A modal would trap focus, which is the correct pattern for a decision that
 * must be made — and the wrong one here, because the decision this offers is
 * "carry on doing what you were doing". It also cannot be verified in the
 * in-app browser, which swallows Escape and never fires a dialog's close
 * event, so a modal would have shipped on reasoning alone.
 */

/** Twenty minutes, from NFR5. */
const IDLE_MS = 20 * 60 * 1000
/** How long the warning stands before the session actually ends. */
const WARN_MS = 60 * 1000

/*
 * `visibilitychange` is in the list on purpose: a locked screen fires no
 * pointer or key events, so without it a laptop shut at 4pm and opened the
 * next morning would count the whole night as one idle stretch and sign out
 * correctly — but a teacher switching to their email for thirty seconds and
 * back would also look idle. Coming BACK to the tab is activity.
 */
const ACTIVITY = [
  'pointerdown',
  'keydown',
  'scroll',
  'wheel',
  'touchstart',
  'visibilitychange',
] as const

export default function IdleTimeout() {
  const { profile, signOut } = useAuth()
  const [warningAt, setWarningAt] = useState<number | null>(null)
  /*
   * NULL UNTIL THE EFFECT RUNS. `useRef(Date.now())` reads a clock during
   * render, which the purity rule refuses and is right to: React may render a
   * component more than once for one commit, so the "start" would be whichever
   * attempt happened to stick. The effect below sets it when the listeners go
   * on, which is the moment the clock should actually start.
   */
  const lastActive = useRef<number | null>(null)

  const applies = profile !== null && MFA_REQUIRED_ROLES.includes(profile.role)

  const markActive = useCallback(() => {
    lastActive.current = Date.now()
    setWarningAt(null)
  }, [])

  useEffect(() => {
    if (!applies) return

    // The clock starts here rather than at render — see the ref above.
    if (lastActive.current === null) lastActive.current = Date.now()

    const onActivity = () => {
      // While the warning is up, only the button counts. Otherwise a stray
      // scroll from a bag resting on a trackpad would cancel it, which is the
      // exact situation the timeout exists for.
      if (warningAt !== null) return
      lastActive.current = Date.now()
    }

    for (const event of ACTIVITY) {
      window.addEventListener(event, onActivity, { passive: true })
    }

    /*
     * POLLED RATHER THAN A setTimeout PER EVENT. A timer reset on every
     * keystroke is thousands of cleared timers in a long note; a five-second
     * tick is one comparison. It also survives a laptop sleeping, where a
     * pending setTimeout does not fire on time.
     */
    const tick = window.setInterval(() => {
      const idleFor = Date.now() - (lastActive.current ?? Date.now())

      if (warningAt === null && idleFor >= IDLE_MS - WARN_MS) {
        setWarningAt(Date.now())
        return
      }
      if (warningAt !== null && Date.now() - warningAt >= WARN_MS) {
        // Errors are swallowed on purpose: offline, `signOut` calls a server
        // that is not there, and the session must still end locally. The
        // provider clears the cached profile and roster before it calls out
        // for exactly this reason.
        void signOut().catch(() => {})
      }
    }, 5000)

    return () => {
      for (const event of ACTIVITY) window.removeEventListener(event, onActivity)
      window.clearInterval(tick)
    }
  }, [applies, warningAt, signOut])

  if (!applies || warningAt === null) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-warning bg-warning-subtle px-4 py-3 shadow-raised"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-foreground">
          <strong className="font-semibold">
            You are about to be signed out.
          </strong>{' '}
          This account is signed out after twenty minutes of inactivity, because
          it can open children&rsquo;s records. Anything you have typed and not
          saved will be lost.
        </p>
        <button
          type="button"
          onClick={markActive}
          className="inline-flex min-h-11 items-center rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Stop the clock
        </button>
      </div>
    </div>
  )
}
