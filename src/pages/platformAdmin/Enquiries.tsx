import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ENQUIRY_PLANS,
  fetchEnquiries,
  fetchQueueCounts,
  queryKeys,
  setEnquiryStatus,
  type EnquiryRow,
  type EnquiryStatus,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import QueueTabs from '../../components/QueueTabs'
import { showToast } from '../../lib/toast'

/**
 * Enquiries — people asking to become customers, from the pricing page.
 *
 * THE ONLY SCREEN IN THE PRODUCT SHOWING PEOPLE WITH NO ACCOUNT. Everything
 * else here is about somebody the system already knows. These are strangers who
 * pressed a button, which changes what the screen has to be good at: there is
 * no profile to look them up in, so what they typed is all there is, and it is
 * shown in full rather than summarised into a row.
 *
 * WHY IT IS PLATFORM ADMIN AND NOT SCHOOL ADMIN. These rows hold names, work
 * addresses and phone numbers of people at organisations that are not customers
 * yet — including, quite possibly, a competitor school down the road. There is
 * no school to attach them to, and RLS gives nobody else a single row.
 *
 * WHAT CANNOT BE EDITED HERE, deliberately: anything the enquirer wrote. The
 * status and the note are ours; the rest is evidence of what somebody asked for
 * and what they were told. db/045 enforces that with a trigger rather than
 * trusting this screen, because a record that can be rewritten is not a record.
 */

const TABS: { value: EnquiryStatus | 'all'; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'onboarded', label: 'Onboarded' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'Everything' },
]

