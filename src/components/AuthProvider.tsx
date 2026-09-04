import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getAssuranceLevel, listTotpFactors } from '../lib/mfa'
import { clearRosterCache } from '../lib/rosterCache'
import {
  AuthContext,
  type AuthValue,
  type Profile,
  type SignUpDetails,
} from '../lib/auth'

/**
 * Holds the signed-in user for the whole application.
 *
 * Two separate things are tracked:
 *   - `session`  — Supabase's proof that someone signed in (the JWT).
 *   - `profile`  — our row in `profiles`, which carries the ROLE.
 *
 * The role is deliberately read from the database, not from the token. A JWT
 * lives in the browser and its contents are visible to the user; the profile
 * row is fetched under Row-Level Security every time. If someone tampers with
 * anything client-side, the database still decides what they can actually see.
 */

/**
 * The last profile we successfully loaded, kept so the app works offline.
 *
 * Without this, the service worker is pointless: the shell opens from cache,
 * the `profiles` query never returns, and both ProtectedRoute and RoleRedirect
 * sit on "Loading your profile" forever. A teacher would get a spinner instead
 * of the logging screen — exactly the moment offline support exists for.
 *
 * IS THIS SAFE TO STORE? It is the signed-in user's OWN name, role and school
 * — not another person's record, and no student data. Supabase already
 * persists the session, which contains their email, in the same place. It is
 * cleared on sign-out, and it is keyed by user id so one account can never
 * read the cached profile of another.
 *
 * A CACHED ROLE IS NOT A SECURITY HOLE. If an administrator revokes
 * verification while a teacher is offline, this cache is stale and shows them
 * screens they no longer qualify for. Those screens will be empty: RLS decides
 * what data comes back, and it re-checks on every request. This is the same
 * principle as ProtectedRoute itself — convenience, not the security boundary.
 */
const PROFILE_KEY = 'mizanova.profile.v1'

function readCachedProfile(userId: string): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Profile
    return parsed.id === userId ? parsed : null
  } catch {
    return null
  }
}

function writeCachedProfile(profile: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    // Storage blocked or full. The app still works online; offline it falls
    // back to the spinner, which is the behaviour before this existed.
  }
}

