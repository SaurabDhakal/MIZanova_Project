import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth";
import { peekGuardianCode, peekInvitation } from "../../lib/api";
import { ROLE_CONFIG, pathForRole } from "../../lib/roles";
import FormField from "../../components/FormField";
import Spinner from "../../components/Spinner";
import AuthLayout from "./AuthLayout";

/**
 * Registration.
 *
 * THERE IS NO ROLE TO CHOOSE. Since db/044 `handle_new_user` makes everybody
 * who signs themselves up a parent, whatever the browser sends — staff arrive
 * by invitation, which is how a school says "this person works here" rather
 * than somebody saying it about themselves.
 *
 * That is enforced in the database rather than here, because the role travels
 * in metadata the browser writes and a shorter list on this page changes only
 * what an honest person can pick.
 *
 * THE RULE THIS PAGE ENFORCES: you do not create an account. An account is
 * created for you, by the thing that gives you a reason to have one.
 *
 *   ?invite=  a school invited this person. Address locked, role already
 *             decided, verification granted the moment they accept.
 *   ?code=    a family was given an access code. Address hinted from the code,
 *             child named, nothing to choose.
 *   neither   a SIGNPOST, not a form. Nothing is created — see below for why.
 */
export default function Signup() {
  const { signUp, session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  /**
   * AN INVITATION CHANGES WHAT THIS PAGE IS.
   *
   * Without one it is open registration: choose a role, wait to be verified.
   * With one, the school has already decided the address and the role, so
   * offering either as a choice is not a convenience — it is a way to end up
   * with an account the invitation can never attach to.
   *
   * That is exactly what happened: the accept page sent people here with no
   * token, they picked whatever they liked, and the invitation sat unused while
   * their new account sat unverified. Neither screen was wrong on its own.
   */
  const inviteToken = params.get("invite");

  /**
   * A guardian code does the same job for a family that an invitation does for
   * staff: it decides the address and the role, so neither is a choice.
   *
   * A person holding one is a guardian. Offering them Educator and Specialist
   * on the way in is not flexibility — it is three ways to make an account the
   * code cannot attach to.
   */
  const guardianCode = params.get("code");

  /**
   * db/088. Somebody who came to the website for themselves.
   *
   * The card at the bottom of the chooser used to say "ask your child's school
   * office for a code" to everybody who had neither an invitation nor a code —
   * which is the right answer for a parent and a dead end for an adult who is
   * themselves neurodivergent. Joe's brief names them as a customer segment and
   * they had nowhere to go.
   *
   * It is a query parameter rather than a picker on the form for the reason
   * db/044 gives: the role travels in metadata the browser writes, so the
   * database decides what may be claimed. `handle_new_user` accepts exactly
   * two self-selected roles and turns everything else into `parent`. This flag
   * changes which of those two is asked for, and can claim nothing else.
   */
  const asIndividual = params.get("as") === "individual";

  const invitation = useQuery({
    queryKey: ["invitation", inviteToken],
    queryFn: () => peekInvitation(inviteToken!),
    enabled: Boolean(inviteToken),
    retry: false,
  });

  const guardian = useQuery({
    queryKey: ["guardian-code", guardianCode],
    queryFn: () => peekGuardianCode(guardianCode!),
    enabled: Boolean(guardianCode),
    retry: false,
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [alreadyHasAccount, setAlreadyHasAccount] = useState(false);

  if (loading) return <Spinner label="Checking your session" />;
  if (inviteToken && invitation.isPending) {
    return <Spinner label="Checking your invitation" />;
  }
  if (guardianCode && guardian.isPending) {
    return <Spinner label="Checking your code" />;
  }
  if (session && profile) {
    // Already signed in — this page has nothing to add. Send them wherever the
    // thing they arrived holding is actually handled.
    return (
      <Navigate
        to={
          inviteToken
            ? `/invite/${inviteToken}`
            : guardianCode
              ? "/parent/link-child"
              : pathForRole(profile.role)
        }
        replace
      />
    );
  }

  // A dead code must not silently become an open signup form either.
  if (guardianCode && guardian.isError) {
    return (
      <AuthLayout title="That code does not work">
        <p
          role="alert"
          className="rounded-btn border border-danger bg-danger-subtle p-4 text-sm text-danger-foreground"
        >
          {guardian.error.message}
        </p>
        <Link
          to="/link"
          className="mt-6 block w-full rounded-btn bg-primary px-4 py-3 text-center font-semibold text-primary-foreground"
        >
          Try a different code
        </Link>
      </AuthLayout>
    );
  }

  // A dead or expired token must not silently become an open signup form.
  if (inviteToken && invitation.isError) {
    return (
      <AuthLayout title="That invitation link does not work">
        <p
          role="alert"
          className="rounded-btn border border-danger bg-danger-subtle p-4 text-sm text-danger-foreground"
        >
          {invitation.error.message}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Ask whoever invited you to send a new one. Invitations expire after 14
          days and can only be used once.
        </p>
        <Link
          to="/login"
          className="mt-6 block w-full rounded-btn border border-border px-4 py-3 text-center font-semibold text-foreground"
        >
          Go to sign in
        </Link>
      </AuthLayout>
    );
  }

  /**
   * NO INVITATION AND NO CODE MEANS NO ACCOUNT — a signpost instead of a form.
   *
   * THE RULE: you do not create an account. An account is created for you, by
   * the thing that gives you a reason to have one. An invitation makes a staff
   * account already attached to a school; a code makes a family account already
   * linked to a child; a purchase will make a customer account holding what was
   * bought. There is no fourth door where somebody simply appears.
   *
   * Before this, /signup served nobody. Staff who used it got a parent account
   * that could do nothing. A parent with a code should be at /link, which
   * creates the account WITH the code attached. A parent without one cannot be
   * helped by an account at all. Every person who arrived here had taken a
   * wrong turn, and the page rewarded them with a real row in the database that
   * was attached to nothing — the school could not find them, and nobody could
   * help them.
   *
   * The page still exists because people will still land on it. It just points
   * them somewhere that works instead of manufacturing a dead end.
   *
   * WHEN THE ACADEMY OPENS, buying a program becomes the fourth door and this
   * gains a fourth option. It does not go back to being an open form.
   */
  if (!inviteToken && !guardianCode && !asIndividual) {
    return (
      <AuthLayout title="Join MiZanova">
        <p className="text-sm text-muted-foreground">
          Accounts are created by an invitation from a school or a code for a
          child, so that everyone who has one is connected to something from the
          moment they arrive.
        </p>

        <div className="mt-5 rounded-btn border border-border bg-background p-4">
          <p className="font-semibold text-foreground">
            My child&rsquo;s school gave me a code
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            It looks like <span className="font-mono">K7QP-4M2X-9RTB</span>.
            Entering it sets up your account and links your child in one step.
          </p>
          <Link
            to="/link"
            className="mt-3 inline-block rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
          >
            Enter my code
          </Link>
        </div>

        <div className="mt-4 rounded-btn border border-border bg-background p-4">
          <p className="font-semibold text-foreground">
            My school invited me to work here
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Teachers, specialists and school staff are invited by their school.
            Open the link in that email — it already knows who you are and which
            school you belong to. There is nothing to fill in here.
          </p>
        </div>

        {/* THE PERSON THE OTHER THREE CARDS WOULD HAVE INSULTED.
            "Get started" on the landing and pricing pages is aimed at a
            principal, and it lands here. Without this card the closest thing to
            an answer is "ask your child's school office", which is addressed to
            a parent — the same wrong turn this page was built to stop, one
            level up. A school cannot set itself up: creating a school account
            means creating the thing every other account hangs off, so Special
            Miles does it. */}
        <div className="mt-4 rounded-btn border border-border bg-background p-4">
          <p className="font-semibold text-foreground">
            I want MiZanova for my school
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Special Miles sets your school up and creates the first
            administrator account. From there your school invites its own staff
            and families. Have a look at what is included, and get in touch.
          </p>
          <Link
            to="/pricing"
            className="mt-3 inline-block rounded-btn border border-border px-4 py-2.5 font-semibold text-foreground"
          >
            See plans
          </Link>
        </div>

        {/* THIS CARD USED TO BE THE DEAD END. It said "ask your child's
            school office", which assumes a child and a school — and the person
            reading it may have neither. An adult working on this for
            themselves is a customer segment in the brief, and the product had
            no door for them. */}
        <div className="mt-4 rounded-btn border border-border bg-background p-4">
          <p className="font-semibold text-foreground">
            I am here for myself
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            No school, no code, nobody else involved. You get the Academy and
            the Library &mdash; short courses and reading you work through at
            your own pace. Nothing you do is reported to a school, because there
            is no school.
          </p>
          <Link
            to="/signup?as=individual"
            className="mt-3 inline-block rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
          >
            Create my account
          </Link>
        </div>

        <div className="mt-4 rounded-btn border border-border bg-background p-4">
          <p className="font-semibold text-foreground">
            I have none of these and none of them fit
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            If you are a parent of a child at a school that uses MiZanova, ask
            the office for a code &mdash; only they can issue one, and that is
            what keeps a child&rsquo;s record reachable by the right people.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  const invited = invitation.data ?? null;
  const linking = guardian.data ?? null;

  /**
   * The address the school put in the link they sent.
   *
   * IT IS NOT TRUSTED BECAUSE IT IS IN THE URL. Anybody can edit a query
   * string, and filling in an address the code was not issued to would send a
   * parent through a whole signup only to be refused at the last step.
   *
   * So it is checked first: masked the same way the database masks it, and
   * compared to the hint the code itself returned. Match, and it is filled in
   * and locked. No match, and the field is empty and editable, exactly as if
   * the link had carried no address at all.
   */
  const claimedEmail = params.get("email");

  function maskLikeTheDatabase(address: string): string {
    const [local, domain] = address.split("@");
    if (!domain) return address;
    return `${local.slice(0, 2)}***@${domain}`;
  }

  const verifiedGuardianEmail =
    linking && claimedEmail &&
    maskLikeTheDatabase(claimedEmail.trim().toLowerCase()) ===
      linking.emailHint.toLowerCase()
      ? claimedEmail.trim().toLowerCase()
      : null;

  /**
   * An invitation gives the exact address, so it is filled in and locked. A
   * guardian code gives only a masked one, so the link above is what makes
   * filling it in possible — and when that is absent the parent types it and
   * the hint tells them which of theirs to use.
   */
  const lockedEmail = invited?.email ?? verifiedGuardianEmail;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Please use a password of at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const { needsEmailConfirmation } = await signUp(
        (lockedEmail ?? email).trim(),
        password,
        {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          /* One of the two roles db/089 will accept. Anything else it turns
             into 'parent', and for an invitation or a code the real role is
             set on redemption regardless of what is sent here. */
          role: asIndividual ? "individual" : "parent",
        },
      );

      // Straight to whichever page finishes the job. Signing up produces a
      // session a moment later, and racing it caused nothing but trouble; both
      // destinations already know how to greet somebody who has just arrived.
      if (!needsEmailConfirmation && inviteToken) {
        navigate(`/invite/${inviteToken}`, { replace: true });
        return;
      }
      if (!needsEmailConfirmation && guardianCode) {
        // Back to /link, which now checks the code on arrival rather than
        // showing the box again — that reappearing box read as a failure.
        navigate(`/link?code=${encodeURIComponent(guardianCode)}`, {
          replace: true,
        });
        return;
      }

      // With confirmation OFF, Supabase signs them straight in and the
      // redirect at the top of this component takes over.
      //
      // With it ON, the account is created and no session is returned — so
      // nothing happens at all unless we say so. This page previously assumed
      // the first case, which meant flipping one Supabase dashboard setting
      // turned "Create account" into a button that appeared to do nothing.
      if (needsEmailConfirmation) setConfirmSent(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";

      /**
       * "User already registered" IS NOT AN ERROR HERE, IT IS A WRONG TURN.
       *
       * Somebody already has an account with this address — because they are
       * staff at the school AND a parent of a child there, or because they
       * started this once before. Supabase's own words end the journey; what
       * they need is the sign-in page and a way back to the thing they were
       * accepting.
       *
       * Same shape as the invitation bug: both screens were correct and the
       * join between them was the defect.
       */
      if (/already registered|already exists/i.test(message)) {
        setAlreadyHasAccount(true);
        setSubmitting(false);
        return;
      }

      setError(
        /invalid/i.test(message) && /email/i.test(message)
          ? "That address cannot receive email. Check the spelling — a made-up domain will always be refused."
          : message,
      );
      setSubmitting(false);
    }
  }

  if (alreadyHasAccount) {
    // Where they should end up after signing in: the thing they were part-way
    // through accepting, not a dashboard that has forgotten about it.
    const back = inviteToken
      ? `/invite/${inviteToken}`
      : guardianCode
        ? `/link?code=${encodeURIComponent(guardianCode)}`
        : "/";

    return (
      <AuthLayout title="You already have an account">
        <div className="rounded-btn border border-border bg-background p-4 text-sm">
          <p className="text-foreground">
            There is already an account for{" "}
            <strong className="font-semibold">
              {(lockedEmail ?? email).trim()}
            </strong>
            .
          </p>
          <p className="mt-2 text-muted-foreground">
            {linking
              ? `Sign in with it and you can link ${linking.childName} to the account you already have. You do not need a second one — the same account can be a parent and a member of staff.`
              : "Sign in with it and you can accept this invitation on the account you already have."}
          </p>
        </div>

        <Link
          to={`/login?next=${encodeURIComponent(back)}`}
          className="mt-6 block w-full rounded-btn bg-primary px-4 py-3 text-center font-semibold text-primary-foreground"
        >
          Sign in and continue
        </Link>
        <Link
          to="/forgot-password"
          className="mt-3 block w-full rounded-btn border border-border px-4 py-3 text-center font-semibold text-foreground"
        >
          I have forgotten my password
        </Link>
      </AuthLayout>
    );
  }

  if (confirmSent) {
    return (
      <AuthLayout title="Confirm your email">
        <div
          role="status"
          className="rounded-btn border border-success bg-success-subtle p-4 text-sm text-success-foreground"
        >
          <p className="font-semibold">
            Your account is created. We have emailed{" "}
            {(lockedEmail ?? email).trim()} a link to confirm it.
          </p>
          <p className="mt-2">
            You cannot sign in until you have clicked it. Check your junk folder
            if it has not arrived in a few minutes.
          </p>
          {inviteToken && (
            <p className="mt-2 font-semibold">
              Once you have confirmed it, open your invitation link again to
              join {invited?.schoolName}.
            </p>
          )}
          {guardianCode && (
            <p className="mt-2 font-semibold">
              Once you have confirmed it, sign in and enter your code again to
              link {linking?.childName}.
            </p>
          )}
        </div>

        <Link
          to="/login"
          className="mt-6 block w-full rounded-btn bg-primary px-4 py-3 text-center font-semibold text-primary-foreground"
        >
          Go to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={
        invited
          ? `Join ${invited.schoolName}`
          : linking
            ? `Set up your account for ${linking.childName}`
            : "Create your account"
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-btn border border-danger bg-danger-subtle p-3 text-sm font-medium text-danger-foreground"
          >
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="First name"
            name="firstName"
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <FormField
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>

        {/* READ-ONLY WHEN INVITED, because the invitation can only be redeemed
            by this address. Letting it be edited produces an account that
            cannot accept the very invitation that created it — which is the
            dead end this whole branch exists to close. */}
        <FormField
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          required
          readOnly={Boolean(lockedEmail)}
          hint={
            verifiedGuardianEmail
              ? "This is the address the school holds for you, so your account uses it."
              : lockedEmail
                ? "Your invitation was sent to this address, so your account has to use it."
                : linking
                  ? `The school sent your code to ${linking.emailHint} — use that address.`
                  : undefined
          }
          value={lockedEmail ?? email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <FormField
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* NO ROLE CHOICE WHEN INVITED. The school already decided, and
            redeem_invitation takes the role from the invitation row regardless
            of anything sent from here — so offering a choice would be a control
            that does nothing, which is worse than no control. */}
        {invited ? (
          <div className="rounded-btn border border-primary bg-primary-subtle p-4 text-sm">
            <p className="font-semibold text-foreground">
              {invited.schoolName} invited you as a{" "}
              {ROLE_CONFIG[invited.role].label}
            </p>
            <p className="mt-1 text-muted-foreground">
              {ROLE_CONFIG[invited.role].summary}
            </p>
            <p className="mt-2 text-muted-foreground">
              You will not have to wait to be verified — the invitation is the
              verification.
            </p>
          </div>
        ) : linking ? (
          <div className="rounded-btn border border-primary bg-primary-subtle p-4 text-sm">
            <p className="font-semibold text-foreground">
              You are setting up a family account for {linking.childName}
            </p>
            <p className="mt-1 text-muted-foreground">
              {linking.schoolName} will share {linking.childName}&rsquo;s
              progress, goals and daily updates with you here. You choose what
              the AI may be used for, and you can change that at any time.
            </p>
          </div>
        ) : null}

        {/* SAYS WHO ACTUALLY DOES IT. This read "verified by a school
            administrator", and `set_staff_verified` in db/012 refuses anyone
            who is not a Platform Admin — so a new teacher was being sent to
            chase their school office, which could not help and would not know
            why. Naming the wrong party is worse than naming none. */}
        {!invited && !linking && (
          <p className="rounded-btn bg-background p-3 text-sm text-muted-foreground">
            Educators, specialists and school administrators are verified by
            Special Miles before they can open any student record. You can sign
            in straight away; those screens stay empty until then.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
        >
          {submitting
            ? "Creating account…"
            : invited || linking
              ? "Create account and continue"
              : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          to="/login"
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