const STATUS_STYLE: Record<EnquiryStatus, string> = {
  new: 'bg-primary-subtle text-primary',
  contacted: 'bg-warning-subtle text-warning-foreground',
  onboarded: 'bg-success-subtle text-success-foreground',
  declined: 'bg-background text-muted-foreground',
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function EnquiryCard({ enquiry }: { enquiry: EnquiryRow }) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState(enquiry.handled_note ?? '')

  const update = useMutation({
    mutationFn: ({ status }: { status: EnquiryStatus }) =>
      setEnquiryStatus(enquiry.id, status, note),
    onSuccess: (_data, { status }) => {
      // Every tab, because the row has just moved between two of them and the
      // one it left would otherwise still be showing it — and the counts on
      // the tabs, which have just changed by one in each direction.
      void queryClient.invalidateQueries({ queryKey: ['enquiries'] })
      void queryClient.invalidateQueries({ queryKey: ['queue-counts'] })
      showToast(`Marked as ${status}.`)
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  const title =
    enquiry.kind === 'school'
      ? (enquiry.organisation_name ?? enquiry.contact_name)
      : enquiry.contact_name

  return (
    <li className="rounded-card border border-border bg-card shadow-raised p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        <span
          className={`rounded-btn px-2.5 py-0.5 text-xs font-semibold uppercase ${STATUS_STYLE[enquiry.status]}`}
        >
          {enquiry.status}
        </span>
        <span className="rounded-btn bg-background px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
          {enquiry.kind === 'school' ? 'School' : 'Family'}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">
          {formatWhen(enquiry.created_at)}
        </span>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Contact</dt>
          <dd className="font-medium text-foreground">
            {enquiry.contact_name}
            {enquiry.contact_role && ` — ${enquiry.contact_role}`}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Email</dt>
          {/* A link, because the whole point of this screen is replying, and
              retyping an address is how you reply to the wrong person. */}
          <dd>
            <a
              href={`mailto:${enquiry.contact_email}`}
              className="font-medium text-primary hover:underline"
            >
              {enquiry.contact_email}
            </a>
          </dd>
        </div>
        {enquiry.contact_phone && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Phone</dt>
            <dd>
              <a
                href={`tel:${enquiry.contact_phone}`}
                className="font-medium text-primary hover:underline"
              >
                {enquiry.contact_phone}
              </a>
            </dd>
          </div>
        )}
        {enquiry.student_count !== null && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">
              {enquiry.kind === 'school' ? 'Students' : 'Children'}
            </dt>
            <dd className="font-medium text-foreground">
              {enquiry.student_count}
            </dd>
          </div>
        )}
        {enquiry.plan_key && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Asked about</dt>
            <dd className="font-medium text-foreground">
              {ENQUIRY_PLANS[enquiry.plan_key]}
            </dd>
          </div>
        )}
      </dl>

      {enquiry.message && (
        <blockquote className="mt-4 border-l-4 border-border pl-4 text-sm whitespace-pre-wrap text-foreground">
          {enquiry.message}
        </blockquote>
      )}

      {enquiry.handled_at && (
        <p className="mt-4 text-sm text-muted-foreground">
          {enquiry.status} by {enquiry.handled_by?.full_name ?? 'someone'} on{' '}
          {formatWhen(enquiry.handled_at)}
        </p>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <label
          htmlFor={`note-${enquiry.id}`}
          className="block text-sm font-semibold text-foreground"
        >
          What happened
        </label>
        <p className="text-xs text-muted-foreground">
          Saved with whichever button you press. Who and when are recorded
          automatically.
        </p>
        <textarea
          id={`note-${enquiry.id}`}
          rows={2}
          maxLength={4000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Called them, sending a quote Monday…"
          className="mt-1.5 w-full rounded-btn border border-border bg-background px-3 py-2 text-sm text-foreground"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {(['contacted', 'onboarded', 'declined', 'new'] as const)
            .filter((status) => status !== enquiry.status)
            .map((status) => (
              <button
                key={status}
                type="button"
                disabled={update.isPending}
                onClick={() => update.mutate({ status })}
                className="rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
              >
                {status === 'new' ? 'Put back in the queue' : `Mark ${status}`}
              </button>
            ))}
        </div>
      </div>
    </li>
  )
}

export default function Enquiries() {
  const [tab, setTab] = useState<EnquiryStatus | 'all'>('new')

  const enquiries = useQuery({
    queryKey: queryKeys.enquiries(tab),
    queryFn: () => fetchEnquiries(tab),
  })

  const counts = useQuery({
    queryKey: queryKeys.queueCounts('enquiries'),
    queryFn: () =>
      fetchQueueCounts('enquiries', ['new', 'contacted', 'onboarded', 'declined']),
  })

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Enquiries</h1>
        <p className="mt-1 text-muted-foreground">
          People who asked about MiZanova from the pricing page. Nobody here has
          an account — a school gets one when you create it for them.
        </p>
      </header>

      <QueueTabs
        name="enquiry-status"
        tabs={TABS}
        value={tab}
        onChange={setTab}
        counts={counts.data}
      />

      {enquiries.isPending && <LoadingCards count={3} />}
      {enquiries.isError && (
        <ErrorState
          message={enquiries.error.message}
          onRetry={() => void enquiries.refetch()}
        />
      )}

      {enquiries.isSuccess && enquiries.data.length === 0 && (
        <EmptyState
          /* "Nothing waiting" full stop reads as "nothing exists", which is how
             an empty New tab got mistaken for a broken feature. When there are
             enquiries in other tabs, this says so. */
          title={
            counts.data && counts.data.all > 0
              ? 'None in this tab'
              : 'No enquiries yet'
          }
          detail={
            counts.data && counts.data.all > 0
              ? `There ${counts.data.all === 1 ? 'is' : 'are'} ${counts.data.all} in total — the numbers above show where.`
              : 'Enquiries from the pricing page land here. Special Miles is emailed as each one arrives, so this is a record rather than the only way you find out.'
          }
        />
      )}

      {enquiries.isSuccess && enquiries.data.length > 0 && (
        <ul className="space-y-4">
          {enquiries.data.map((enquiry) => (
            <EnquiryCard key={enquiry.id} enquiry={enquiry} />
          ))}
        </ul>
      )}
    </div>
  )
}
