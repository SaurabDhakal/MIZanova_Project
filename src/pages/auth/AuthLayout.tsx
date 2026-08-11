import { Link } from 'react-router-dom'
import Logo from '../../components/Logo'

/**
 * The frame shared by every signed-out screen: brand bar, centred card, footer.
 *
 * Extracted when the password-reset pages arrived and there were suddenly four
 * copies of the same markup. Worth doing for more than tidiness — the footer
 * carries the Australian-hosting statement, and four hand-maintained copies is
 * how one of them ends up saying something different.
 */
export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card px-6 py-4">
        <Link to="/" aria-label="MiZanova home">
          <Logo />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-card border border-border bg-card shadow-raised p-8">
          <h1 className="text-center text-3xl font-bold text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-center text-muted-foreground">{subtitle}</p>
          )}
          <div className="mt-8">{children}</div>
        </div>
      </main>

      <footer className="px-6 py-4 text-center text-xs text-muted-foreground">
        © 2026 MiZanova · Special Miles · Data hosted in Australia
      </footer>
    </div>
  )
}
