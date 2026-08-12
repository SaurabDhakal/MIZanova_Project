import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { redeemGuardianCode } from '../../lib/api'
import { useMyChildren } from '../../hooks/useMyChildren'

/**
 * Link a child — db/037, replacing `Link Your Children Page.jpg`.
 *
 * THE DESIGN ASKED FOR A STUDENT ID. It cannot: `external_ref` is a short
 * number the school displays on screen and prints on things children carry
 * home, and six digits is a million guesses. A student ID identifies a child;
 * it must never authorise anything.
 *
 * What this takes instead is a code the school issues to a named person at a
 * named address, which works once and only for that address.
 *
 * NO SEARCH, NO SUGGESTIONS, NO "did you mean". Every helpful touch here is a
 * way to confirm a guess, and the thing being guessed at is a child's record.
 */
export default function LinkChild() {
  const [code, setCode] = useState('')
  const [linked, setLinked] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { children } = useMyChildren()

  const redeem = useMutation({
    mutationFn: () => redeemGuardianCode(code),
    onSuccess: (result) => {
      setLinked(result.childName)
      setCode('')
      void queryClient.invalidateQueries()
    },
  })

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Link a child</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Your child&rsquo;s school gives you a code. Enter it once here and
          their updates appear in your account.
        </p>
      </header>

      {linked && (
        <div
          role="status"
          className="mb-6 rounded-card border border-success bg-success-subtle p-5"
        >
          <p className="font-semibold text-success-foreground">
            You are now linked to {linked}.
          </p>
          <p className="mt-1 text-sm text-success-foreground">
            Their progress, goals and anything the school shares will appear
            across your account from now on.
          </p>
        </div>
      )}

      {children.length > 0 && (
        <div className="mb-6 rounded-card border border-border bg-card shadow-raised p-4">
          <p className="text-sm font-semibold text-foreground">
            Already linked
          </p>
          <ul className="mt-1 text-sm text-muted-foreground">
            {children.map((child) => (
              <li key={child.id}>{child.display_name}</li>
            ))}
          </ul>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          redeem.mutate()
        }}
        className="max-w-lg rounded-card border border-border bg-card shadow-raised p-6"
        noValidate
      >
        {redeem.isError && (
          <p
            role="alert"
            className="mb-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
          >
            {redeem.error.message}
          </p>
        )}

        <label
          htmlFor="access-code"
          className="block text-sm font-semibold text-foreground"
        >
          Your access code
        </label>
        <input
          id="access-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="K7QP-4M2X-9RTB"
          className="mt-1.5 w-full rounded-btn border border-border bg-card px-4 py-3 font-mono text-lg tracking-widest text-foreground uppercase placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground"
        />
        <p className="mt-2 text-sm text-muted-foreground">
          Capital letters, dashes and spaces do not matter — type it however it
          is written down.
        </p>

        <button
          type="submit"
          disabled={redeem.isPending || code.trim() === ''}
          className="mt-5 w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {redeem.isPending ? 'Checking…' : 'Link my child'}
        </button>
      </form>

      <section className="mt-8 max-w-prose">
        <h2 className="font-semibold text-foreground">
          If your code does not work
        </h2>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">
              It only works for one email address.
            </strong>{' '}
            The school sent it to a particular address, and you have to be
            signed in with that one. If you use a different address day to day,
            ask them to reissue it to that one.
          </li>
          <li>
            <strong className="text-foreground">It works once.</strong> If
            somebody in your family has already used it, you each need your own
            code — ask the school for a second.
          </li>
          <li>
            <strong className="text-foreground">
              It stops working after 30 days.
            </strong>{' '}
            Ask the school for a new one; there is no limit on how many they can
            send.
          </li>
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Codes are deliberately hard to guess, and we cannot look yours up or
          tell you what it was — not even the school can see it after it is
          sent. That is what stops somebody else reaching your child&rsquo;s
          record.
        </p>
      </section>
    </div>
  )
}
