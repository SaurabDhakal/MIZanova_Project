import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { pathForRole } from '../lib/roles'
import Spinner from './Spinner'
import Landing from '../pages/Landing'

/**
 * What sits at "/".
 *
 * Not signed in → the public homepage. Signed in → whichever dashboard your
 * DATABASE role says, not a menu of choices. This replaces the temporary
 * DevRolePicker: a user picking their own role was a development scaffold and
 * would be a catastrophe in a real product.
 *
 * The homepage is RENDERED here rather than redirected to, so "/" stays "/".
 * Bouncing a first-time visitor to /login was also wrong on its own terms:
 * someone who has never heard of MiZanova was being asked for a password
 * before being told what the product is.
 */
export default function RoleRedirect() {
  const { session, profile, loading } = useAuth()

  if (loading) return <Spinner label="Checking your session" />
  if (!session) return <Landing />
  if (!profile) return <Spinner label="Loading your profile" />

  return <Navigate to={pathForRole(profile.role)} replace />
}
