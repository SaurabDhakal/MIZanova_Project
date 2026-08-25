import { useQuery } from '@tanstack/react-query'
import {
  fetchAdminAuditEvents,
  fetchAiControlEvents,
  queryKeys,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import { auditAction } from '../../lib/auditActions'
import PageHeader from '../../components/PageHeader'

/**
 * Audit log.
 *
 * Two streams, merged: changes to the AI controls (db/012) and administrative
 * actions on people (db/015). Both tables have a SELECT policy and nothing
 * else — rows arrive only through security definer functions and a trigger, so
 * nobody can write to their own audit trail or edit it afterwards.
 *
 * This is the reason those two tables have no insert, update or delete policy
 * at all. An audit log its subjects can write to proves nothing.
 */

type Entry = {
  key: string
  when: string
  label: string
  className: string
  actor: string
  subject: string | null
  detail: string
}

export default function AuditLog() {
  const admin = useQuery({
    queryKey: queryKeys.adminAudit,
    queryFn: fetchAdminAuditEvents,
  })
  const ai = useQuery({
    queryKey: queryKeys.aiControlEvents,
    queryFn: fetchAiControlEvents,
  })

  if (admin.isPending || ai.isPending) return <LoadingCards count={3} />
  if (admin.isError) return <ErrorState message={admin.error.message} />

  const entries: Entry[] = [
    ...(admin.data ?? []).map((e) => {
      const style = auditAction(e.action)
      return {
        key: e.id,
        when: e.occurred_at,
        label: style.label,
        className: style.className,
        actor: e.profiles?.full_name || 'Unknown',
        subject: e.subject_label,
        detail: e.detail ?? '',
      }
    }),
    ...(ai.data ?? []).map((e) => ({
      key: e.id,
      when: e.changed_at,
      label:
        e.was_enabled !== e.now_enabled
          ? e.now_enabled
            ? 'AI turned ON'
            : 'AI turned OFF'
          : 'Routing threshold changed',
      className:
        e.was_enabled !== e.now_enabled && !e.now_enabled
          ? 'bg-danger-subtle text-danger-foreground'
          : 'bg-primary-subtle text-primary',
      actor: e.profiles?.full_name || 'Unknown',
      subject:
        e.was_enabled === e.now_enabled
          ? `${Math.round((e.was_threshold ?? 0) * 100)}% → ${Math.round((e.now_threshold ?? 0) * 100)}%`
          : null,
      detail: e.reason,
    })),
  ].sort((a, b) => (a.when < b.when ? 1 : -1))

  return (
    <div>
      <PageHeader
        title="Audit log"
        lead="Every governance decision, who made it, and why."
      />

      <div className="mb-6 rounded-card border border-border bg-card shadow-raised p-4">
        <p className="text-sm font-semibold text-foreground">
          These entries cannot be edited or deleted
        </p>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Both underlying tables allow reading only. Rows are written by
          database functions, not by the application, so nobody — including you
          — can alter their own record after the fact.
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          detail="Verifying a staff member or changing the AI controls will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.key}
              className="rounded-card border border-border bg-card shadow-raised p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-btn px-2.5 py-1 text-sm font-semibold ${entry.className}`}
                >
                  {entry.label}
                </span>
                {entry.subject && (
                  <span className="font-medium text-foreground">
                    {entry.subject}
                  </span>
                )}
                <span className="ml-auto text-sm text-muted-foreground">
                  {new Date(entry.when).toLocaleString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' · '}
                  {entry.actor}
                </span>
              </div>
              {entry.detail && (
                <p className="mt-1 text-sm text-foreground">{entry.detail}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Showing the most recent 200 entries.
      </p>
    </div>
  )
}
