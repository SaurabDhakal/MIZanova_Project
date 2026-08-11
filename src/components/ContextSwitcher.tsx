import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMyMemberships,
  queryKeys,
  switchContext,
  type Membership,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { ROLE_CONFIG } from '../lib/roles'
import { showToast } from '../lib/toast'

/**
 * Where am I working right now — db/039.
 *
 * A specialist carries caseloads at four schools; a teacher at one school is a
 * parent at another; somebody moving jobs in January belongs to both for a
 * fortnight. The database has supported all of that since memberships landed.
 * This is the control that makes it usable.
 *
 * RENDERS NOTHING FOR ONE MEMBERSHIP, which is almost everybody. A switcher
 * offering a single option is a permanent reminder of a feature you do not
 * need, on every screen.
 *
 * IT IS NOT A PERMISSION. `switch_context` refuses any organisation the caller
 * does not hold a live membership for, so this component being wrong — or
 * being edited in DevTools — changes nothing about what is reachable.
 */
export default function ContextSwitcher() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const memberships = useQuery({
    queryKey: queryKeys.myMemberships,
    queryFn: fetchMyMemberships,
    // Parents and platform admins hold none by design, so do not ask.
    enabled:
      profile?.role === 'educator' ||
      profile?.role === 'specialist' ||
      profile?.role === 'school_admin',
  })

  const switchTo = useMutation({
    mutationFn: (m: Membership) => switchContext(m.organisation_id, m.role),
    onSuccess: (_result, m) => {
      setOpen(false)
      showToast(`Now working at ${m.organisation_name}.`)

      /**
       * A FULL RELOAD, deliberately, and it is not laziness.
       *
       * Switching context changes the answer to almost every question the app
       * has already asked. Three separate things are now stale and they live in
       * three different places: the React Query cache holds the previous
       * school's roster and counts; the signed-in profile is held in memory by
       * AuthProvider and still names the old organisation and role; and the
       * sidebar and routes are generated from that role.
       *
       * Clearing the query cache fixes one of the three. Reloading fixes all of
       * them, and cannot miss one — and the failure mode of missing one is a
       * screen showing one school's children under another school's name.
       *
       * This is what every product with a workspace switcher does, for the same
       * reason. It happens a handful of times a day, not a handful of times a
       * minute.
       */
      queryClient.clear()
      window.location.assign('/')
    },
    onError: (error) => showToast(error.message),
  })

  const all = memberships.data ?? []
  if (all.length < 2) return null

  const current = all.find((m) => m.is_current) ?? all[0]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="max-w-52 rounded-btn border border-border px-3 py-2 text-left text-sm hover:bg-background"
      >
        <span className="block truncate font-semibold text-foreground">
          {current.organisation_name}
        </span>
        <span className="block text-xs text-muted-foreground">
          {ROLE_CONFIG[current.role].label} · change
        </span>
      </button>

      {open && (
        <>
          {/* Click-away. A dropdown that only closes by pressing the button
              again is a dropdown people leave open by accident. */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />

          <ul
            role="listbox"
            className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-card border border-border bg-card shadow-lifted"
          >
            <li className="border-b border-border px-4 py-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Where you work
              </p>
            </li>

            {all.map((m) => {
              const active = m.organisation_id === current.organisation_id &&
                m.role === current.role
              return (
                <li key={`${m.organisation_id}-${m.role}`} role="option" aria-selected={active}>
                  <button
                    type="button"
                    disabled={active || switchTo.isPending}
                    onClick={() => switchTo.mutate(m)}
                    className={`w-full px-4 py-3 text-left text-sm disabled:cursor-default ${
                      active ? 'bg-primary-subtle' : 'hover:bg-background'
                    }`}
                  >
                    <span className="block font-semibold text-foreground">
                      {m.organisation_name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {ROLE_CONFIG[m.role].label}
                      {active && ' · you are here'}
                    </span>
                  </button>
                </li>
              )
            })}

            <li className="border-t border-border px-4 py-2">
              <p className="text-xs text-muted-foreground">
                You only see records for the place you are working in.
              </p>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
