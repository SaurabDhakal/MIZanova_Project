import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import Icon from './Icon'
import Logo from './Logo'

/**
 * The public header, and the menu that was missing under it.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS FIXES: THE NAVIGATION DISAPPEARED ON A PHONE
 * ---------------------------------------------------------------------------
 * Both public headers carried `hidden ... lg:flex` on the nav, so every one of
 * the seven links was `display: none` below 1024px — and there was no menu
 * button, no drawer, nothing behind them. Measured on the homepage at 375px:
 * seven anchors, all 0×0. On the device most people open a link on, the only
 * way to reach For schools, For families, Pricing or About was to scroll past
 * the entire page to the footer.
 *
 * Landing.tsx said as much in a comment and left it: "there is no mobile menu
 * anywhere on this site, so a hidden nav is not hidden behind anything… that
 * is a menu component, not a class name". This is that component.
 *
 * ---------------------------------------------------------------------------
 * ONE HEADER, TWO PLACES — THE SAME REASON SiteFooter EXISTS
 * ---------------------------------------------------------------------------
 * Landing.tsx and PublicLayout.tsx each had their own header, and they had
 * already drifted exactly the way the footers did: "For individuals" shipped
 * with db/088, went into PublicLayout, and was absent from the homepage — the
 * one page most people see — for its whole life. PublicLayout marked the
 * current page and the homepage did not.
 *
 * Fixing the mobile menu in two files would have set up the third drift, so
 * the list lives here once and both pages render this.
 *
 * The drawer is built like AppShell's rather than as a dropdown: a signed-out
 * visitor on a phone gets the same full-height panel and backdrop a signed-in
 * one already gets, and the tap targets are 44px because that is what a thumb
 * needs.
 */

/**
 * Every public destination that exists, in the order the Figma header lists
 * them. A link only joins this when its page is real — the rule the footer and
 * the login screen already follow.
 *
 * Not exported: a file that exports both a component and a constant loses fast
 * refresh, and nothing outside this header needs the list.
 */
