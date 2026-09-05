import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import {
  ENQUIRY_PLANS,
  isEnquiryPlan,
  submitEnquiry,
  type EnquiryInput,
  type EnquiryKind,
} from '../lib/api'
import PublicLayout from '../components/PublicLayout'
import FormField from '../components/FormField'

/**
 * "Talk to us" — the only door into MiZanova that does not create an account.
 *
 * WHY THIS EXISTS AT ALL. Pricing's buttons used to lead to /signup, which
 * since the signpost leads back to Pricing. A loop. Before that they produced a
 * parent account for a principal, which is worse — it is not a school and
 * cannot become one.
 *
 * A school cannot set itself up, and that is not a gap. Creating a school means
 * creating the thing every account at that school hangs off; letting a stranger
 * do it by typing a name means anyone can create "St Paul's Primary" and start
 * inviting people into it. So a person at Special Miles reads this and creates
 * the school. It is the one place in the product where the honest answer is
 * "somebody will get back to you".
 *
 * WHAT THIS PAGE PROMISES, AND WHAT IT DOES NOT. It says a person will reply.
 * It does not say when, because nobody has told me a response time, and a page
 * that invents "within 24 hours" is making a commitment on behalf of a real
 * company. It does not send the enquirer an email either — see db/045, but
 * briefly: anyone can type anyone's address here, so a confirmation would make
 * MiZanova a way to mail strangers.
 */

const KIND_COPY: Record<
  EnquiryKind,
  { title: string; subtitle: string; organisationLabel: string; countLabel: string }
> = {
  school: {
    /*
     * "SCHOOL OR CENTRE", because this form already asked for a "School or
     * centre name" underneath a heading that only said school. db/095 made a
     * Montessori enquiry possible and the pricing page now sends people here
     * from a panel about centres — arriving at a heading that talks about
     * schools is the product forgetting who it just spoke to.
     */
    title: 'Talk to us about your school or centre',
    subtitle:
      'Tell us where you are and what you need. Someone from Special Miles will read this and reply to you personally.',
    organisationLabel: 'School or centre name',
    countLabel: 'Roughly how many children?',
  },
  family: {
    title: 'Register your interest',
    subtitle:
      'Family subscriptions are not open yet. Leave your details and we will tell you when they are — nothing is charged and no account is created.',
    organisationLabel: '',
    countLabel: 'How many children?',
  },
}

