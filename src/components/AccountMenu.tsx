import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { avatarUrl } from '../lib/api'
import Avatar from './Avatar'
import Icon from './Icon'

/**
 * Who is signed in, and the two things they can do about it.
 *
 * REPLACES TWO FLAT BUTTONS. `Security` and `Sign out` sat side by side in the
 * top bar with identical weight — same border, same size, same colour. Saurab:
 * "security on top seems so lame", "signout seems so pale". Both were symptoms
 * of the same thing: two controls of very different consequence given exactly
 * the same emphasis, and neither given any.
 *
 * They are not peers. Opening a security page is routine; signing out ends the
 * session on a shared school laptop. So sign out is separated by a rule, and
 * carries the only colour in the menu.
 *
 * KEYBOARD BEHAVIOUR IS THE POINT OF WRITING THIS BY HAND. The existing
 * ContextSwitcher closes on click-away but not on Escape, and does not return
 * focus, so keyboard users who open it are stranded. This one closes on Escape
 * and puts focus back on the trigger, because the account menu is the control
 * somebody reaches for when they want to LEAVE — and needing a mouse to escape
 * a menu about leaving is a poor joke. Worth back-porting to ContextSwitcher
 * when the keyboard pass happens.
 */
export default function AccountMenu({ roleLabel }: { roleLabel: string }) {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  /*
   * ONE SIGNED URL FOR THE WHOLE SHELL. The bucket is private, so a path has
   * to be exchanged over the network before an <img> can use it. Keyed on the
   * path, so replacing a photo fetches a new URL and removing one drops
   * straight back to the monogram without a reload.
   */
  const photo = useQuery({
    queryKey: ['my-avatar', profile?.avatar_path ?? 'none'],
    queryFn: () => avatarUrl(profile?.avatar_path ?? null),
    enabled: !!profile?.avatar_path,
    staleTime: 50 * 60 * 1000, // the URL lasts an hour; refetch before it dies
  })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Move focus INTO the menu when it opens, so the next Tab walks the menu
  // rather than carrying on down the page behind it.
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('a, button')?.focus()
  }, [open])

  if (!profile) return null

  const name = profile.full_name || profile.email || 'Your account'
  const close = () => setOpen(false)

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-btn py-1.5 pr-2 pl-1.5 hover:bg-background"
      >
        <Avatar
          id={profile.id}
          name={profile.full_name ?? ''}
          email={profile.email ?? ''}
          photoUrl={photo.data ?? null}
        />
        {/*
          AVATAR AND ROLE, NOT A NAME — and the name was usually an email.

          This rendered `full_name || email || 'Your account'`. Staff accounts
          created by invitation have no full_name until somebody types one, so
          the fallback ran and the top bar carried
          "platformadmin@mizanova.edu.au" at full width: 246px, more than a
          quarter of a 903px bar, to say something the avatar and the dropdown
          both already say.

          It was not free. That width is what pushed the centred search box into
          the account menu at anything under about 1200px, so a fallback nobody
          chose was deciding a layout breakpoint.

          The email is still readable in full, one click away in the dropdown,
          which is where somebody actually goes to check which account they are
          signed in as. Hidden below sm, where the avatar alone carries it.
        */}
        <span className="hidden text-sm font-medium text-foreground sm:block">
          {roleLabel}
        </span>
        <Icon
          name="chevronDown"
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close account menu"
            onClick={close}
            className="fixed inset-0 z-10 cursor-default"
          />

          <div
            ref={menuRef}
            role="menu"
            aria-label="Account"
            className="absolute right-0 z-20 mt-1.5 w-64 overflow-hidden rounded-card border border-border bg-card shadow-lifted"
          >
            {/* The full email, untruncated. This is the one place somebody
                checks WHICH account they are in on a shared laptop, and a
                truncated address cannot answer that question. */}
            <div className="flex items-start gap-3 border-b border-border px-4 py-3">
              <Avatar
                id={profile.id}
                name={profile.full_name ?? ''}
                email={profile.email ?? ''}
                size="lg"
                photoUrl={photo.data ?? null}
              />
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{name}</p>
                <p className="text-xs break-all text-muted-foreground">{profile.email}</p>
                <p className="mt-1 inline-flex rounded-btn bg-primary-subtle px-2 py-0.5 text-xs font-semibold text-primary">
                  {roleLabel}
                </p>
              </div>
            </div>

            <NavLink
              to="/account/profile"
              role="menuitem"
              onClick={close}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-background"
            >
              <Icon name="user" className="h-4 w-4 text-muted-foreground" />
              Your account
            </NavLink>

            <NavLink
              to="/account/security"
              role="menuitem"
              onClick={close}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-background"
            >
              <Icon name="lock" className="h-4 w-4 text-muted-foreground" />
              Password and sign-in
            </NavLink>

            <div className="border-t border-border p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close()
                  void signOut()
                }}
                className="flex w-full items-center gap-3 rounded-btn px-2.5 py-2 text-sm font-semibold text-danger-foreground hover:bg-danger-subtle"
              >
                <Icon name="logout" className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
