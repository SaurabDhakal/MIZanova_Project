import { useState } from 'react'
import { showToast } from '../lib/toast'

/**
 * Opens a private file through a link that expires.
 *
 * WHY THIS IS NOT AN <a href>. Both buckets are private, so there is no lasting
 * address to put in an href. One has to be minted per click, and the database
 * only mints it if the storage policies would let this person read that object
 * — which means the link cannot be obtained by someone who should not have it,
 * and stops working shortly afterwards, so a forwarded one is not a lasting
 * hole.
 *
 * Shared by the resource library and the IEP register because it is one
 * behaviour, not two that look alike: ask for a URL, open it, say so plainly if
 * the answer is no.
 */
export default function SignedFileLink({
  path,
  getUrl,
  label = 'Open file',
}: {
  path: string
  getUrl: (path: string) => Promise<string>
  label?: string
}) {
  const [busy, setBusy] = useState(false)

  async function open() {
    setBusy(true)
    try {
      const url = await getUrl(path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'That file could not be opened. It may have been removed.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={busy}
      className="rounded-btn border border-border px-3 py-1.5 text-sm font-semibold text-primary disabled:opacity-60"
    >
      {busy ? 'Opening…' : label}
    </button>
  )
}
