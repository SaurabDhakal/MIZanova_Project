import { useQuery } from '@tanstack/react-query'
import PublicLayout from '../../components/PublicLayout'
import Icon from '../../components/Icon'
import { Lead, NextStep, NotThis, Section } from '../../components/PublicSections'
import { fetchServiceStatus } from '../../lib/api'

/**
 * "Status" from the Figma footer.
 *
 * THIS PAGE EXISTS BECAUSE IT CAN BE HONEST, and most cannot. The usual status
 * page is a row of green ticks rendered from a hard-coded array, which is
 * precisely the fault this project has caught eleven times: a claim reported
 * without being measured. A green tick that cannot go red is decoration.
 *
 * This one asks the server, at the moment you load it, and reports what it
 * says — including "we could not reach it", which is the answer a status page
 * most needs to be capable of giving.
 *
 * WHAT IT DELIBERATELY DOES NOT SHOW. The health endpoint returns which API
 * keys are configured. That is operational detail about the inside of the
 * server and is nobody's business on a public page, so only the overall state
 * crosses the boundary — see `fetchServiceStatus`.
 */

const LOOK = {
  ok: {
    icon: 'tick' as const,
    tint: 'bg-success-subtle text-success-foreground',
    heading: 'All services operating normally',
    detail:
      'The application and its database answered normally when this page loaded.',
  },
  degraded: {
    icon: 'shieldCheck' as const,
    tint: 'bg-warning-subtle text-warning-foreground',
    heading: 'Running, with something not configured',
    detail:
      'The parts that hold your data are working. Something optional is not fully set up, and Special Miles can see which.',
  },
  unhealthy: {
    icon: 'offline' as const,
    tint: 'bg-danger-subtle text-danger-foreground',
    heading: 'A core service is not responding',
    detail:
      'Signing in or loading records may fail right now. Special Miles has been alerted by the same check you are looking at.',
  },
  unreachable: {
    icon: 'offline' as const,
    tint: 'bg-danger-subtle text-danger-foreground',
    heading: 'We could not reach the service to ask',
    detail:
      'Either the service is down or your own connection cannot get to it. If other sites load for you, assume the former.',
  },
}

export default function Status() {
  const status = useQuery({
    queryKey: ['service-status'],
    queryFn: fetchServiceStatus,
    // A status page that answers from cache is answering about the past.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    retry: false,
  })

  const look = status.isPending
    ? null
    : LOOK[status.data ?? 'unreachable']

  return (
    <PublicLayout
      title="Service status"
      subtitle="Checked live, each time this page is opened."
    >
      <Lead>
        This is not a dashboard of remembered ticks. Opening this page asks the
        service whether it is working and prints the answer.
      </Lead>

      <div className="mx-auto mt-8 max-w-3xl">
        {status.isPending && (
          <div className="rounded-card border border-border bg-card shadow-raised p-6 text-muted-foreground">
            Asking the service…
          </div>
        )}

        {look && (
          <div className="rounded-card border border-border bg-card shadow-raised p-6">
            <div className="flex items-start gap-4">
              <span className={`inline-flex rounded-btn p-3 ${look.tint}`}>
                <Icon name={look.icon} className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {look.heading}
                </h2>
                <p className="mt-1 text-muted-foreground">{look.detail}</p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Checked{' '}
                  {new Date().toLocaleTimeString('en-AU', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  , {new Date().toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <Section title="If something is wrong for you but green here">
        <p>
          This checks whether the service is answering, not whether your school
          can reach it. A school firewall, a captive portal on guest wifi, or a
          single classroom’s connection can all break the app while everything
          here reports normal.
        </p>
        <p>
          Behaviour logging is designed for exactly that: the app opens without
          a connection and observations written offline upload by themselves
          once the network returns.
        </p>
      </Section>

      <NotThis>
        <p>
          There is no uptime history, no percentage, and no record of past
          incidents — because nothing is recording them. A figure like “99.9%
          this month” would be invented, and this is the last page on the site
          that should carry an invented number.
        </p>
        <p>
          There is no subscribe-to-updates option, because there is no incident
          feed to subscribe to.
        </p>
      </NotThis>

      <NextStep
        heading="Something broken and not shown here?"
        body="Tell us what you were doing and what happened. A specific report is worth more than a status page."
        to="/enquiry"
        label="Report a problem"
      />
    </PublicLayout>
  )
}
