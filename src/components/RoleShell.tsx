import AppShell from './AppShell'
import Spinner from './Spinner'
import { useAuth } from '../lib/auth'

/**
 * AppShell for a page that belongs to every role rather than one of them.
 *
 * The role sections each hard-code their own role into <AppShell role={…}>,
 * which is right for them — /educator is only ever an educator's. Account
 * pages are not: everybody has a password and everybody can have an
 * authenticator, and giving Security five URLs, one per role, would mean five
 * routes to keep in step for one screen.
 */
export default function RoleShell() {
  const { profile, loading } = useAuth()

  if (loading || !profile) return <Spinner label="Loading your account" />

  return <AppShell role={profile.role} />
}