const PUBLIC_LINKS: { label: string; to: string }[] = [
  { label: 'For schools', to: '/for-schools' },
  { label: 'For families', to: '/for-parents' },
  { label: 'For individuals', to: '/for-individuals' },
  { label: 'For specialists', to: '/for-specialists' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Features', to: '/features' },
  { label: 'About', to: '/about' },
]

export default function SiteHeader() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = () => setOpen(false)

  /*
   * Escape closes it and puts focus back on the button that opened it, so a
   * keyboard user is not stranded inside a panel covering the page.
   *
   * Tab is caught for a less obvious reason: the panel says
   * `aria-modal="true"`, which tells a screen reader that everything outside
   * it is inert. Nothing enforced that — Tab walked out of the last link and
   * on down the page underneath, so the promise in the attribute was false and
   * the reading order disagreed with the tab order. Cheaper to make the
   * attribute true than to withdraw it.
   */
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const stops =
        panelRef.current.querySelectorAll<HTMLElement>('a[href], button')
      const first = stops[0]
      const last = stops[stops.length - 1]
      if (!first) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Move focus INTO the panel on open, so the next Tab walks the menu rather
  // than the page behind it.
  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus()
  }, [open])

  /*
   * CLOSE IT WHEN THE WINDOW GROWS PAST THE BREAKPOINT. The panel is
   * `lg:hidden`, so widening the window hides it — but the scroll lock below
   * is not a class and would have stayed on, leaving a desktop page that
   * cannot scroll and no visible control to unlock it. Dragging a window wider
   * is exactly how somebody finds that.
   */
  useEffect(() => {
    if (!open) return
    const desktop = window.matchMedia('(min-width: 64rem)')
    const onChange = () => desktop.matches && setOpen(false)
    desktop.addEventListener('change', onChange)
    return () => desktop.removeEventListener('change', onChange)
  }, [open])

  /*
   * The page behind a full-height drawer should not scroll under the thumb.
   * A CLASS, NOT `body.style.overflow` — the rule behind it in index.css only
   * exists below the breakpoint, so a window dragged wide unlocks the page by
   * itself even if the listener above never hears about it.
   */
  useEffect(() => {
    if (!open) return
    document.body.classList.add('menu-open')
    return () => document.body.classList.remove('menu-open')
  }, [open])

  const desktopLink = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'inline-flex min-h-11 items-center font-semibold text-primary'
      : 'inline-flex min-h-11 items-center text-foreground hover:underline'

  const drawerLink = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center rounded-btn px-3 py-2 ${
      isActive
        ? 'bg-primary-subtle font-semibold text-primary'
        : 'text-foreground hover:bg-background'
    }`

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-3 sm:py-4">
        <Link to="/" aria-label="MiZanova home">
          <Logo />
        </Link>

        {/* STAYS AT lg, AND NOW IT HAS SOMEWHERE TO GO. Seven items do not fit
            beside a logo and two buttons below about 1024px; raising the
            breakpoint only changes which widths lose the nav. The menu is what
            makes the breakpoint safe. */}
        <nav aria-label="Main" className="hidden gap-4 lg:flex">
          {PUBLIC_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={desktopLink}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {/*
            BOTH OF THESE STAND DOWN ON A PHONE, AND THE MEASUREMENT IS WHY.

            A logo (139px) and 48px of gutter leave 188px at 375px wide. "Talk
            to us" (110px) and "Menu" (78px) and one gap need 200. Twelve pixels
            short — so the row wrapped, and a header that is two rows of
            controls on a 375px screen is 135px tall: seventeen per cent of the
            viewport spent before the visitor sees a single word of the page.

            Wrapping was the honest failure of trying to keep everything. The
            fix is to stop trying: below `sm` the bar is the logo and the way
            into the rest of the site, which is what a phone header is. Neither
            control is lost — both are full-width buttons at the foot of the
            panel the Menu button opens, which is a better target than either
            was up here.

            Padded to match each other. As a bare link "Log in" was a 24px tap
            target — the bare minimum WCAG 2.2 allows, and small for a thumb
            beside a 44px button it is meant to pair with.
          */}
          <Link
            to="/login"
            className="hidden rounded-btn px-3 py-2.5 font-semibold text-primary hover:underline sm:inline-flex"
          >
            Log in
          </Link>
          {/* NOT "Get started". /signup creates no account any more — it is a
              signpost — so the old label promised something the next page
              immediately takes away. */}
          <Link
            to="/enquiry"
            className="hidden rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:brightness-110 sm:inline-block"
          >
            Talk to us
          </Link>

          {/* Labelled, not a bare hamburger: there is no icon for one in
              src/lib/icons.ts, and AppShell's mobile control says "Menu" too —
              so a visitor who signs in meets the same word in the same
              corner. */}
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="site-menu"
            className="inline-flex min-h-11 items-center rounded-btn border border-border px-3 py-2 font-semibold text-foreground lg:hidden"
          >
            Menu
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={close}
          />

          <div
            ref={panelRef}
            id="site-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-card p-4 shadow-lifted"
          >
            <div className="flex items-center justify-between gap-3">
              <Logo />
              <button
                type="button"
                onClick={() => {
                  close()
                  triggerRef.current?.focus()
                }}
                aria-label="Close menu"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-btn text-foreground hover:bg-background"
              >
                <Icon name="cross" className="h-5 w-5" />
              </button>
            </div>

            {/* EVERY LINK CLOSES IT ON THE WAY OUT — a menu still sitting over
                the page you just asked for is the commonest mobile-nav bug
                there is. Done here rather than with a `useLocation` effect,
                which sets state during an effect (the react-hooks rules reject
                it) and fires on first mount as well. */}
            <nav aria-label="Main" className="mt-4 flex flex-col gap-1">
              {PUBLIC_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={close}
                  className={drawerLink}
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            {/* Repeated at the foot of the panel because the pair in the bar is
                behind the backdrop while this is open, and on the narrowest
                phones "Log in" is only here. It is the commonest reason
                somebody opens a menu at all. */}
            <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
              <Link
                to="/login"
                onClick={close}
                className="flex min-h-11 items-center justify-center rounded-btn border border-border px-4 py-2.5 font-semibold text-primary hover:bg-background"
              >
                Log in
              </Link>
              <Link
                to="/enquiry"
                onClick={close}
                className="flex min-h-11 items-center justify-center rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:brightness-110"
              >
                Talk to us
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
