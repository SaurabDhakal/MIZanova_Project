import { useQuery } from '@tanstack/react-query'
import {
  fetchAiOverview,
  fetchKpiOverview,
  fetchWeeklyActivity,
  queryKeys,
  type WeeklyRow,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'

/**
 * Performance KPIs - docs/Figma Pages Design/SC2-Performance KPIs Dashboard.png.
 *
 * That design shows "Absenteeism Correlation 0.84", "Parent Engagement (CSAT)
 * 8.4/10", "Escalation Reduction 24% vs last quarter" and a chart comparing
 * "Anonymized Predictive AI" against a "Standard Evidence Database".
 *
 * MiZanova stores no attendance data, runs no satisfaction survey, has no
 * quarterly baseline, and holds no such comparison. Every one of those numbers
 * would be typed in by hand — and a confident figure with nothing behind it is
 * worse than a blank space, because it gets quoted in a meeting.
 *
 * Everything below traces to rows an administrator could count themselves. The
 * page says so, and says what is missing and why.
 */

function StatCard({
  label,
  value,
  detail,
  tone = 'normal',
}: {
  label: string
  value: string
  detail: string
  tone?: 'normal' | 'good' | 'warn'
}) {
  const valueClass =
    tone === 'warn'
      ? 'text-danger-foreground'
      : tone === 'good'
        ? 'text-success-foreground'
        : 'text-foreground'
  return (
    <div className="rounded-card border border-border bg-card shadow-raised p-5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className={`mt-2 text-4xl font-bold ${valueClass}`}>{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  )
}

/**
 * A bar chart made of divs.
 *
 * No charting library: for twelve bars it would add far more to the bundle
 * than it earns, and a table is the accessible fallback anyway. The table is
 * always rendered for screen readers rather than the bars carrying aria labels
 * that describe a shape nobody can act on.
 */
function WeeklyBars({ rows }: { rows: WeeklyRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.logs))

  return (
    <div className="rounded-card border border-border bg-card shadow-raised p-5">
      <p className="font-semibold text-foreground">Logs per week</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Last 12 weeks. Red portion is incidents flagged for safeguarding.
      </p>

      {/* Each column is h-full so the bar's percentage height has something to
          resolve against. A percentage height inside an auto-height parent
          computes to zero — which is what happened here, and it looked exactly
          like having no data. The labels sit in their own row below, outside
          the fixed-height area, so they do not eat into the bar scale. */}
      <div className="mt-5" aria-hidden="true">
        <div className="flex h-40 items-end gap-2">
          {rows.map((row) => {
            const height = (row.logs / max) * 100
            const flaggedShare =
              row.logs > 0 ? (row.flagged / row.logs) * 100 : 0
            return (
              <div
                key={row.week_start}
                className="flex h-full max-w-16 flex-1 flex-col justify-end"
              >
                <div
                  className="flex w-full flex-col justify-end overflow-hidden rounded-t bg-primary"
                  style={{ height: `${Math.max(height, 3)}%` }}
                >
                  <div
                    className="w-full bg-danger"
                    style={{ height: `${flaggedShare}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-1 flex gap-2">
          {rows.map((row) => (
            <span
              key={row.week_start}
              className="max-w-16 flex-1 text-center text-[10px] text-muted-foreground"
            >
              {new Date(row.week_start).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          ))}
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-primary">
          Show as a table
        </summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">
            Behaviour logs and flagged incidents per week
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-1.5 font-semibold">Week starting</th>
              <th scope="col" className="py-1.5 font-semibold">Logs</th>
              <th scope="col" className="py-1.5 font-semibold">Flagged</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.week_start} className="border-b border-border last:border-0">
                <td className="py-1.5">
                  {new Date(row.week_start).toLocaleDateString('en-AU')}
                </td>
                <td className="py-1.5">{row.logs}</td>
                <td className="py-1.5">{row.flagged}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

export default function Kpis() {
  const kpi = useQuery({
    queryKey: queryKeys.kpiOverview,
    queryFn: fetchKpiOverview,
  })
  const weekly = useQuery({
    queryKey: queryKeys.weeklyActivity,
    queryFn: fetchWeeklyActivity,
  })
  const ai = useQuery({
    queryKey: queryKeys.aiOverview,
    queryFn: fetchAiOverview,
  })

  if (kpi.isPending) return <LoadingCards count={4} />
  if (kpi.isError) return <ErrorState message={kpi.error.message} />

  const k = kpi.data
  if (!k) {
    return (
      <EmptyState
        title="No data for your school yet"
        detail="Figures appear here once behaviour has been logged. If your own account is not verified, nothing is visible to you at all."
      />
    )
  }

  const guardianCoverage =
    k.students_active > 0
      ? Math.round((k.students_with_guardian / k.students_active) * 100)
      : 0
  const staffCoverage =
    k.students_active > 0
      ? Math.round((k.students_with_staff / k.students_active) * 100)
      : 0
  const a = ai.data

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Performance KPIs</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Counted live from your school&rsquo;s records. No figure here is
          stored, estimated or projected.
        </p>
      </header>

      {/* --- Safeguarding responsiveness ---------------------------------- */}
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        Safeguarding responsiveness
      </h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open incidents"
          value={String(k.flagged_open)}
          detail={k.flagged_open === 0 ? 'Nothing outstanding' : 'Awaiting a decision'}
          tone={k.flagged_open > 0 ? 'warn' : 'good'}
        />
        <StatCard
          label="Median time to acknowledge"
          value={
            k.median_ack_hours === null
              ? '—'
              : k.median_ack_hours < 1
                ? '<1h'
                : `${Math.round(k.median_ack_hours)}h`
          }
          detail={
            k.median_ack_hours === null
              ? 'Nothing acknowledged yet'
              : 'From incident to sign-off'
          }
        />
        <StatCard
          label="Flagged all time"
          value={String(k.flagged_total)}
          detail={`${k.flagged_total - k.flagged_open} acknowledged`}
        />
        <StatCard
          label="Flagged rate"
          value={
            k.logs_total > 0
              ? `${Math.round((k.flagged_total / k.logs_total) * 100)}%`
              : '—'
          }
          detail="Of all behaviour logs"
        />
      </div>

      {/* --- Activity ------------------------------------------------------ */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        Recording activity
      </h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Logs this week"
          value={String(k.logs_7d)}
          detail="Last 7 days"
        />
        <StatCard
          label="Logs this month"
          value={String(k.logs_30d)}
          detail="Last 30 days"
        />
        <StatCard
          label="Shared with families"
          value={
            k.logs_total > 0
              ? `${Math.round((k.logs_shared / k.logs_total) * 100)}%`
              : '—'
          }
          detail={`${k.logs_shared} of ${k.logs_total} logs`}
        />
        <StatCard
          label="Active students"
          value={String(k.students_active)}
          detail="On the roll"
        />
      </div>

      {weekly.isSuccess && weekly.data.length > 0 && (
        <div className="mt-5">
          <WeeklyBars rows={weekly.data} />
        </div>
      )}

      {/* --- Coverage ------------------------------------------------------- */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        Coverage
      </h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <StatCard
          label="Students with a guardian connected"
          value={`${guardianCoverage}%`}
          detail={`${k.students_with_guardian} of ${k.students_active} — the rest have no family access`}
          tone={guardianCoverage < 100 ? 'warn' : 'good'}
        />
        <StatCard
          label="Students with staff assigned"
          value={`${staffCoverage}%`}
          detail={`${k.students_with_staff} of ${k.students_active} — the rest are invisible to teachers`}
          tone={staffCoverage < 100 ? 'warn' : 'good'}
        />
      </div>

      {/* --- AI ------------------------------------------------------------- */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        AI oversight
      </h2>

      {!a || a.strategies_total === 0 ? (
        <EmptyState
          title="No AI suggestions generated yet"
          detail="Figures appear once teachers start requesting classroom strategies."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Suggestions generated"
            value={String(a.strategies_total)}
            detail="All time"
          />
          <StatCard
            label="Held for a specialist"
            value={`${Math.round(((a.pending_review + a.approved + a.rejected) / a.strategies_total) * 100)}%`}
            detail={`${a.pending_review} still waiting`}
          />
          <StatCard
            label="Rejected by a specialist"
            value={String(a.rejected)}
            detail="Judged unsuitable and never shown"
          />
          <StatCard
            label="Identifiers removed"
            value={a.avg_redactions === null ? '—' : String(a.avg_redactions)}
            detail="Average per request, before sending"
          />
        </div>
      )}

      {/* --- What is deliberately not here ---------------------------------- */}
      <div className="mt-10 rounded-card border border-border bg-card shadow-raised p-5">
        <h2 className="font-semibold text-foreground">
          What this page does not show, and why
        </h2>
        <ul className="mt-2 max-w-prose space-y-1.5 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">
              Absenteeism correlation
            </span>{' '}
            — MiZanova holds no attendance data. There is nothing to correlate.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Parent satisfaction (CSAT)
            </span>{' '}
            — no survey is sent, so any score would be invented.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Escalation reduction versus last quarter
            </span>{' '}
            — comparisons need a baseline this system has not been running long
            enough to have.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Whether a strategy worked
            </span>{' '}
            — that needs an outcome nobody records. What is shown instead is how
            often a specialist had to intervene, which is a real signal reported
            by real people.
          </li>
        </ul>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          These appear on the original designs for this screen. They were left
          out rather than fabricated: a confident number with nothing behind it
          is worse than a blank space, because it gets quoted in a meeting.
        </p>
      </div>
    </div>
  )
}