export default function Enquiry() {
  const [params] = useSearchParams()

  const planParam = params.get('plan')
  const plan = isEnquiryPlan(planParam) ? planParam : null

  /*
   * The plan decides the kind, because it is the more specific fact. Somebody
   * who pressed "Choose Premium" is a family whatever the other parameter says,
   * and asking them to confirm something they already told us by pressing a
   * button is the kind of small friction that loses an enquiry.
   */
  const kind: EnquiryKind =
    plan === 'essential' || plan === 'premium'
      ? 'family'
      : plan
        ? 'school'
        : params.get('kind') === 'family'
          ? 'family'
          : 'school'

  const copy = KIND_COPY[kind]

  const [form, setForm] = useState<EnquiryInput>({
    kind,
    plan,
    organisationName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    contactRole: '',
    studentCount: '',
    message: '',
    website: '',
  })

  const set = <K extends keyof EnquiryInput>(key: K, value: EnquiryInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const send = useMutation({ mutationFn: submitEnquiry })

  if (send.isSuccess) {
    return (
      <PublicLayout title="Thank you — we have it">
        <div className="mx-auto max-w-xl rounded-card border border-border bg-card shadow-raised p-8">
          <p className="text-foreground">
            {kind === 'school' ? (
              <>
                Your enquiry about{' '}
                <strong className="font-semibold">
                  {form.organisationName}
                </strong>{' '}
                has reached Special Miles. Someone will read it and reply to{' '}
                <strong className="font-semibold">{form.contactEmail}</strong>.
              </>
            ) : (
              <>
                We have your details. We will write to{' '}
                <strong className="font-semibold">{form.contactEmail}</strong>{' '}
                when family subscriptions open.
              </>
            )}
          </p>

          {/* No account was created, and saying so stops somebody waiting for
              a confirmation email that is never coming, or trying to sign in
              with a password they never chose. */}
          <p className="mt-4 text-sm text-muted-foreground">
            No account has been created and nothing has been charged. A person
            replies to this, so it will not be instant.
          </p>

          <Link
            to="/"
            className="mt-6 inline-block rounded-btn border border-border px-4 py-2.5 font-semibold text-foreground"
          >
            Back to the home page
          </Link>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout title={copy.title} subtitle={copy.subtitle}>
      <form
        className="mx-auto max-w-xl space-y-4 rounded-card border border-border bg-card shadow-raised p-6 sm:p-8"
        onSubmit={(event) => {
          event.preventDefault()
          send.mutate({ ...form, kind, plan })
        }}
      >
        {plan && (
          <p className="rounded-btn bg-primary-subtle px-4 py-3 text-sm text-primary">
            About the{' '}
            <strong className="font-semibold">{ENQUIRY_PLANS[plan]}</strong>{' '}
            plan.{' '}
            <Link to="/pricing" className="underline">
              Change
            </Link>
          </p>
        )}

        {kind === 'school' && (
          <FormField
            label={copy.organisationLabel}
            required
            autoComplete="organization"
            value={form.organisationName}
            onChange={(e) => set('organisationName', e.target.value)}
          />
        )}

        <FormField
          label="Your name"
          required
          autoComplete="name"
          value={form.contactName}
          onChange={(e) => set('contactName', e.target.value)}
        />

        {kind === 'school' && (
          <FormField
            label="Your role"
            hint="Principal, head of wellbeing, business manager — whatever fits."
            autoComplete="organization-title"
            value={form.contactRole}
            onChange={(e) => set('contactRole', e.target.value)}
          />
        )}

        <FormField
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={form.contactEmail}
          onChange={(e) => set('contactEmail', e.target.value)}
        />

        <FormField
          label="Phone"
          hint="Optional. Often faster than email for a first conversation."
          type="tel"
          autoComplete="tel"
          value={form.contactPhone}
          onChange={(e) => set('contactPhone', e.target.value)}
        />

        {/* Free text, not a dropdown of bands. A person who knows they have 640
            students should not have to decide whether that is "mid" or "large"
            — that is our job, and getting it wrong changes the price we quote. */}
        <FormField
          label={copy.countLabel}
          hint="Optional. An approximate number is fine."
          type="number"
          min={1}
          max={100000}
          inputMode="numeric"
          value={form.studentCount}
          onChange={(e) => set('studentCount', e.target.value)}
        />

        <div>
          <label
            htmlFor="enquiry-message"
            className="block text-sm font-semibold text-foreground"
          >
            Anything you would like us to know
          </label>
          <textarea
            id="enquiry-message"
            rows={5}
            maxLength={4000}
            value={form.message}
            onChange={(e) => set('message', e.target.value)}
            className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
          />
        </div>

        {/* THE HONEYPOT. Hidden from sight, skipped by the keyboard, hidden
            from screen readers, and left empty by every human being. Automated
            submitters fill in every field they can find, so a value here is a
            reliable tell — and unlike a CAPTCHA it costs a real person nothing
            and asks nobody to prove they are not a machine. The server answers
            a filled one with success, so whoever wrote the bot learns nothing.

            aria-hidden AND tabIndex together, deliberately: aria-hidden alone
            leaves it reachable by keyboard, which would trap a sighted keyboard
            user in a field they cannot see. */}
        <div aria-hidden="true" className="hidden">
          <label htmlFor="enquiry-website">Website</label>
          <input
            id="enquiry-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => set('website', e.target.value)}
          />
        </div>

        {send.isError && (
          <p
            role="alert"
            className="rounded-btn border border-danger bg-danger-subtle p-4 text-sm text-danger-foreground"
          >
            {send.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={send.isPending}
          className="w-full rounded-btn bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {send.isPending ? 'Sending…' : 'Send this to Special Miles'}
        </button>

        <p className="text-xs text-muted-foreground">
          We use these details to reply to you about MiZanova and nothing else.
          They are stored in Australia, on the same infrastructure as the rest
          of the platform.
        </p>
      </form>
    </PublicLayout>
  )
}
