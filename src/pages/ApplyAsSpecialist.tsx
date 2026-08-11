import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import {
  PROFESSIONS,
  WWCC_STATES,
  submitSpecialistApplication,
  type ApplicationInput,
  type Profession,
} from '../lib/api'
import PublicLayout from '../components/PublicLayout'
import FormField from '../components/FormField'

/**
 * Gate 1 — applying to join MiZanova as a specialist. `P-004 For Specialists`.
 *
 * TWO NAMES, SAID ONCE. MiZanova is the platform; Special Miles is the company
 * that runs it and does the vetting. That distinction is used consistently
 * across the product — 'until Special Miles has verified you' predates this
 * page — but a specialist landing here has never heard either name, and
 * 'Join the Special Miles network' under a MiZanova header read as two
 * unrelated companies. The relationship is now stated in the first sentence
 * and then assumed.
 *
 * THIS CREATES NO ACCOUNT, and that is the design rather than a limitation. An
 * account here would be an unapproved stranger holding a login to a children's
 * records platform, and every screen in the product would then have to defend
 * against them. The account arrives when a school engages them, already
 * attached to that school.
 *
 * WHY IT ASKS FOR A DATE OF BIRTH, which no other public form in this product
 * does: a Working With Children Check is verified at the source with a name, a
 * date of birth and the number, together. Without it the one check this form
 * exists to support cannot be done. The page says so where it is asked, because
 * a person typing their date of birth into a website deserves the reason next
 * to the box rather than in a privacy policy.
 *
 * WHY IT UPLOADS NOTHING. The NSW check is an online system with no card or
 * certificate — a scan would be weaker evidence than the verification the
 * reviewer must do anyway, while looking like stronger evidence. Documents are
 * requested by email if a reviewer wants them. See db/047.
 */
