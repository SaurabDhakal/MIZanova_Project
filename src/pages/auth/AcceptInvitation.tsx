import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { acceptInvitation, peekInvitation } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import {
  article,
  MFA_REQUIRED_ROLES,
  ROLE_CONFIG,
  pathForRole,
} from '../../lib/roles'
import Spinner from '../../components/Spinner'
import AuthLayout from './AuthLayout'

/**
 * Accepting an invitation — db/035.
 *
 * PUBLIC ON PURPOSE. The person opening this link has no account yet, so it
 * cannot sit behind a signed-in guard. What it shows before sign-in is
 * deliberately thin — the school's name, the role, and the address it was sent
 * to — because anything more would let a guessed link reveal something about a
 * school's staff.
 *
 * The three states this handles are the three that actually happen: not signed
 * in, signed in as the invited person, and signed in as somebody else. The
 * third is the one that would otherwise produce a baffling refusal, so it gets
 * a real explanation rather than an error toast.
 */
export default function AcceptInvitation() {
  const { token = '' } = useParams()
  const { session, profile, loading, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [done, setDone] = useState(false)

  const invitation = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => peekInvitation(token),
    retry: false,
  })

  const accept = useMutation({
    mutationFn: () => acceptInvitation(token),
    /*
     * THE ROLE JUST CHANGED ON THE SERVER AND NOTHING TOLD THE BROWSER.
     *
     * This set `done` and no more. The server promotes the account — db/044
     * gives every self sign-up the role `parent`, and the invitation is what
     * makes them an educator, a specialist, a school administrator or a
     * student — but AuthProvider only refetches the profile when the USER
     * changes, and the user did not change. So `profile.role` stayed `parent`,
     * and ProtectedRoute sent them to pathForRole('parent'): the family home
     * screen, asking a newly invited teacher to enter a code for a child.
     *
     * Every invited account landed there. It looked like the invitation had
     * failed, and it had not — only the browser was a step behind.
     *
     * Awaited BEFORE `done`, so the button on the next screen navigates with
     * the new role already in hand rather than racing it.
     */
    onSuccess: async () => {
      /* Guarded, because the invitation IS accepted by this point — the server
         has already changed the role. Letting a failed refresh stop `done`
         would leave somebody staring at a Join button for something that has
         already worked, with `accept.isError` false and nothing to explain it.
         A refresh that fails here is corrected by the focus refetch anyway. */
      try {
        await refreshProfile()
      } catch {
        /* nothing useful to do — the next focus corrects it */
      }
      setDone(true)
    },
  })

  if (loading || invitation.isPending) {
    return <Spinner label="Checking your invitation" />
  }

  if (invitation.isError) {
    return (
      <AuthLayout title="That link does not work">
        <p
          role="alert"
          className="rounded-btn border border-danger bg-danger-subtle p-4 text-sm text-danger-foreground"
        >
          {invitation.error.message}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Invitations expire after 14 days and can only be used once. Ask
          whoever invited you to send a new one.
        </p>

        {/* THE PERSON WHO JUST USED THE LINK SEES THIS TOO, AND IT FRIGHTENED
            THEM. An accepted invitation is consumed, so opening the link again
            — a back button, a refresh, the email still sitting there — returns
            exactly the same refusal as a forged token. The server does that on
            purpose and should keep doing it: answering "already used"
            differently from "never existed" tells a stranger which tokens are
            real.

            But it can say something about the READER without saying anything
            about the token. Somebody signed in with a role already has the
            account the invitation was for; the refusal is about the link, not
            about them, and a dead end offering only "Go to sign in" to a person
            who is signed in is the part that was wrong. */}
        {session && profile ? (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              You are signed in as{' '}
              <strong className="font-semibold text-foreground">
                {profile.first_name} {profile.last_name}
              </strong>
              , {article(ROLE_CONFIG[profile.role].label)}{' '}
              {ROLE_CONFIG[profile.role].label.toLowerCase()}. If you have
              already used this link, nothing is wrong — your account is ready.
            </p>
            <button
              type="button"
              onClick={() => navigate(pathForRole(profile.role), { replace: true })}
              className="mt-6 block w-full rounded-btn bg-primary px-4 py-3 text-center font-semibold text-primary-foreground"
            >
              Go to {ROLE_CONFIG[profile.role].label}
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="mt-6 block w-full rounded-btn border border-border px-4 py-3 text-center font-semibold text-foreground"
          >
            Go to sign in
          </Link>
        )}
      </AuthLayout>
    )
  }

  const { schoolName, role, email } = invitation.data

  if (done) {
    return (
      <AuthLayout title="You are in">
        <div
          role="status"
          className="rounded-btn border border-success bg-success-subtle p-4 text-sm text-success-foreground"
        >
          <p className="font-semibold">
            Your account is now linked to {schoolName}.
          </p>
          <p className="mt-2">
            You are {article(ROLE_CONFIG[role].label)}{' '}
            {ROLE_CONFIG[role].label.toLowerCase()} there, and already
            verified — {schoolName} confirmed that when they invited you, so
            there is nothing to wait for.
          </p>
        </div>

        {/* WHAT HAPPENS NEXT, SAID BEFORE IT HAPPENS. Four roles can open
            records about identifiable children, and ProtectedRoute sends them
            to Settings → Security & 2FA to enrol before anything else opens.
            That is correct and it is explained once they arrive — but a button
            promising a dashboard, followed by a settings screen, reads as the
            product going wrong at the exact moment somebody is deciding
            whether to trust it. A student or a family goes straight through
            and is told nothing extra. */}
        {MFA_REQUIRED_ROLES.includes(role) && (
          <p className="mt-4 rounded-btn bg-background p-3 text-sm text-muted-foreground">
            One thing first: your role can open records about identifiable
            children, so MiZanova will ask you to set up two-factor
            authentication before the rest of it opens. It takes about a minute
            and you will need your phone.
          </p>
        )}

        <button
          type="button"
          onClick={() => navigate(pathForRole(role), { replace: true })}
          className="mt-6 w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground"
        >
          {MFA_REQUIRED_ROLES.includes(role)
            ? 'Set up two-factor and continue'
            : 'Go to your dashboard'}
        </button>
      </AuthLayout>
    )
  }

  // --- Not signed in --------------------------------------------------------
  if (!session) {
    return (
      <AuthLayout title={`${schoolName} has invited you`}>
        <div className="rounded-btn border border-border bg-background p-4 text-sm">
          <p className="text-foreground">
            You have been invited to join{' '}
            <strong className="font-semibold">{schoolName}</strong> as{' '}
            {article(ROLE_CONFIG[role].label)}{' '}
            <strong className="font-semibold">{ROLE_CONFIG[role].label}</strong>.
          </p>
          <p className="mt-2 text-muted-foreground">
            The invitation was sent to <strong>{email}</strong>. Create your
            account with that address, then open this link again.
          </p>
        </div>

        {/* THE TOKEN TRAVELS WITH THEM. Sending people to a bare /signup lost
            the invitation entirely: they chose their own role and address,
            ended up unverified and unattached, and the invitation sat unused.
            Both screens were individually correct and the join between them
            was the defect. */}
        <Link
          to={`/signup?invite=${encodeURIComponent(token)}`}
          className="mt-6 block w-full rounded-btn bg-primary px-4 py-3 text-center font-semibold text-primary-foreground"
        >
          Create my account
        </Link>
        <Link
          to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
          className="mt-3 block w-full rounded-btn border border-border px-4 py-3 text-center font-semibold text-foreground"
        >
          I already have one
        </Link>
      </AuthLayout>
    )
  }

  // --- Signed in as somebody else ------------------------------------------
  // Worth a real explanation. The refusal is correct, and completely opaque if
  // all it says is "forbidden".
  const signedInAs = (session.user.email ?? '').toLowerCase()
  if (signedInAs !== email.toLowerCase()) {
    return (
      <AuthLayout title="Signed in with a different address">
        <div
          role="alert"
          className="rounded-btn border border-warning bg-warning-subtle p-4 text-sm text-warning-foreground"
        >
          <p>
            This invitation was sent to <strong>{email}</strong>, and you are
            signed in as <strong>{signedInAs}</strong>.
          </p>
          <p className="mt-2">
            An invitation only works for the address it was sent to — that is
            what stops a forwarded email handing out a staff account. Sign in
            with {email}, or ask {schoolName} to invite the address you are
            using.
          </p>
        </div>

        <Link
          to="/login"
          className="mt-6 block w-full rounded-btn bg-primary px-4 py-3 text-center font-semibold text-primary-foreground"
        >
          Sign in as somebody else
        </Link>
      </AuthLayout>
    )
  }

  // --- Signed in as the right person ---------------------------------------
  return (
    <AuthLayout title={`Join ${schoolName}`}>
      {accept.isError && (
        <p
          role="alert"
          className="mb-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
        >
          {accept.error.message}
        </p>
      )}

      <div className="rounded-btn border border-border bg-background p-4 text-sm">
        <p className="text-foreground">
          <strong className="font-semibold">{schoolName}</strong> has invited you
          to join as {article(ROLE_CONFIG[role].label)}{' '}
          <strong className="font-semibold">{ROLE_CONFIG[role].label}</strong>.
        </p>
        <p className="mt-2 text-muted-foreground">
          {ROLE_CONFIG[role].summary}
        </p>
        {profile && profile.role !== role && (
          <p className="mt-2 text-muted-foreground">
            Your account is currently {article(ROLE_CONFIG[profile.role].label)}{' '}
            {ROLE_CONFIG[profile.role].label} — that
            will change to {ROLE_CONFIG[role].label}.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => accept.mutate()}
        disabled={accept.isPending}
        className="mt-6 w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
      >
        {accept.isPending ? 'Joining…' : `Join ${schoolName}`}
      </button>
    </AuthLayout>
  )
}
