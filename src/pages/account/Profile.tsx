import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  avatarUrl,
  removeMyAvatar,
  updateMyName,
  uploadMyAvatar,
} from '../../lib/api'
import { useAuth, type Profile as ProfileRow } from '../../lib/auth'
import { authRedirect } from '../../lib/supabase'
import { ROLE_CONFIG } from '../../lib/roles'
import Avatar from '../../components/Avatar'
import { ErrorState } from '../../components/QueryState'
import PushNotificationsSection from '../../components/PushNotificationsSection'
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
  /*
   * STAFF, NOT "NOT AN INDIVIDUAL".
   *
   * This was `role !== 'individual'`, which made a parent and a student staff
   * — so a parent read that their photo is "how you appear to colleagues and
   * families", having no colleagues, and that their email is where invitations
   * go. Every parent account in the database carries `school_id` null, so they
   * are not in a school in any sense the rest of the product uses either.
   *
   * Three groups, because there are three answers: somebody who works at a
   * school, somebody whose child attends one, and somebody with no school at
   * all.
   */
  const isStaff =
    profile !== null &&
    ['educator', 'specialist', 'school_admin', 'platform_admin'].includes(
      profile.role,
    )
  const hasAChild = profile?.role === 'parent'
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
                {isStaff
                  ? 'How you appear to colleagues and families on every screen.'
                  : hasAChild
                    ? 'How you appear to the staff working with your child.'
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
            {isStaff
              ? 'PNG, JPEG or WebP, up to 2 MB. Anyone signed in can see it, including families — that is what it is for.'
              : hasAChild
                ? 'PNG, JPEG or WebP, up to 2 MB. Your child’s teachers and specialists can see it, and so can anyone else at home on this record.'
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
            {isStaff
              ? 'What you sign in with, and where invitations and password resets go.'
              : 'What you sign in with, and where a password reset would be sent.'}
          </p>

          {/*
            THE ARRIVAL, NOT THE DEPARTURE. This screen is where the link in
            the confirmation email lands, and until now landing here said
            nothing: the address in the field below had quietly become the new
            one, and the only way to find out was to sign out and guess which
            address still worked. Somebody did exactly that, and reasonably
            concluded the mail was broken.

            `message` is Supabase's own words, shown rather than rewritten,
            because it is the "one down, one to go" of a secure email change
            and only Supabase knows which half is outstanding. In this product
            an email change is the only two-sided flow that produces one, so
            reading it here is not as presumptuous as it looks.
          */}
          {(authRedirect.type === 'email_change' || authRedirect.message) && (
            <div
              role="status"
              className="mt-4 rounded-card border border-success bg-success-subtle p-5 text-sm text-success-foreground"
            >
              {authRedirect.message ? (
                <p className="font-medium">{authRedirect.message}</p>
              ) : (
                <>
                  <p className="font-medium">
                    Confirmed. Your email address is now {profile.email}.
                  </p>
                  <p className="mt-1">
                    That is what you sign in with from now on. Your password and
                    your authenticator app are unchanged — they belong to the
                    account, not to the address.
                  </p>
                </>
              )}
            </div>
          )}

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
          {/*
            SAYING BOTH INBOXES, because the alternative is a person who did
            everything right and watched nothing happen. This said only "check
            the new address for the confirmation link" — true when Supabase's
            "Secure email change" is off, and half the story when it is on:
            that setting mails the OLD address as well and moves nothing until
            BOTH links are opened. Opening one and finding the address
            unchanged is indistinguishable from a mail that never arrived.

            Named inboxes rather than "your old address" because the old one is
            about to stop being obvious, and this is the sentence somebody
            reads an hour later while hunting for the second mail.
          */}
          {emailChange.isSuccess && (
            <div className="mt-3 space-y-1 text-sm font-medium text-success-foreground">
              <p>A confirmation link is on its way to {email.trim()}.</p>
              <p className="font-normal">
                If one also arrives at {profile.email}, open that too — the
                address only moves once every link sent has been opened. Until
                then you keep signing in with {profile.email}.
              </p>
            </div>
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

        <PushNotificationsSection />

        {/* CLINICAL PREFERENCES AND CASELOADS ARE NOT AN INDIVIDUAL'S WORDS.
            The first paragraph is about a staff design, and it was shown to
            everybody — so somebody with no school and no caseload was told
            which staff features were missing from their own settings page.
            The paragraph below it is about notifications and is true for
            everyone, so only the first is narrowed. */}
        <NotBuiltYet>
          {profile?.role !== 'individual' && (
            <p>
              The design also shows clinical preferences, caseload settings and
              a per-user audit log. None of those have anything behind them, so
              they are absent rather than drawn as controls that would change
              nothing.
            </p>
          )}
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
        {/* The subscription, the summary document, the export and closing
            the account all used to sit here, making this nine sections deep
            and four unrelated questions long. They are now two tabs of their
            own: Payments, and Your data. What is left is who you are and how
            you sign in, which is what a page called Account should hold. */}
      </div>
    </div>
  )
}
