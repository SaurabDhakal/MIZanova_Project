import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import Logo from './Logo'
import Icon from './Icon'
import { PUBLIC_LINKS } from '../lib/publicNav'

/**
 * The header every public page shares — and the reason it now exists.
 *
 * ---------------------------------------------------------------------------
 * TWO HEADERS THAT DRIFTED, WHICH IS HOW A WHOLE AUDIENCE WENT MISSING
 * ---------------------------------------------------------------------------
 * Landing.tsx carried its own header and PublicLayout.tsx carried another.
 * They were near-identical, which is exactly the condition under which nobody
 * checks them against each other.
 *
 * "For individuals" shipped with db/088. It was added to PublicLayout and to
 * the footer, and nobody noticed the homepage — the page most visitors see —
 * had a separate list that never got it. The role existed, had a public page,
 * and could not be reached from the front door.
 *
 * SiteFooter already made this argument for itself: "A footer is the one
 * component on a site that must be identical everywhere, so it is a
 * component." A header is the other one. `PUBLIC_LINKS` below is now the only
 * place the list exists, so the two cannot disagree again.
 *
 * ---------------------------------------------------------------------------
 * AND THERE WAS NO NAVIGATION ON A PHONE
 * ---------------------------------------------------------------------------
 * Both headers hid the nav below `lg` and neither replaced it with anything.
 * The links were reachable — SiteFooter carries all of them — but only after
 * scrolling the entire homepage. Somebody on a phone who wanted the price had
 * to read the whole pitch first.
 *
 * A disclosure rather than a <dialog>: it needs no focus trap, no scroll lock
 * and no inert background, and it can actually be tested by clicking. The
 * behaviour matches AccountMenu — Escape closes it and returns focus to the
 * button that opened it — because that is the pattern this codebase already
 * settled on, and ContextSwitcher is the cautionary example of not doing it.
 */

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'font-semibold text-primary' : 'text-foreground hover:underline'

export default function PublicHeader() {
  const { pathname } = useLocation()

  /*
   * OPEN IS DERIVED FROM THE ROUTE, NOT RESET BY AN EFFECT.
   *
   * A single-page app does not reload, so a menu left open sits over the page
   * it just took you to — which reads as the link having done nothing. The
   * obvious fix is an effect that closes it when the path changes, and eslint
   * rejects that: setState inside an effect triggers a cascading render.
   *
   * Storing WHERE it was opened instead makes closing fall out of the render.
   * Navigating anywhere makes the stored path stale, so `open` is false with
   * nothing to run — and it covers the back button too, which an onClick
   * handler on each link would not.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const open = openedAt === pathname
  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape closes and hands focus back, or somebody who opened this with a
  // keyboard is left with it collapsed and no idea where they are.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // setOpenedAt rather than the setOpen wrapper: a useState setter is
        // stable, so the effect needs no extra dependency.
        setOpenedAt(null)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Move focus into the panel so the next Tab walks the menu rather than
  // continuing down the page behind it.
  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('a')?.focus()
  }, [open])

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
        <Link to="/" aria-label="MiZanova home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden gap-4 lg:flex">
          {PUBLIC_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {/* Padded to match the button beside it. As a bare link this was a
              24px tap target — the bare minimum WCAG 2.2 allows, and small
              for a thumb next to a 44px button it is meant to pair with. */}
          <Link
            to="/login"
            className="rounded-btn px-3 py-2.5 font-semibold text-primary hover:underline"
          >
            Log in
          </Link>
          {/* NOT "Get started". Bare /signup creates no account — it is a
              signpost that sends you to an invitation, a guardian code, or the
              individual form. A button promising to start something, landing
              on a page explaining you cannot, is a broken promise. */}
          <Link
            to="/enquiry"
            className="hidden rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:brightness-110 sm:inline-block"
          >
            Talk to us
          </Link>

          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="public-menu"
            className="rounded-btn border border-border p-2.5 text-foreground lg:hidden"
          >
            <Icon name={open ? 'cross' : 'menu'} className="h-5 w-5" />
            <span className="sr-only">{open ? 'Close menu' : 'Menu'}</span>
          </button>
        </div>
      </div>

      {/* `hidden` on the element rather than an early return, so the id that
          aria-controls points at exists whether or not it is showing. */}
      <div
        id="public-menu"
        ref={panelRef}
        hidden={!open}
        className="border-t border-border lg:hidden"
      >
        <nav aria-label="Main menu" className="mx-auto max-w-6xl px-6 py-3">
          <ul className="divide-y divide-border">
            {PUBLIC_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  className={({ isActive }) =>
                    `block py-3 ${
                      isActive ? 'font-semibold text-primary' : 'text-foreground'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
          {/* The primary action repeats here because it is hidden from the bar
              on the narrowest screens to leave room for the menu button. */}
          <Link
            to="/enquiry"
            className="mt-3 block rounded-btn bg-primary px-4 py-3 text-center font-semibold text-primary-foreground sm:hidden"
          >
            Talk to us
          </Link>
        </nav>
      </div>
    </header>
  )
}