function clearCachedProfile(): void {
  try {
    localStorage.removeItem(PROFILE_KEY)
  } catch {
    /* nothing useful to do */
  }
}
export default function AuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [profileRow, setProfileRow] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // --- 1. Track the session -------------------------------------------------
  useEffect(() => {
    let active = true

    // getSession() reads the session Supabase persisted in localStorage, which
    // is what keeps you signed in across a page refresh.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // IMPORTANT: do not await other supabase calls inside this callback.
      // It runs while Supabase holds an internal lock, and calling back into
      // the client here can deadlock — the app hangs with no error at all.
      // We only set state; the profile is fetched by the effect below.
      setSession(next)
      setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // --- 2. Load the profile whenever the user changes ------------------------
  const userId = session?.user.id ?? null

  /*
   * THE QUERY CACHE BELONGS TO ONE PERSON, AND NOTHING WAS EMPTYING IT.
   *
   * signOut clears the cached profile and the roster — both were added because
   * "these laptops are shared between classrooms" — and left React Query's
   * cache untouched. It lives in memory, so it survives signing out and signing
   * in as somebody else in the same tab; only a page refresh discarded it. The
   * one existing `queryClient.clear()` is in ContextSwitcher, for changing
   * school, not for changing person.
   *
   * That is how a freshly invited account walked past the two-factor gate: the
   * enrolment answer cached against the PREVIOUS user was still being served,
   * so the new account looked enrolled until a refresh threw the cache away.
   * Every other query has the same shape of problem, and this is the one place
   * that can see the identity change.
   *
   * Only on a genuine change of person. A token refresh keeps the same id and
   * must not throw away a warm cache, and the very first run has nothing worth
   * discarding.
   */
  const queryClient = useQueryClient()
  const lastUserId = useRef<string | null>(null)

  useEffect(() => {
    const previous = lastUserId.current
    lastUserId.current = userId
    if (previous === null || previous === userId) return
    queryClient.clear()
  }, [userId, queryClient])

  const loadProfile = useCallback(
    async (id: string, stillWanted: () => boolean) => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, school_id, role, first_name, last_name, full_name, email, is_verified, avatar_path',
        )
        .eq('id', id)
        .single()

      if (!stillWanted()) return
      if (error) {
        // Two very different causes, and neither should blank the screen:
        // the signup trigger did not run (no profile row exists), or there
        // is simply no network. The cached profile below covers the second.
        console.error('Could not load profile:', error.message)
        return
      }
      setProfileRow(data as Profile)
      writeCachedProfile(data as Profile)
    },
    [],
  )

  useEffect(() => {
    if (!userId) return
    let active = true
    // loadProfile is async: it awaits the database before setting anything, so
    // this is an ordinary fetch-on-mount, not the synchronous state sync the
    // rule guards against. It fired only because extracting the shared function
    // made the setState reachable to static analysis — the previous inline
    // `.then()` did exactly the same thing and was invisible to it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProfile(userId, () => active)
    return () => {
      active = false
    }
  }, [userId, loadProfile])

  // --- 2b. Reload it when the tab comes back --------------------------------
  //
  // EVERY FIELD ON THIS ROW IS CHANGED BY SOMEBODY ELSE. Verification is done
  // by a Platform Admin, the school is assigned by an administrator, and the
  // role is granted deliberately in SQL. All of that happens in a different
  // browser, and the effect above only runs when the signed-in USER changes —
  // which it never does for somebody who leaves a tab open all day.
  //
  // So a teacher verified at eleven o'clock kept being told they were not
  // verified, with a banner saying to wait for Special Miles, who had already
  // acted. Nothing on screen suggested that signing out would fix it, because
  // nothing on screen was wrong in a way anyone could see.
  //
  // Refetching on focus is the cheapest correct answer: the moment somebody
  // comes back to the tab, they see the truth.
  useEffect(() => {
    if (!userId) return
    let active = true

    function refresh() {
      if (document.visibilityState !== 'visible') return
      void loadProfile(userId!, () => active)
    }

    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [userId, loadProfile])

  // Derived, not stored. Clearing profile state inside an effect would trigger
  // a second render pass every time the user changes; deriving it means the
  // stale profile of a signed-out user simply stops being visible. It also
  // closes a real gap: if two users sign in one after another, the previous
  // person's profile can never briefly leak into the new session.
  //
  // The cache is read here, in the derivation, rather than seeded into state by
  // an effect — that would be the set-state-in-effect pattern that has already
  // caught us three times. The freshly fetched row always wins; the cache only
  // answers while that request is in flight or has failed.
  const profile = useMemo<Profile | null>(() => {
    if (!userId) return null
    if (profileRow?.id === userId) return profileRow
    return readCachedProfile(userId)
  }, [userId, profileRow])

  // --- 2b. Does this session still owe a second factor? ---------------------
  //
  // Asked of Supabase rather than tracked ourselves. It compares the session's
  // current assurance level against the level the ACCOUNT requires, so an
  // authenticator enrolled on another device is picked up here without this
  // tab being told about it.
  //
  // Keyed by the access token on purpose: passing the second factor issues a
  // new token, which changes the key, which re-runs this. No manual
  // invalidation to forget.
  const aal = useQuery({
    queryKey: ['mfa-aal', session?.access_token ?? null],
    queryFn: getAssuranceLevel,
    enabled: Boolean(session),
    staleTime: Infinity,
    retry: false,
    // Both of these ask Supabase over the network, and React Query PAUSES a
    // query when the browser is offline — status stays 'pending' forever, so
    // anything waiting on them waits forever. That is exactly what happened:
    // offline, an educator sat on "Checking your sign-in…" indefinitely while
    // the home page loaded fine, because only the guarded routes wait on this.
    //
    // 'always' lets them run and fail fast, which turns a hang into an answer
    // of "unknown" that the code below can actually act on. Same trap as the
    // behaviour-log mutation, one level up — see [[D12]].
    networkMode: 'always',
  })

  // On error this resolves to false — it lets someone through rather than
  // locking everyone out over one failed call, including the parents who are
  // not required to have a second factor at all.
  //
  // That is only defensible because this is not the security boundary. Row
  // Level Security is, and it re-checks on every single request. The comment
  // at the top of ProtectedRoute says the same thing about roles.
  if (aal.isError) {
    console.error('Could not read the assurance level:', aal.error)
  }

  const mfaRequired: boolean | null = !session
    ? false
    : aal.isPending
      ? null
      : (aal.data?.challengeRequired ?? false)

  // Whether an authenticator exists at all. Shares its cache key with the
  // Security page, so enrolling there lifts the requirement here without
  // either component knowing about the other.
  const factors = useQuery({
    /*
     * KEYED ON THE PERSON, like `aal` above and for the same reason its comment
     * gives: a new session changes the key, so the answer re-runs rather than
     * being served from whoever was signed in before. This query had a constant
     * key and a 30-second staleTime, which is exactly long enough to carry one
     * account's enrolment status into the next account's session.
     */
    queryKey: ['mfa-factors', userId],
    queryFn: listTotpFactors,
    enabled: Boolean(session),
    staleTime: 30_000,
    retry: false,
    networkMode: 'always',
  })

  const mfaEnrolment: AuthValue['mfaEnrolment'] = !session
    ? 'none'
    : factors.isPending
      ? 'loading'
      : factors.isError
        ? // Offline, almost always. Reported as unknown rather than 'none',
          // which would march a properly enrolled teacher to the "set this up
          // to continue" screen the moment their wifi dropped — and there is
          // no way to enrol without a connection either, so it would be a
          // dead end.
          'unknown'
        : (factors.data ?? []).some((f) => f.verified)
          ? 'enrolled'
          : 'none'

  // --- 3. Actions -----------------------------------------------------------
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, details: SignUpDetails) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // This metadata is read by the handle_new_user trigger. It comes from
          // the browser, so the database treats it as a REQUEST, not a fact:
          // any role outside educator/parent/specialist becomes 'parent'.
          data: {
            first_name: details.firstName,
            last_name: details.lastName,
            role: details.role,
          },
        },
      })
      if (error) throw error

      // Whether a session came back is the only reliable way to tell whether
      // this project requires email confirmation — it is a dashboard setting
      // that can change without the code knowing. With confirmation on,
      // Supabase creates the user and withholds the session, so nothing
      // further happens until they click the link.
      return { needsEmailConfirmation: data.session === null }
    },
    [],
  )

  const signOut = useCallback(async () => {
    // Cleared FIRST, and unconditionally. If signOut throws — which offline it
    // will, since it calls the server — the cached name and role must not be
    // left behind on a machine the next teacher signs in to.
    clearCachedProfile()
    // The roster names children. It must not outlive the session on a laptop
    // the next teacher signs in to.
    clearRosterCache()
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    // No need to clear profile state: it is derived from the session, which
    // signOut has just emptied.
  }, [])

  /**
   * Send the "choose a new password" email.
   *
   * `redirectTo` must exactly match a URL allowed in Supabase → Authentication
   * → URL Configuration, or the link in the email refuses to open the app.
   * Built from window.location.origin so localhost and the deployed site both
   * work without a second environment variable to forget to change.
   */
  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }, [])

  /**
   * Applies to whoever the CURRENT session belongs to — which, after following
   * a recovery link, is the person who proved they can read that mailbox.
   * There is no "old password" argument because at that point they do not have
   * one to give.
   */
  const setNewPassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }, [])

  /**
   * Change the password, checking the current one first.
   *
   * Supabase's `updateUser` does not verify the old password, so this checks it
   * by attempting a sign-in with it — on a SEPARATE, THROWAWAY CLIENT.
   *
   * That detail is the whole trick. Calling signInWithPassword on the main
   * client would replace the live session, and a fresh session starts back at
   * aal1 — so anyone with two-factor authentication would be thrown into the
   * code prompt for changing their own password. This second client is
   * configured never to persist or refresh anything, so it validates the
   * password and disappears without touching the real session.
   */
  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const email = session?.user.email
      if (!email) throw new Error('You are not signed in.')

      const { createClient } = await import('@supabase/supabase-js')
      const checker = createClient(
        import.meta.env.VITE_SUPABASE_URL!,
        (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          import.meta.env.VITE_SUPABASE_ANON_KEY)!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )

      const { error: wrongPassword } = await checker.auth.signInWithPassword({
        email,
        password: currentPassword,
      })

      if (wrongPassword) {
        throw new Error(
          /invalid login credentials/i.test(wrongPassword.message)
            ? 'That is not your current password.'
            : wrongPassword.message,
        )
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
    },
    [session],
  )

  /**
   * Change the sign-in address, proving the current password first.
   *
   * THE SAME THREAT AS changePassword, AND A WORSE DOOR. Somebody at an
   * unattended signed-in laptop who can change the email owns the account
   * permanently: every future password reset goes to their inbox, and the real
   * owner cannot even start a recovery because the address they would type is
   * no longer on the account.
   *
   * The first version of the settings page called updateUser({ email }) with no
   * check at all, which made the careful password flow beside it pointless —
   * an attacker would simply take the easier door.
   *
   * Verified with a THROWAWAY client, exactly as above: signing in on the live
   * one would replace the session on a wrong guess and sign the person out of
   * the screen they are standing in front of.
   *
   * Supabase then mails the NEW address and changes nothing until that link is
   * opened. Worth also turning on "Secure email change" in the dashboard,
   * which additionally mails the OLD address — so a change made behind
   * somebody's back is at least visible to them.
   */
  const changeEmail = useCallback(
    async (currentPassword: string, newEmail: string) => {
      const email = session?.user.email
      if (!email) throw new Error('You are not signed in.')
      if (newEmail.trim().toLowerCase() === email.toLowerCase()) {
        throw new Error('That is already your email address.')
      }

      const { createClient } = await import('@supabase/supabase-js')
      const checker = createClient(
        import.meta.env.VITE_SUPABASE_URL!,
        (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          import.meta.env.VITE_SUPABASE_ANON_KEY)!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )

      const { error: wrongPassword } = await checker.auth.signInWithPassword({
        email,
        password: currentPassword,
      })

      if (wrongPassword) {
        throw new Error(
          /invalid login credentials/i.test(wrongPassword.message)
            ? 'That is not your current password.'
            : wrongPassword.message,
        )
      }

      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
      if (error) throw error
    },
    [session],
  )

  /*
   * `() => true` because this is asked for deliberately rather than fired by a
   * session change: the caller has just saved something and is waiting to see
   * it. The cancellation guard exists for the effect below, where a second
   * sign-in can overtake the first.
   */
  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId, () => true)
  }, [userId, loadProfile])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      profile,
      loading,
      mfaRequired,
      mfaEnrolment,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      setNewPassword,
      changePassword,
      changeEmail,
      refreshProfile,
    }),
    [
      session,
      profile,
      loading,
      mfaRequired,
      mfaEnrolment,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      setNewPassword,
      changePassword,
      changeEmail,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
