import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  avatarUrl,
  closeMyAccount,
  exportMyData,
  fetchMyEnrolments,
  fetchMyPurchases,
  fetchMySelfRequests,
  queryKeys,
  removeMyAvatar,
  signOutOtherSessions,
  updateMyName,
  uploadMyAvatar,
} from '../../lib/api'
import { supabase } from '../../lib/supabase'
import ConfirmDestructive from '../../components/ConfirmDestructive'
import { showToast } from '../../lib/toast'
import { useAuth, type Profile as ProfileRow } from '../../lib/auth'
import { ROLE_CONFIG } from '../../lib/roles'
import Avatar from '../../components/Avatar'
import { ErrorState } from '../../components/QueryState'
import PushNotificationsSection from '../../components/PushNotificationsSection'
import SubscriptionSection from '../../components/SubscriptionSection'
import WhatWorksLink from '../../components/WhatWorksLink'
import NotBuiltYet from '../../components/NotBuiltYet'
import { MFA_REQUIRED_ROLES } from '../../lib/roles'

/**
 * The Account tab — who this account is, and the facts about it you cannot
 * change.
 *
 * ---------------------------------------------------------------------------
 * LAID OUT FROM THE FIGMA, "Account & Professional Profile"
 * ---------------------------------------------------------------------------
 * Two columns: what you can edit on the left, what the system knows about you
 * on the right as label/value rows. Status as pills with a tick rather than
 * coloured words. A summary block at the top of the details card carrying the
 * avatar, the name and the role, so the page says who you are before it asks
 * you to change anything.
 *
 * WHAT IS NOT COPIED, AND WHY. That design is a specialist's screen and most
 * of its fields have no column behind them here: professional registration
 * number, areas of specialisation, years of experience, languages, public bio,
 * and a credentials pipeline with four uploaded documents. Drawing those as
 * empty inputs would promise a profile this product does not keep.
 *
 * The right-hand column IS real, every row of it: role, where the data lives,
 * two-factor state, and when this session began. That was "Role & session
 * info" in the design and it is the part that could be built honestly.
 */

const MAX_BYTES = 2 * 1024 * 1024 // matches db/058's bucket limit
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']

