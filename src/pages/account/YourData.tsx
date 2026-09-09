import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  closeMyAccount,
  exportMyData,
  fetchMyEnrolments,
  fetchMyPurchases,
  fetchMySelfRequests,
  queryKeys,
} from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { showToast } from '../../lib/toast'
import ConfirmDestructive from '../../components/ConfirmDestructive'
import WhatWorksLink from '../../components/WhatWorksLink'

/**
 * Settings › Your data — everything about the record itself.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE THREE ARE TOGETHER AND NOT ON THE ACCOUNT TAB
 * ---------------------------------------------------------------------------
 * The Account tab was nine sections deep and answered four unrelated
 * questions: who am I, how do I sign in, what has this product recorded about
 * me, and how do I leave. The last two are one subject, and it is not the same
 * subject as changing your photograph.
 *
 * Closing an account is the sharpest case. It was the last thing on the
 * longest page, which is the wrong place for it twice over: somebody who wants
 * it has to scroll past everything else to find it, and somebody who does not
 * scrolls past a red box on their way to their notification settings.
 *
 * The summary document leads, because it is the one most people actually want.
 * The export is a data-rights file — complete, machine-readable and nobody's
 * idea of a good read. The document is the one you hand to a person.
 */
export default function YourData() {
  return (
    <div>
      <WhatWorksLink from="account" />
      <ExportSection />
      <CloseAccountSection />
    </div>
  )
}

function ExportSection() {
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const data = await exportMyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mizanova-my-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      // Revoked, or the blob stays in memory for the life of the tab.
      URL.revokeObjectURL(url)
      showToast('Downloaded.')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Could not build the file.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-10 rounded-card border border-border bg-card p-6 shadow-raised">
      <h2 className="text-lg font-bold text-foreground">Take your data</h2>
      <p className="mt-2 max-w-prose text-muted-foreground">
        Everything on this account in one file: what you have read, what you
        have paid, what you asked the AI and what it said, and every goal with
        its check-ins.
      </p>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        It is built in your browser from what your own account can see, so it
        contains exactly that and nothing else. The questions you asked appear
        as they were stored &mdash; with your name and contact details already
        removed, which is how they were sent.
      </p>
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="pressable min-h-11 mt-4 rounded-btn border border-border bg-background px-4 py-2.5 font-semibold text-foreground disabled:opacity-50"
      >
        {busy ? 'Gathering…' : 'Download everything'}
      </button>
    </section>
  )
}

function CloseAccountSection() {
  const [password, setPassword] = useState('')
  const [confirming, setConfirming] = useState(false)

  const enrolments = useQuery({
    queryKey: queryKeys.myEnrolments,
    queryFn: fetchMyEnrolments,
  })
  const requests = useQuery({
    queryKey: queryKeys.mySelfRequests,
    queryFn: fetchMySelfRequests,
  })
  const purchases = useQuery({
    queryKey: queryKeys.myPurchases,
    queryFn: fetchMyPurchases,
  })

  const close = useMutation({
    mutationFn: () => closeMyAccount(password),
    onSuccess: async () => {
      /*
       * SIGN OUT RATHER THAN NAVIGATE. The account behind this session no
       * longer exists, so every query on the next screen would fail and the
       * app would look broken at the exact moment somebody wanted a clean
       * exit. Straight to the public homepage.
       */
      await supabase.auth.signOut()
      window.location.assign('/')
    },
  })

  const paid = (purchases.data ?? []).filter((p) => p.status === 'paid')
  const consequences = [
    `${enrolments.data?.length ?? 0} course${
      enrolments.data?.length === 1 ? '' : 's'
    } you have started, and everything you have marked done`,
    `${requests.data?.length ?? 0} saved suggestion${
      requests.data?.length === 1 ? '' : 's'
    }, and everything you wrote to get them`,
    'Your name, your email address and your sign-in',
  ]
  if (paid.length > 0) {
    consequences.push(
      `${paid.length} purchase${
        paid.length === 1 ? '' : 's'
      } will be KEPT as a record of payment, with your name removed from it`,
    )
  }

  return (
    <section className="mt-10 rounded-card border border-danger bg-card p-6 shadow-raised">
      <h2 className="text-lg font-bold text-foreground">Close your account</h2>
      <p className="mt-2 max-w-prose text-muted-foreground">
        This deletes your account and everything on it. It cannot be undone,
        and we cannot get any of it back for you afterwards.
      </p>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        {paid.length > 0 ? (
          <>
            One thing is kept: the record that you paid for{' '}
            {paid.length === 1 ? 'a course' : `${paid.length} courses`}. Special
            Miles has to be able to account for money it was paid. Your name is
            removed from it, so what remains is an amount and a date attached to
            nobody.
          </>
        ) : (
          <>
            You have paid for nothing, so nothing is kept. Special Miles keeps a
            note that an account closed &mdash; it is the only way they learn
            the product lost somebody &mdash; and that note does not say who.
          </>
        )}
      </p>

      <label
        htmlFor="close-password"
        className="mt-5 block font-semibold text-foreground"
      >
        Your password
      </label>
      <p className="mt-1 text-sm text-muted-foreground">
        Asked for the same reason it is asked before changing your email: a
        signed-in laptop somebody walked away from should not be one click from
        this.
      </p>
      <input
        id="close-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-2 w-full max-w-xs rounded-btn border border-input-border bg-background p-2.5 text-foreground"
      />

      <button
        type="button"
        disabled={!password}
        onClick={() => setConfirming(true)}
        className="pressable mt-4 inline-flex min-h-11 items-center rounded-btn bg-danger-strong px-4 py-2.5 font-semibold text-white disabled:opacity-50"
      >
        Close my account
      </button>

      {confirming && (
        <ConfirmDestructive
          title="Close your account for good?"
          detail="Everything below goes now. There is no undo and no grace period."
          consequences={consequences}
          confirmPhrase="close my account"
          confirmLabel="Close it"
          pending={close.isPending}
          error={close.error ? close.error.message : null}
          onConfirm={() => close.mutate()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  )
}
