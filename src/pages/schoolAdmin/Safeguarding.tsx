import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acknowledgeIncident,
  fetchSafeguardingQueue,
  queryKeys,
  type BehaviourIntensity,
  type SafeguardingRow,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'

/**
 * Safeguarding queue - docs/Figma Pages Design/Safeguarding & Compliance Hub.png.
 *
 * TWO DELIBERATE DEVIATIONS FROM THAT DESIGN, both worth defending:
 *
 * 1. The design labels the incident log "(Anonymized)" and shows students as
 *    "#8821". This screen shows the child's name. A safeguarding lead whose
 *    queue hides which child is involved cannot follow anything up, ring a
 *    parent, or check on the student — the queue becomes decorative. The
 *    anonymisation requirement in this product is about what leaves for the AI
 *    and what appears in aggregate reporting, not about hiding a child from the
 *    person responsible for their welfare.
 *
 * 2. There is no "EMERGENCY PROTOCOL" button. A red button implying the system
 *    can summon help is dangerous if it only writes a database row. Emergencies
 *    are handled by ringing someone, and the page says so.
 */

const SEVERITY: Record<
  BehaviourIntensity,
  { label: string; className: string; icon: string }
> = {
  high: {
    label: 'High severity',
    className: 'bg-danger-subtle text-danger-foreground',
    icon: '⚡',
  },
  medium: {
    label: 'Medium severity',
    className: 'bg-warning-subtle text-warning-foreground',
    icon: '⚠',
  },
  standard: {
    label: 'Standard severity',
    className: 'bg-primary-subtle text-primary',
    icon: 'ℹ',
  },
}

const TYPE_LABEL: Record<string, string> = {
  disruptive: 'Disruptive',
  withdrawn: 'Withdrawn',
  emotional: 'Emotional',
  physical: 'Physical',
}

function ageLabel(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)} days ago`
}

function IncidentCard({
  incident,
  open,
}: {
  incident: SafeguardingRow
  open: boolean
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const severity = SEVERITY[incident.intensity]

  const acknowledge = useMutation({
    mutationFn: () => acknowledgeIncident(incident.id, note),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.safeguarding(true) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.safeguarding(false) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.schoolSummary }),
      ])
    },
  })

  return (
    <li className="rounded-card border border-border bg-card shadow-raised p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${severity.className}`}
          aria-hidden="true"
        >
          {severity.icon}
        </span>

        <div className="min-w-0">
          <p className="font-bold text-foreground">
            {severity.label}
            <span className="ml-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              logged {ageLabel(incident.occurred_at)}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {incident.students?.display_name ?? 'Unknown student'}
            {incident.students?.external_ref &&
              ` · ID #${incident.students.external_ref}`}
            {incident.students?.year_level &&
              ` · Year ${incident.students.year_level}`}
            {incident.profiles?.full_name &&
              ` · logged by ${incident.profiles.full_name}`}
          </p>
        </div>

        <span className="ml-auto rounded-btn bg-background px-2.5 py-1 text-sm font-medium text-foreground">
          {TYPE_LABEL[incident.behaviour_type] ?? incident.behaviour_type}
        </span>
      </div>

      {incident.risk_note && (
        <p className="mt-3 rounded-btn bg-danger-subtle p-3 text-sm font-medium text-danger-foreground">
          Why it was flagged: {incident.risk_note}
        </p>
      )}

      {incident.notes && (
        <p className="mt-2 text-foreground">{incident.notes}</p>
      )}

      {open ? (
        <div className="mt-4 border-t border-border pt-3">
          <label
            htmlFor={`ack-${incident.id}`}
            className="text-sm font-semibold text-foreground"
          >
            What action did you take?
          </label>
          <textarea
            id={`ack-${incident.id}`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Spoke with the class teacher; parent contacted; no further action needed."
            className="mt-1.5 w-full rounded-btn border border-border bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground"
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => acknowledge.mutate()}
              disabled={acknowledge.isPending}
              className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
            >
              {acknowledge.isPending ? 'Recording…' : 'Acknowledge'}
            </button>
            <p className="text-xs text-muted-foreground">
              Acknowledging locks this record — the teacher who wrote it can no
              longer edit it.
            </p>
          </div>

          {acknowledge.isError && (
            <p role="alert" className="mt-2 text-sm text-danger-foreground">
              {acknowledge.error.message}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-sm font-semibold text-success-foreground">
            ✓ Acknowledged{' '}
            {incident.safeguarding_acknowledged_at &&
              new Date(
                incident.safeguarding_acknowledged_at,
              ).toLocaleString('en-AU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
          </p>
          {incident.safeguarding_note && (
            <p className="mt-1 text-sm text-foreground">
              {incident.safeguarding_note}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

export default function Safeguarding() {
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const open = tab === 'open'

  const incidents = useQuery({
    queryKey: queryKeys.safeguarding(open),
    queryFn: () => fetchSafeguardingQueue(open),
  })

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Safeguarding hub</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Behaviour incidents flagged for review. Acknowledging one records what
          you did about it and locks the record.
        </p>
      </header>

      <div
        role="alert"
        className="mb-6 rounded-card border border-warning bg-warning-subtle p-4"
      >
        <p className="text-sm font-semibold text-warning-foreground">
          This is not an emergency channel
        </p>
        <p className="mt-1 text-sm text-warning-foreground">
          If a child is at immediate risk, follow your school&rsquo;s emergency
          procedure and contact people directly. MiZanova records incidents; it
          does not summon help.
        </p>
      </div>

      {/* Tabs, as real buttons with aria-pressed rather than styled divs. */}
      <div className="mb-4 flex gap-2">
        {(['open', 'closed'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={`rounded-btn px-4 py-2 text-sm font-semibold ${
              tab === value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-foreground'
            }`}
          >
            {value === 'open' ? 'Needs review' : 'Acknowledged'}
          </button>
        ))}
      </div>

      {incidents.isPending && <LoadingCards count={2} />}
      {incidents.isError && (
        <ErrorState
          message={incidents.error.message}
          onRetry={() => void incidents.refetch()}
        />
      )}

      {incidents.isSuccess && incidents.data.total === 0 && (
        <EmptyState
          title={open ? 'Nothing waiting for review' : 'Nothing acknowledged yet'}
          detail={
            open
              ? 'Incidents appear here when a teacher or the AI flags one as needing a safeguarding lead to look at it.'
              : 'Acknowledged incidents move here with a record of what was done.'
          }
        />
      )}

      {incidents.isSuccess && incidents.data.total > 0 && (
        <>
          {/*
            THE COUNT IS THE QUEUE, NOT THE PAGE.

            This read `incidents.data.length` — the rows that came back — while
            the query asked for them with no range, so PostgREST returned at
            most its default 1000. A school with a longer backlog would have
            been told "1000 incidents" indefinitely. `total` is counted by the
            database over the whole queue.
          */}
          <p className="mb-3 text-sm text-muted-foreground">
            {incidents.data.total} incident
            {incidents.data.total === 1 ? '' : 's'}, oldest first.
            {incidents.data.rows.length < incidents.data.total && (
              <>
                {' '}
                Showing the {incidents.data.rows.length} that have been waiting
                longest.
              </>
            )}
          </p>
          <ul className="space-y-4">
            {incidents.data.rows.map((incident) => (
              <IncidentCard
                key={incident.id}
                incident={incident}
                open={open}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