/** A pill with a dot, per the study — not a coloured word. */
function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'good' | 'warn'
}) {
  const tones = {
    neutral: 'bg-primary-subtle text-primary',
    good: 'bg-success-subtle text-success-foreground',
    warn: 'bg-warning-subtle text-warning-foreground',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-btn px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

/** One label/value row in the right-hand column. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{children}</span>
    </div>
  )
}

/**
 * Closing an account — db/096, and only for an individual.
 *
 * ForIndividuals.tsx has promised "an account you can close" since the page
 * shipped, with nothing behind it. This is the thing behind it.
 *
 * WHY NO OTHER ROLE SEES THIS. An individual is the only one whose departure
 * harms nobody: no school holds their record, no child depends on their
 * guardianship, no roster loses a teacher. The server refuses the other roles
 * outright, so hiding the section is a courtesy rather than the control.
 *
 * THE CONSEQUENCES ARE COUNTED, NOT DESCRIBED. ConfirmDestructive asks for
 * "facts counted from the database, not adjectives", and the three queries
 * that produce them are the same ones the Academy, the suggestions screen and
 * the receipts list already run. Somebody about to delete two years of reading
 * should be told it is two years, not warned that this "cannot be undone".
 */
/**
 * Taking your record away — pairs with closing the account, deliberately.
 *
 * It sits immediately above the red box because that is the order somebody
 * actually needs these in: a person about to delete two years of their own
 * writing should be offered a copy of it in the same breath, not left to
 * discover afterwards that it is gone. Offering the export only on some other
 * screen would be technically complete and practically useless.
 */
function ExportSection() {
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const data = await exportMyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mizanova-my-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      // Revoked, or the blob stays in memory for the life of the tab.
      URL.revokeObjectURL(url)
      showToast('Downloaded.')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Could not build the file.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-10 rounded-card border border-border bg-card p-6 shadow-raised">
      <h2 className="text-lg font-bold text-foreground">Take your data</h2>
      <p className="mt-2 max-w-prose text-muted-foreground">
        Everything on this account in one file: what you have read, what you
        have paid, what you asked the AI and what it said, and every goal with
        its check-ins.
      </p>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        It is built in your browser from what your own account can see, so it
        contains exactly that and nothing else. The questions you asked appear
        as they were stored &mdash; with your name and contact details already
        removed, which is how they were sent.
      </p>
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="mt-4 rounded-btn border border-border bg-background px-4 py-2.5 font-semibold text-foreground disabled:opacity-50"
      >
        {busy ? 'Gathering…' : 'Download everything'}
      </button>
    </section>
  )
}

function CloseAccountSection() {
  const [password, setPassword] = useState('')
  const [confirming, setConfirming] = useState(false)

  const enrolments = useQuery({
    queryKey: queryKeys.myEnrolments,
    queryFn: fetchMyEnrolments,
  })
  const requests = useQuery({
    queryKey: queryKeys.mySelfRequests,
    queryFn: fetchMySelfRequests,
  })
  const purchases = useQuery({
    queryKey: queryKeys.myPurchases,
    queryFn: fetchMyPurchases,
  })

  const close = useMutation({
    mutationFn: () => closeMyAccount(password),
    onSuccess: async () => {
      /*
       * SIGN OUT RATHER THAN NAVIGATE. The account behind this session no
       * longer exists, so every query on the next screen would fail and the
       * app would look broken at the exact moment somebody wanted a clean
       * exit. Straight to the public homepage.
       */
      await supabase.auth.signOut()
      window.location.assign('/')
    },
  })

  const paid = (purchases.data ?? []).filter((p) => p.status === 'paid')
  const consequences = [
    `${enrolments.data?.length ?? 0} course${
      enrolments.data?.length === 1 ? '' : 's'
    } you have started, and everything you have marked done`,
    `${requests.data?.length ?? 0} saved suggestion${
      requests.data?.length === 1 ? '' : 's'
    }, and everything you wrote to get them`,
    'Your name, your email address and your sign-in',
  ]
  if (paid.length > 0) {
    consequences.push(
      `${paid.length} purchase${
        paid.length === 1 ? '' : 's'
      } will be KEPT as a record of payment, with your name removed from it`,
    )
  }

  return (
    <section className="mt-10 rounded-card border border-danger bg-card p-6 shadow-raised">
      <h2 className="text-lg font-bold text-foreground">Close your account</h2>
      <p className="mt-2 max-w-prose text-muted-foreground">
        This deletes your account and everything on it. It cannot be undone,
        and we cannot get any of it back for you afterwards.
      </p>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        {paid.length > 0 ? (
          <>
            One thing is kept: the record that you paid for{' '}
            {paid.length === 1 ? 'a course' : `${paid.length} courses`}. Special
            Miles has to be able to account for money it was paid. Your name is
            removed from it, so what remains is an amount and a date attached to
            nobody.
          </>
        ) : (
          <>
            You have paid for nothing, so nothing is kept. Special Miles keeps a
            note that an account closed &mdash; it is the only way they learn
            the product lost somebody &mdash; and that note does not say who.
          </>
        )}
      </p>

      <label
        htmlFor="close-password"
        className="mt-5 block font-semibold text-foreground"
      >
        Your password
      </label>
      <p className="mt-1 text-sm text-muted-foreground">
        Asked for the same reason it is asked before changing your email: a
        signed-in laptop somebody walked away from should not be one click from
        this.
      </p>
      <input
        id="close-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-2 w-full max-w-xs rounded-btn border border-input-border bg-background p-2.5 text-foreground"
      />

      <button
        type="button"
        disabled={!password}
        onClick={() => setConfirming(true)}
        className="mt-4 block rounded-btn bg-danger px-4 py-2.5 font-semibold text-danger-foreground disabled:opacity-50"
      >
        Close my account
      </button>

      {confirming && (
        <ConfirmDestructive
          title="Close your account for good?"
          detail="Everything below goes now. There is no undo and no grace period."
          consequences={consequences}
          confirmPhrase="close my account"
          confirmLabel="Close it"
          pending={close.isPending}
          error={close.error ? close.error.message : null}
          onConfirm={() => close.mutate()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  )
}

export default function Profile() {
  const { profile } = useAuth()
  if (!profile) return <ErrorState message="Your profile could not be read." />

  /*
   * KEYED ON THE ACCOUNT, so the form below seeds its fields from the profile
   * once, in useState, instead of copying them in with an effect. Syncing
   * props into state re-renders twice per change and would wipe half-typed
   * text whenever the session refreshed — which this provider does on window
   * focus. A key is React's own answer to "reset this when the subject
   * changes".
   */
  return <ProfileForm key={profile.id} profile={profile} />
}

/**
 * VERIFICATION IS NOT A FACT ABOUT EVERY ACCOUNT.
 *
 * db/013 gates staff behind `am_i_verified()`, and `can_staff_view_student`
 * reads `is_platform_admin() OR (am_i_verified() AND …)` — so a platform admin
 * short-circuits before verification is ever consulted, and a guardian is
 * exempt by design. Both were being shown "Awaiting verification", which
 * describes a queue neither will ever be in and nothing that will ever change.
 *
 * Shown only where being unverified actually stops you working.
 */
const VERIFIED_ROLES = ['educator', 'specialist', 'school_admin']

function ProfileForm({ profile }: { profile: ProfileRow }) {
  const { refreshProfile, session, mfaEnrolment, changeEmail } = useAuth()

  /*
   * SOME OF THIS SCREEN IS ADDRESSED TO SCHOOL STAFF AND SOME PEOPLE HERE HAVE
   * NO SCHOOL. An individual (db/088) has no colleagues, gets no invitations
   * and has never seen a classroom machine — three sentences below told them
   * otherwise, which reads as having wandered into somebody else's product on
   * the one screen that is meant to be about them.
   */
  const inASchool = profile !== null && profile.role !== 'individual'
  const fileRef = useRef<HTMLInputElement>(null)

  const [firstName, setFirstName] = useState(profile.first_name ?? '')
  const [lastName, setLastName] = useState(profile.last_name ?? '')
  const [email, setEmail] = useState(profile.email ?? '')
  const [emailPassword, setEmailPassword] = useState('')
  const [photoError, setPhotoError] = useState<string | null>(null)

  const verificationApplies = VERIFIED_ROLES.includes(profile.role)

  const photo = useQuery({
    queryKey: ['my-avatar', profile.avatar_path ?? 'none'],
    queryFn: () => avatarUrl(profile.avatar_path),
    enabled: !!profile.avatar_path,
  })

  const saveName = useMutation({
    mutationFn: () =>
      updateMyName({ firstName: firstName.trim(), lastName: lastName.trim() }),
    onSuccess: refreshProfile,
  })
  const upload = useMutation({
    mutationFn: (file: File) => uploadMyAvatar(file),
    onSuccess: refreshProfile,
  })
  const removePhoto = useMutation({
    mutationFn: removeMyAvatar,
    onSuccess: refreshProfile,
  })
  const emailChange = useMutation({
    mutationFn: () => changeEmail(emailPassword, email.trim()),
    onSuccess: () => setEmailPassword(''),
  })
  const signOutOthers = useMutation({ mutationFn: signOutOtherSessions })

  /*
   * CHECKED HERE AS WELL AS IN THE BUCKET, and that is not duplication. The
   * bucket refuses an oversized or wrong-typed file with a storage error that
   * reads like a fault in the app; this says what is wrong before anything is
   * uploaded, in words about the file just chosen.
   */
  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // so choosing the same file twice still fires
    if (!file) return
    if (!ACCEPTED.includes(file.type)) {
      setPhotoError('That has to be a PNG, JPEG or WebP image.')
      return
    }
    if (file.size > MAX_BYTES) {
      setPhotoError(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`,
      )
      return
    }
    setPhotoError(null)
    upload.mutate(file)
  }

  const nameChanged =
    firstName.trim() !== (profile.first_name ?? '') ||
    lastName.trim() !== (profile.last_name ?? '')
  const emailChanged = email.trim() !== (profile.email ?? '')
  const lastSignIn = session?.user.last_sign_in_at

  const field =
    'min-h-11 w-full rounded-btn border border-border px-3 text-foreground'
  const card = 'rounded-card border border-border bg-card shadow-raised p-6'

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* ================= LEFT: what you can change ====================== */}
      <div className="space-y-6">
        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">Your details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {inASchool
                  ? 'How you appear to colleagues and families on every screen.'
                  : 'Your name and picture, as they appear on your own screens.'}
              </p>
            </div>
            {/* The action sits in the card header, as the design has it —
                beside what it saves rather than at the bottom of a scroll. */}
            <button
              type="button"
              onClick={() => saveName.mutate()}
              disabled={!nameChanged || saveName.isPending}
              className="min-h-11 rounded-btn bg-primary px-4 font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
            >
              {saveName.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>

          {/* --- Summary block, from the design ---------------------------- */}
          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-card bg-background p-4">
            <Avatar
              id={profile.id}
              name={profile.full_name ?? ''}
              email={profile.email ?? ''}
              size="lg"
              photoUrl={photo.data ?? null}
            />
            <div className="min-w-0">
              <p className="font-bold text-foreground">
                {profile.full_name?.trim() || 'No name set'}
              </p>
              <p className="text-sm break-all text-muted-foreground">
                {profile.email}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Pill>{ROLE_CONFIG[profile.role].label}</Pill>
                {verificationApplies &&
                  (profile.is_verified ? (
                    <Pill tone="good">✓ Verified</Pill>
                  ) : (
                    <Pill tone="warn">Awaiting verification</Pill>
                  ))}
                {mfaEnrolment === 'enrolled' && <Pill tone="good">✓ 2FA on</Pill>}
                {/* REQUIRED OF FOUR ROLES, NOT OF EVERYONE. This warned anybody
                    without an authenticator, so a family — for whom two-factor
                    is deliberately optional, because locking them out of the
                    daily summary over a changed phone does more harm than the
                    risk it removes — was told their account was short of
                    something it is not. The Security screen two clicks away
                    says "Off · Set up an authenticator app" and offers it as a
                    choice, which is the accurate version.

                    No pill at all when it is optional and absent: "Two-factor:
                    Not set up" already appears in the details below, stated as
                    a fact rather than as a warning about nothing. */}
                {mfaEnrolment === 'none' &&
                  MFA_REQUIRED_ROLES.includes(profile.role) && (
                    <Pill tone="warn">2FA required</Pill>
                  )}
              </div>
            </div>

            <div className="ml-auto flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED.join(',')}
                onChange={onFileChosen}
                className="sr-only"
                aria-label="Choose a photo"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
                className="min-h-11 rounded-btn border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-background disabled:opacity-60"
              >
                {upload.isPending
                  ? 'Uploading…'
                  : profile.avatar_path
                    ? 'Replace photo'
                    : 'Upload photo'}
              </button>
              {profile.avatar_path && (
                <button
                  type="button"
                  onClick={() => removePhoto.mutate()}
                  disabled={removePhoto.isPending}
                  className="min-h-11 rounded-btn border border-border bg-card px-4 text-sm font-semibold text-danger-foreground hover:bg-danger-subtle disabled:opacity-60"
                >
                  {removePhoto.isPending ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {inASchool
              ? 'PNG, JPEG or WebP, up to 2 MB. Anyone signed in can see it, including families — that is what it is for.'
              : 'PNG, JPEG or WebP, up to 2 MB. Nobody shares this account, so this is for the corner of your own screen.'}
          </p>
          {(photoError || upload.isError || removePhoto.isError) && (
            <p role="alert" className="mt-2 text-sm font-medium text-danger-foreground">
              {photoError ?? upload.error?.message ?? removePhoto.error?.message}
            </p>
          )}

          {/* --- Name, two up, as the design has it ------------------------ */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">
                First name
              </span>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                className={field}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">
                Last name
              </span>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                className={field}
              />
            </label>
          </div>

          {saveName.isError && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger-foreground">
              {saveName.error.message}
            </p>
          )}
        </section>

        {/* --- Email, its own card because it behaves differently ---------- */}
        <section className={card}>
          <h2 className="text-lg font-bold text-foreground">Email address</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {inASchool
              ? 'What you sign in with, and where invitations and password resets go.'
              : 'What you sign in with, and where a password reset would be sent.'}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">
                New email address
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className={field}
              />
            </label>
            {/*
              THE PASSWORD IS THE POINT, not a formality. Whoever can change
              this address receives every future password reset — so without
              it, anybody at an unattended signed-in laptop owns the account
              permanently, and the careful password flow on the next tab is
              pointless because they would use this door instead.
            */}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">
                Your current password
              </span>
              <input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                autoComplete="current-password"
                className={field}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => emailChange.mutate()}
            disabled={!emailChanged || !emailPassword || emailChange.isPending}
            className="mt-4 min-h-11 rounded-btn bg-primary px-4 font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
          >
            {emailChange.isPending ? 'Sending…' : 'Change email'}
          </button>

          {/* THE SURPRISING PART, SAID BEFORE IT HAPPENS. Nothing changes when
              this is pressed — Supabase mails the new address and waits for the
              link. Without this sentence the form looks like it failed. */}
          <p className="mt-3 max-w-prose text-xs text-muted-foreground">
            Your password is checked first. Nothing changes until you open the
            link sent to the new address — until then you keep signing in with
            the old one.
          </p>

          {emailChange.isError && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger-foreground">
              {emailChange.error.message}
            </p>
          )}
          {emailChange.isSuccess && (
            <p className="mt-3 text-sm font-medium text-success-foreground">
              Check {email.trim()} for the confirmation link.
            </p>
          )}
        </section>
      </div>

      {/* ================= RIGHT: what you cannot change ================== */}
      <div className="space-y-6">
        <section className={card}>
          <h2 className="text-lg font-bold text-foreground">Role and session</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set by the platform, not by you.
          </p>

          <div className="mt-4">
            <Fact label="Active role">{ROLE_CONFIG[profile.role].label}</Fact>
            {verificationApplies && (
              <Fact label="Verified">
                {profile.is_verified ? (
                  <span className="text-success-foreground">✓ Yes</span>
                ) : (
                  <span className="text-warning-foreground">Not yet</span>
                )}
              </Fact>
            )}
            <Fact label="Two-factor">
              {mfaEnrolment === 'enrolled' ? (
                <span className="text-success-foreground">✓ Enabled</span>
              ) : mfaEnrolment === 'none' ? (
                <span className="text-warning-foreground">Not set up</span>
              ) : (
                /* 'unknown' is the offline case and says so rather than
                   guessing — see the note on mfaEnrolment in auth.ts. */
                <span className="text-muted-foreground">Unknown</span>
              )}
            </Fact>
            <Fact label="Data residency">Australia · Sydney</Fact>
            <Fact label="This session began">
              {lastSignIn
                ? new Date(lastSignIn).toLocaleString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </Fact>
          </div>
        </section>

        <section className={card}>
          <h2 className="text-lg font-bold text-foreground">Other devices</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ends every other signed-in session and leaves this one alone. Worth
            doing if you have left yourself signed in on a classroom machine —
            changing your password does not do this on its own.
          </p>
          <button
            type="button"
            onClick={() => signOutOthers.mutate()}
            disabled={signOutOthers.isPending}
            className="mt-4 min-h-11 rounded-btn border border-border px-4 font-semibold text-danger-foreground hover:bg-danger-subtle disabled:opacity-60"
          >
            {signOutOthers.isPending ? 'Signing out…' : 'Sign out everywhere else'}
          </button>
          {signOutOthers.isError && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger-foreground">
              {signOutOthers.error.message}
            </p>
          )}
          {signOutOthers.isSuccess && (
            <p className="mt-3 text-sm font-medium text-success-foreground">
              Every other session has been signed out.
            </p>
          )}
        </section>

        <PushNotificationsSection />

        <NotBuiltYet>
          <p>
            The design also shows clinical preferences, caseload settings and a
            per-user audit log. None of those have anything behind them, so they
            are absent rather than drawn as controls that would change nothing.
          </p>
          <p>
            {/* This paragraph used to end "MiZanova sends no notifications at
                all", which stopped being true with db/081. A note about what
                is missing has to be maintained as carefully as the features,
                or it becomes the most confident wrong sentence on the page. */}
            Notification switches were on that list until the section above
            them existed. What is still missing there is email: the server can
            send it, but nothing yet sends a digest of what is waiting.
          </p>
        </NotBuiltYet>

        {/* LAST ON THE PAGE, AND ONLY FOR THE ROLE THAT CAN USE IT. Every
            other role is refused by the server, so showing them a red box
            they cannot act on would be a dead control. */}
        {profile?.role === 'individual' && (
          <>
            {/* BEFORE take-your-data and close-your-account, deliberately.
                Those two are the exits; a subscription is something you have
                while you are still here, and putting billing after the door
                marked "delete everything" reads as an afterthought. */}
            <SubscriptionSection />
            {/* Beside the export rather than after it: both answer "something
                I can take away", and this is the one most people actually
                want — the export is a data-rights file, this is a document. */}
            <WhatWorksLink from="account" />
            <ExportSection />
            <CloseAccountSection />
          </>
        )}
      </div>
    </div>
  )
}
