import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  avatarUrl,
  removeMyAvatar,
  signOutOtherSessions,
  updateMyName,
  uploadMyAvatar,
} from '../../lib/api'
import { useAuth, type Profile as ProfileRow } from '../../lib/auth'
import { ROLE_CONFIG } from '../../lib/roles'
import Avatar from '../../components/Avatar'
import { ErrorState } from '../../components/QueryState'
import PushNotificationsSection from '../../components/PushNotificationsSection'

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
                How you appear to colleagues and families on every screen.
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
                {mfaEnrolment === 'none' && <Pill tone="warn">2FA required</Pill>}
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
            PNG, JPEG or WebP, up to 2 MB. Anyone signed in can see it,
            including families — that is what it is for.
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
            What you sign in with, and where invitations and password resets go.
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

        <section className="rounded-card border border-border bg-background p-6">
          <h2 className="font-semibold text-foreground">Not built yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The design also shows clinical preferences, caseload settings and a
            per-user audit log. None of those have anything behind them, so they
            are absent rather than drawn as controls that would change nothing.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {/* This paragraph used to end "MiZanova sends no notifications at
                all", which stopped being true with db/081. A note about what
                is missing has to be maintained as carefully as the features,
                or it becomes the most confident wrong sentence on the page. */}
            Notification switches were on that list until the section above
            them existed. What is still missing there is email: the server can
            send it, but nothing yet sends a digest of what is waiting.
          </p>
        </section>
      </div>
    </div>
  )
}