export default function ApplyAsSpecialist() {
  const [form, setForm] = useState<ApplicationInput>({
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    profession: '',
    professionOther: '',
    registrationBody: '',
    registrationNumber: '',
    yearsExperience: '',
    regions: '',
    about: '',
    wwccState: 'NSW',
    wwccNumber: '',
    wwccExpiry: '',
    ndisScreeningNumber: '',
    ndisExpiry: '',
    website: '',
  })

  const set = <K extends keyof ApplicationInput>(
    key: K,
    value: ApplicationInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }))

  const send = useMutation({ mutationFn: submitSpecialistApplication })

  if (send.isSuccess) {
    return (
      <PublicLayout title="Application received">
        <div className="mx-auto max-w-xl rounded-card border border-border bg-card shadow-raised p-8">
          <p className="text-foreground">
            Thank you, {form.fullName}. Someone at Special Miles will check your
            registration and your Working With Children Check, and write to{' '}
            <strong className="font-semibold">{form.email}</strong> with a
            decision.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            No account has been created. If you are approved, your account is
            created when a school engages you — the invitation arrives by email
            and there is nothing to set up in the meantime.
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
    <PublicLayout
      title="Join MiZanova as a specialist"
      subtitle="For speech pathologists, occupational therapists, psychologists and other practitioners working with neurodiverse children."
    >
      <form
        className="mx-auto max-w-xl space-y-4 rounded-card border border-border bg-card shadow-raised p-6 sm:p-8"
        onSubmit={(event) => {
          event.preventDefault()
          send.mutate(form)
        }}
      >
        {/* Said before the first field, not after the last. Somebody deciding
            whether to hand over a WWCC number and a date of birth should know
            what happens next before they start typing, not after. */}
        <div className="rounded-btn bg-primary-subtle p-4 text-sm text-primary">
          <p className="font-semibold">How this works</p>
          <p className="mt-1">
            MiZanova is made by{' '}
            <strong className="font-semibold">Special Miles</strong>, who check
            every specialist&rsquo;s registration and screening before schools
            can engage them.
          </p>
          <p className="mt-2">
            Approval admits you to the network — it does not attach you to a
            school. Schools engage you separately, and your account is created
            then.
          </p>
        </div>

        <h2 className="pt-2 text-lg font-semibold text-foreground">About you</h2>

        <FormField
          label="Full name"
          hint="As it appears on your registration and your WWCC."
          required
          autoComplete="name"
          value={form.fullName}
          onChange={(e) => set('fullName', e.target.value)}
        />

        <FormField
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
        />

        <FormField
          label="Phone"
          hint="Optional."
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
        />

        <FormField
          label="Date of birth"
          hint="Needed to verify your Working With Children Check — the check is confirmed with your name, date of birth and number together. It is visible only to Special Miles staff and is never shown to a school."
          type="date"
          required
          autoComplete="bday"
          value={form.dateOfBirth}
          onChange={(e) => set('dateOfBirth', e.target.value)}
        />

        <h2 className="pt-4 text-lg font-semibold text-foreground">
          Your practice
        </h2>

        <div>
          <label
            htmlFor="profession"
            className="block text-sm font-semibold text-foreground"
          >
            Profession
          </label>
          <select
            id="profession"
            required
            value={form.profession}
            onChange={(e) => set('profession', e.target.value as Profession)}
            className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
          >
            <option value="">Choose one…</option>
            {Object.entries(PROFESSIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Only when it is needed. "Other" alone tells a reviewer nothing, and
            they cannot check a register they have not been told the name of. */}
        {form.profession === 'other' && (
          <FormField
            label="What is your profession?"
            required
            value={form.professionOther}
            onChange={(e) => set('professionOther', e.target.value)}
          />
        )}

        <FormField
          label="Registering body"
          hint="AHPRA, Speech Pathology Australia, or whoever holds your registration."
          value={form.registrationBody}
          onChange={(e) => set('registrationBody', e.target.value)}
        />

        <FormField
          label="Registration number"
          value={form.registrationNumber}
          onChange={(e) => set('registrationNumber', e.target.value)}
        />

        <FormField
          label="Years of experience"
          type="number"
          min={0}
          max={70}
          inputMode="numeric"
          value={form.yearsExperience}
          onChange={(e) => set('yearsExperience', e.target.value)}
        />

        <FormField
          label="Where do you work?"
          hint="Suburbs, regions, or how far you travel. Free text — say it how you would say it."
          value={form.regions}
          onChange={(e) => set('regions', e.target.value)}
        />

        <div>
          <label
            htmlFor="about"
            className="block text-sm font-semibold text-foreground"
          >
            About your practice
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What you specialise in, and the children you work with best.
          </p>
          <textarea
            id="about"
            rows={5}
            maxLength={4000}
            value={form.about}
            onChange={(e) => set('about', e.target.value)}
            className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
          />
        </div>

        <h2 className="pt-4 text-lg font-semibold text-foreground">Screening</h2>
        <p className="text-sm text-muted-foreground">
          We verify these with the issuing authority rather than asking you to
          upload anything. A Working With Children Check has no card or
          certificate to scan — it is an online record, and checking it at the
          source is both easier for you and better evidence.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="wwcc-state"
              className="block text-sm font-semibold text-foreground"
            >
              WWCC state
            </label>
            <select
              id="wwcc-state"
              value={form.wwccState}
              onChange={(e) => set('wwccState', e.target.value)}
              className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
            >
              {WWCC_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>

          <FormField
            label="WWCC number"
            value={form.wwccNumber}
            onChange={(e) => set('wwccNumber', e.target.value)}
          />
        </div>

        <FormField
          label="WWCC expiry"
          type="date"
          value={form.wwccExpiry}
          onChange={(e) => set('wwccExpiry', e.target.value)}
        />

        <FormField
          label="NDIS Worker Screening Check number"
          hint="Optional, and separate from your WWCC. Only needed if you work with NDIS participants."
          value={form.ndisScreeningNumber}
          onChange={(e) => set('ndisScreeningNumber', e.target.value)}
        />

        {/* ASKED BECAUSE NOT ASKING MADE THE SOFTWARE INVENT ONE. db/048 seeded
            a screening record from every approved application and had no NDIS
            date to seed, so it wrote today plus thirty days — which rendered
            as a real expiry on a child-safety record. db/051 un-invented those
            and this field is why it cannot happen again. */}
        {form.ndisScreeningNumber.trim() !== '' && (
          <FormField
            label="NDIS check expiry"
            hint="When it runs out. We ask because a number with no date cannot be kept current."
            type="date"
            required
            value={form.ndisExpiry}
            onChange={(e) => set('ndisExpiry', e.target.value)}
          />
        )}

        {/* The honeypot — see the enquiry form and the endpoint. */}
        <div aria-hidden="true" className="hidden">
          <label htmlFor="applicant-website">Website</label>
          <input
            id="applicant-website"
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
          {send.isPending ? 'Sending…' : 'Send my application'}
        </button>

        <p className="text-xs text-muted-foreground">
          Your details are used to assess this application and nothing else, and
          are visible only to Special Miles staff. They are stored in Australia,
          on the same infrastructure as the rest of the platform.
        </p>
      </form>
    </PublicLayout>
  )
}
