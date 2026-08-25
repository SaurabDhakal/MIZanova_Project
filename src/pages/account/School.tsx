import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMySchool,
  queryKeys,
  updateMySchool,
  type MySchool,
} from '../../lib/api'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import { showToast } from '../../lib/toast'

/**
 * Settings → School. The details a school owns about itself.
 *
 * ---------------------------------------------------------------------------
 * A WHOLE ROLE HAD NO SELF-SERVICE
 * ---------------------------------------------------------------------------
 * `organisations` has carried name, suburb, state, timezone and ABN since
 * db/039, and until db/066 only a platform admin could write any of it. A
 * school with a misspelled name or a wrong ABN had one route: ring Special
 * Miles. Everything on this page is a field the school is the authority on.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS SHOWN BUT NOT EDITABLE, AND WHY IT IS SHOWN AT ALL
 * ---------------------------------------------------------------------------
 * Status and kind are read-only here, and the database refuses them rather
 * than trusting this form — db/066's trigger, because a school that could
 * write its own status could lift its own suspension, and since db/063 that
 * decides whether its educators can add children.
 *
 * They are still displayed. A school seeing "Suspended" and no control learns
 * something true and actionable; a school seeing nothing wonders why its
 * teachers cannot add a child. Hiding a state does not remove it.
 */

/*
 * The timezones this product actually serves. A full IANA list is six hundred
 * entries and every one of them is a way to get this wrong; Australia has these
 * and the product is sold here. Perth being three hours behind Sydney is the
 * case that matters — an appointment booked at 9am should not read as 11am to
 * whoever reviews it.
 */
const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Australia/Hobart',
  'Australia/Darwin',
]

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']

const STATUS_NOTE: Record<string, string> = {
  active: 'Everything works normally.',
  trial: 'Everything works normally. Special Miles will be in touch about it.',
  suspended:
    'Your educators cannot add new students. Existing records are unaffected. Contact Special Miles.',
  closed:
    'This school is marked as finished. Records are kept. Contact Special Miles.',
}

/**
 * Keyed on the school id by the parent, so the fields start from what the
 * server said rather than being synced into state by an effect — the same
 * reason the account form is a keyed child.
 */
function SchoolForm({ school }: { school: MySchool }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(school.name)
  const [suburb, setSuburb] = useState(school.suburb ?? '')
  const [state, setState] = useState(school.state ?? '')
  const [timezone, setTimezone] = useState(school.timezone)
  const [abn, setAbn] = useState(school.abn ?? '')

  const save = useMutation({
    mutationFn: () =>
      updateMySchool(school.id, {
        name: name.trim(),
        suburb: suburb.trim() || null,
        state: state.trim() || null,
        timezone,
        abn: abn.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.mySchool })
      // Every screen that names the school reads it from somewhere else.
      await queryClient.invalidateQueries({ queryKey: queryKeys.schools })
      showToast('School details saved.')
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  const dirty =
    name.trim() !== school.name ||
    (suburb.trim() || null) !== school.suburb ||
    (state.trim() || null) !== school.state ||
    timezone !== school.timezone ||
    (abn.trim() || null) !== school.abn

  const field = 'mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground'

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="rounded-card border border-border bg-card shadow-raised p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground">Your school</h2>
          <button
            type="button"
            disabled={!dirty || save.isPending || name.trim() === ''}
            onClick={() => save.mutate()}
            className="rounded-btn bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          These are the details the school is the authority on. Changes are
          recorded on the audit trail with your name.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="school-name" className="block text-sm font-medium text-foreground">
              Name
            </label>
            <input
              id="school-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
            {name.trim() === '' && (
              <p className="mt-1 text-sm text-danger-foreground">
                A school has to have a name.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="school-suburb" className="block text-sm font-medium text-foreground">
              Suburb
            </label>
            <input
              id="school-suburb"
              value={suburb}
              onChange={(e) => setSuburb(e.target.value)}
              className={field}
            />
          </div>

          <div>
            <label htmlFor="school-state" className="block text-sm font-medium text-foreground">
              State
            </label>
            <select
              id="school-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className={field}
            >
              <option value="">Not set</option>
              {STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="school-timezone" className="block text-sm font-medium text-foreground">
              Timezone
            </label>
            <select
              id="school-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={field}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace('Australia/', '')}</option>
              ))}
            </select>
            {/* Said out loud because it is currently true and will not always
                be: the column exists and nothing reads it yet. Promising that
                times follow this setting would be a lie a school would only
                discover from a missed appointment. */}
            <p className="mt-1 text-xs text-muted-foreground">
              Recorded, but times on screen still follow the device they are
              read on. Setting it now means it is right when they do.
            </p>
          </div>

          <div>
            <label htmlFor="school-abn" className="block text-sm font-medium text-foreground">
              ABN
            </label>
            <input
              id="school-abn"
              value={abn}
              onChange={(e) => setAbn(e.target.value)}
              inputMode="numeric"
              placeholder="11 222 333 444"
              className={field}
            />
          </div>
        </div>
      </section>

      <section className="rounded-card border border-border bg-card shadow-raised p-5">
        <h2 className="font-semibold text-foreground">Managed by Special Miles</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Shown so you know where you stand. Changing either is a conversation
          rather than a form.
        </p>

        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="mt-0.5 font-semibold text-foreground capitalize">
              {school.status}
            </dd>
            <dd className="mt-1 text-muted-foreground">
              {STATUS_NOTE[school.status] ?? ''}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Organisation type</dt>
            <dd className="mt-0.5 font-semibold text-foreground">
              {school.kind === 'ecec'
                ? 'Early childhood'
                : school.kind === 'ndis_provider'
                  ? 'NDIS provider'
                  : school.kind.charAt(0).toUpperCase() + school.kind.slice(1)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

export default function School() {
  const school = useQuery({
    queryKey: queryKeys.mySchool,
    queryFn: fetchMySchool,
  })

  if (school.isPending) return <LoadingCards count={2} />
  if (school.isError) return <ErrorState message={school.error.message} />

  /*
   * Null is reachable and is not an error: a school admin whose membership has
   * not been set up yet gets no row back. Saying which is which beats an empty
   * form that saves nowhere.
   */
  if (!school.data) {
    return (
      <p className="rounded-card border border-border bg-card p-5 text-sm text-muted-foreground">
        Your account is not attached to a school yet, so there is nothing to
        edit here. Special Miles attaches an administrator when the school is
        created.
      </p>
    )
  }

  return <SchoolForm key={school.data.id} school={school.data} />
}
