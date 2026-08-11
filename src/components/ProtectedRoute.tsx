import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { MFA_REQUIRED_ROLES, pathForRole, type Role } from '../lib/roles'
import Spinner from './Spinner'

/**
 * Wraps a route so only the right people reach it.
 *
 * Four refusals, in order:
 *   1. Not signed in            → the login page, remembering where you wanted
 *                                 to go so we can return you after signing in.
 *   2. Password but no second   → the code prompt. Checked HERE rather than on
 *      factor yet                the login page because a half-authenticated
 *                                session is persisted like any other: it
 *                                survives a refresh and a new tab, and would
 *                                otherwise walk straight past.
 *   3. Signed in, wrong role    → your own dashboard, not an error page. A
 *                                 parent typing /platform-admin is far more
 *                                 likely confused than malicious.
 *   4. Signed in, no profile    → an explanation rather than a blank screen.
 *
 * This is CONVENIENCE, not security. It runs in the browser, where anyone can
 * edit it. The actual protection is Row-Level Security: even if someone forced
 * their way onto this page, every query it makes returns nothing. Never let a
 * check like this be the only thing standing between a user and data.
 */
/** The one protected page a staff member without an authenticator may open. */
const SECURITY_PATH = '/account/security'

export default function ProtectedRoute({
  allow,
  children,
}: {
  allow: Role[]
  children: React.ReactNode
}) {
  const { session, profile, loading, mfaRequired, mfaEnrolment } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner label="Checking your session" />

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // null means "not known yet". Waiting is the safe reading — treating it as
  // "not required" would let someone through for the moment before the answer
  // arrives, which is the whole window an attacker with a password needs.
  if (mfaRequired === null) return <Spinner label="Checking your sign-in" />

  if (mfaRequired) {
    return (
      <Navigate to="/verify-2fa" replace state={{ from: location.pathname }} />
    )
  }

  // Session exists but the profile row has not arrived yet.
  if (!profile) return <Spinner label="Loading your profile" />

  if (!allow.includes(profile.role)) {
    return <Navigate to={pathForRole(profile.role)} replace />
  }

  // Staff must have an authenticator. Everyone here can open records about
  // identifiable children, so a stolen password must not be enough on its own.
  //
  // They are sent to the Security page rather than shown a wall, and that page
  // is deliberately exempt from this check — redirecting it to itself is an
  // infinite loop, and the only way out of this state is the enrolment form
  // that lives there. Sign out still works from the header throughout.
  if (mfaEnrolment === 'loading') {
    return <Spinner label="Checking your sign-in" />
  }

  // Only 'none' blocks. 'unknown' means we could not ask — offline, in
  // practice — and blocking then would be both wrong and a dead end: the
  // person is already signed in, and enrolling needs a connection they do not
  // have. RLS still refuses their data regardless of what this decides.
  const mustEnrol =
    MFA_REQUIRED_ROLES.includes(profile.role) && mfaEnrolment === 'none'

  if (mustEnrol && location.pathname !== SECURITY_PATH) {
    return <Navigate to={SECURITY_PATH} replace />
  }

  return <>{children}</>
}
