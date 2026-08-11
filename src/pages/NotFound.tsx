import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg p-10 text-center">
      <h1 className="text-3xl font-bold text-foreground">Page not found</h1>
      <p className="mt-2 text-muted-foreground">
        That address doesn’t match any screen in MiZanova.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
      >
        Go back
      </Link>
    </div>
  )
}
