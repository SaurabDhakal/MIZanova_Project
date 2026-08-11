/**
 * Sending email.
 *
 * NO SDK AND NO DEPENDENCY. Resend's client wraps a single HTTP POST, and
 * `fetch` has been built into Node for years. A package added here is a package
 * with a supply-chain surface, in a server holding the service-role key.
 *
 * ---------------------------------------------------------------------------
 * IT NEVER THROWS, AND THAT IS THE WHOLE DESIGN
 * ---------------------------------------------------------------------------
 * Every caller has already done the important thing before it gets here — the
 * invitation exists, the access code exists, and the link is on screen. Email
 * is how the link travels when nobody wants to copy and paste it; it is not
 * what makes the thing real.
 *
 * So a failure to send must not fail the request. Losing an invitation because
 * a mail provider had a bad minute would be the software destroying its own
 * work to report a problem with a side channel.
 *
 * The caller gets `{ sent, error }` and tells the person the truth: created,
 * and here is the link, and the email did not go.
 *
 * ---------------------------------------------------------------------------
 * IT REFUSES TO PRETEND
 * ---------------------------------------------------------------------------
 * With no key configured this reports `sent: false` with a reason. It does not
 * quietly succeed, and it does not log to a console nobody is watching and
 * return true. That is the fault this project has produced seven times and it
 * is not being written an eighth.
 */

const API_KEY = process.env.RESEND_API_KEY
const FROM = process.env.MAIL_FROM

/**
 * ---------------------------------------------------------------------------
 * TWO WAYS TO SEND, AND WHY THE SECOND ONE EXISTS
 * ---------------------------------------------------------------------------
 * Resend cannot email a stranger until a DOMAIN is verified, which needs a
 * domain somebody owns and DNS records. `onboarding@resend.dev` — the shared
 * sandbox sender — is refused for every recipient except the account holder's
 * own address. That is not a misconfiguration to fix, it is the sandbox working
 * as designed, and it blocked inviting any real tester to try the product.
 *
 * SMTP through an ordinary Gmail account has no such restriction: an App
 * Password sends from that mailbox to anybody, about 500 a day, for nothing.
 * The trade is that mail arrives from a person's own address rather than from
 * the product, which is honest for testing and wrong for launch.
 *
 * Whichever is configured wins, SMTP first. Neither is a fallback for the
 * other — a silent fallback is how a send gets reported that never happened.
 */
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com'
const SMTP_PORT = Number(process.env.SMTP_PORT || 465)

/**
 * A `PASTE_…` value is a placeholder somebody has not filled in yet, and this
 * project already treats it as unset everywhere else (server startup, the
 * bundle secret check). Counting it as configured would make `mailConfigured()`
 * say yes and then fail at Gmail with a login error — sending somebody to debug
 * credentials when the real answer is that they have not entered any.
 */
function real(value) {
  return Boolean(value) && !value.startsWith('PASTE_')
}

function usingSmtp() {
  return real(SMTP_USER) && real(SMTP_PASS)
}

/** The bare address out of either `Name <a@b.com>` or `a@b.com`. */
function addressOnly(value) {
  const match = /<([^>]+)>/.exec(value ?? '')
  return (match ? match[1] : (value ?? '')).trim().toLowerCase()
}

/**
 * Gmail rewrites the From header to the authenticated mailbox anyway, so
 * claiming anything else here would put one address in the code and a
 * different one in the inbox.
 */
function smtpFrom() {
  return FROM && !/resend\.dev/i.test(FROM) ? FROM : `MiZanova <${SMTP_USER}>`
}

/**
 * MAIL_FROM claiming an address the SMTP login does not own.
 *
 * Gmail does not refuse this — it silently rewrites the From header to the
 * authenticated mailbox and delivers. So the code says one sender, the
 * recipient sees another, and nothing reports a problem. Exactly the shape of
 * fault this file exists to avoid, so it is named at startup instead.
 *
 * Returns null when there is nothing to say.
 */
export function smtpSenderMismatch() {
  if (!usingSmtp() || !FROM || /resend\.dev/i.test(FROM)) return null
  const claimed = addressOnly(FROM)
  const actual = addressOnly(SMTP_USER)
  if (claimed === actual) return null
  return { claimed, actual }
}

/** Created once, on first use — a connection pool per email would be absurd. */
let transport = null
async function smtpTransport() {
  if (!transport) {
    const { createTransport } = await import('nodemailer')
    transport = createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  }
  return transport
}

/**
 * Resend's shared testing sender, used by every trial account on the platform.
 *
 * WORTH DETECTING RATHER THAN ASSUMING. Mail from it is ACCEPTED by the API —
 * 200, with a message id — and then filtered as spam by most receiving
 * providers, because thousands of unrelated senders share the address. "The
 * provider took it" and "a person will read it" are different facts, and this
 * is the configuration where they come apart.
 */
export function usingTestSender() {
  // SMTP sends from a real mailbox, so the shared-sender spam problem this
  // detects does not apply to it.
  if (usingSmtp()) return false
  return /resend\.dev/i.test(FROM ?? '')
}

/**
 * Where enquiries and applications are announced.
 *
 * IT NO LONGER FALLS BACK TO THE TEST SENDER. It used to fall back to
 * MAIL_FROM on the reasoning that the sender is "the one address we know is
 * ours" — true for a real domain, and false for `onboarding@resend.dev`, which
 * is not a mailbox anybody can open. Every enquiry notification was being sent
 * there and reported as sent.
 *
 * Null means nobody is being told, and the server says so at startup rather
 * than posting into a void and calling it delivered.
 */
export const ENQUIRIES_TO =
  process.env.ENQUIRIES_TO ||
  (usingSmtp() ? SMTP_USER : usingTestSender() ? null : FROM)

/** Whether email can be sent at all, so a screen can say so before trying. */
export function mailConfigured() {
  return usingSmtp() || Boolean(API_KEY && FROM)
}

/** Named in startup output and in the diagnostics screen, so "it sent" can be
 *  traced to which provider actually took it. */
export function mailProvider() {
  if (usingSmtp()) return `SMTP (${SMTP_HOST} as ${SMTP_USER})`
  if (API_KEY && FROM) return `Resend (${FROM})`
  return 'not configured'
}

/**
 * @returns {Promise<{ sent: boolean, id?: string, error?: string }>} never rejects
 *
 * The provider's message id comes back with it. It used to be discarded, which
 * meant a send could never be traced afterwards — "it says it sent" was the
 * end of what anybody could find out. It is the only handle Resend offers on a
 * message after the fact.
 */
export async function sendMail({ to, subject, text }) {
  if (!mailConfigured()) {
    return {
      sent: false,
      error:
        'Email is not configured on this server. Set SMTP_USER and SMTP_PASS (a Gmail App Password), or RESEND_API_KEY and MAIL_FROM, in .env.local.',
    }
  }

  if (usingSmtp()) {
    try {
      const mailer = await smtpTransport()
      const info = await mailer.sendMail({
        from: smtpFrom(),
        to,
        subject,
        text,
      })
      return { sent: true, id: info.messageId }
    } catch (err) {
      // Gmail's own words are worth keeping: "Username and Password not
      // accepted" means an App Password was not used, and that needs a
      // completely different action from a network failure.
      return {
        sent: false,
        error: (err instanceof Error ? err.message : 'Unknown error').slice(0, 300),
      }
    }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
    })

    if (!response.ok) {
      // Read the provider's own words. "Domain not verified" and "invalid
      // address" need completely different actions, and a generic failure
      // message would send somebody looking in the wrong place.
      const body = await response.text()
      let detail = body
      try {
        detail = JSON.parse(body).message ?? body
      } catch {
        /* not JSON — the raw text is more use than nothing */
      }
      return { sent: false, error: `${response.status}: ${detail}`.slice(0, 300) }
    }

    const body = await response.json().catch(() => ({}))
    return { sent: true, id: body.id }
  } catch (err) {
    // The network, DNS, a proxy. Still not the caller's problem to fail over.
    return { sent: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * PLAIN TEXT ONLY, deliberately.
 *
 * A text email arrives, renders everywhere, and is far less likely to be
 * treated as bulk mail than a first message from an unknown sender full of
 * markup. Password reset emails from serious products look like this for the
 * same reason.
 *
 * ponytail: an HTML part is the upgrade path if a school ever asks for
 * branding. It is a second field on the same request, not a rewrite.
 */
export function invitationEmail({ schoolName, roleLabel, acceptUrl }) {
  return {
    subject: `${schoolName} has invited you to MiZanova`,
    text: [
      `${schoolName} has invited you to join MiZanova as a ${roleLabel}.`,
      '',
      'Open this link to set up your account:',
      acceptUrl,
      '',
      'The link works once and expires in 14 days. It only works for the',
      'address this message was sent to.',
      '',
      'If you were not expecting this, you can ignore it — nothing happens',
      'until the link is opened.',
    ].join('\n'),
  }
}

/**
 * Told to Special Miles, never to the enquirer.
 *
 * NOTHING IS SENT TO THE ADDRESS TYPED INTO THE FORM. Anyone can type anyone's
 * address there, so a "thanks for your enquiry" reply would let a stranger use
 * MiZanova to mail somebody who never asked to hear from it. The visitor is
 * told on screen instead. Only an address whose holder has proved they hold it
 * — an invitation, a guardian code — gets email from us.
 *
 * The enquirer's own words are included because a reply written without them
 * is a worse reply. They are safe here for a reason worth naming: this is plain
 * text going to one known internal address, so there is no markup to inject
 * into and no stranger receiving it.
 */
export function enquiryEmail({
  kind,
  planLabel,
  organisationName,
  contactName,
  contactEmail,
  contactPhone,
  contactRole,
  studentCount,
  message,
  reviewUrl,
}) {
  const who = kind === 'school' ? organisationName : contactName
  return {
    subject: `MiZanova enquiry: ${who}${planLabel ? ` — ${planLabel}` : ''}`,
    text: [
      kind === 'school'
        ? `${organisationName} has asked about MiZanova.`
        : `${contactName} has asked about a family subscription.`,
      '',
      `Name:     ${contactName}${contactRole ? ` (${contactRole})` : ''}`,
      `Email:    ${contactEmail}`,
      ...(contactPhone ? [`Phone:    ${contactPhone}`] : []),
      ...(studentCount ? [`Students: ${studentCount}`] : []),
      ...(planLabel ? [`Plan:     ${planLabel}`] : []),
      '',
      ...(message ? ['What they said:', message, ''] : []),
      'Reply to them directly. Triage it here:',
      reviewUrl,
    ].join('\n'),
  }
}

/** Told to Special Miles when somebody applies to join the network. */
export function specialistApplicationEmail({
  fullName,
  professionLabel,
  email,
  phone,
  registrationBody,
  registrationNumber,
  yearsExperience,
  regions,
  reviewUrl,
}) {
  return {
    subject: `Specialist application: ${fullName} — ${professionLabel}`,
    text: [
      `${fullName} has applied to join MiZanova as a specialist.`,
      '',
      `Profession:   ${professionLabel}`,
      `Email:        ${email}`,
      ...(phone ? [`Phone:        ${phone}`] : []),
      ...(registrationBody
        ? [`Registration: ${registrationBody} ${registrationNumber ?? ''}`.trim()]
        : []),
      ...(yearsExperience ? [`Experience:   ${yearsExperience} years`] : []),
      ...(regions ? [`Works in:     ${regions}`] : []),
      '',
      // The screening details are deliberately NOT in this email. They are the
      // most sensitive fields in the product and email is not where they should
      // sit — the reviewer opens the queue, where access is checked.
      'Their date of birth, WWCC and registration numbers are on the review',
      'screen rather than in this email. Check them at the source:',
      '',
      '  WWCC   https://www.service.nsw.gov.au/verify-working-with-children',
      '  AHPRA  https://www.ahpra.gov.au/registration/registers-of-practitioners',
      '',
      reviewUrl,
    ].join('\n'),
  }
}

/**
 * Told to the APPLICANT when a decision is made.
 *
 * Unlike an enquiry confirmation, this is safe to send: a person at Special
 * Miles has read the application and chosen to send it. It is not an automatic
 * reply to an address a stranger typed, which is what would make this product a
 * way to mail people who never asked to hear from it.
 */
export function applicationDecisionEmail({ fullName, status, note }) {
  const wording = {
    approved: {
      subject: 'You have been approved — MiZanova',
      body: [
        `Good news, ${fullName}. Your application to join MiZanova as a`,
        'specialist has been approved.',
        '',
        'Schools using MiZanova can now engage you. When one does, they send',
        'you an invitation by email and your account is created then — already',
        'attached to that school, with nothing to fill in.',
        '',
        'There is nothing you need to do in the meantime.',
      ],
    },
    more_needed: {
      subject: 'We need a little more — MiZanova',
      body: [
        `Thank you for applying, ${fullName}. Before we can finish reviewing`,
        'your application we need something else from you.',
        '',
        'Your application stays open — you do not need to apply again.',
      ],
    },
    declined: {
      subject: 'Your application — MiZanova',
      body: [
        `Thank you for applying, ${fullName}. We are not able to admit you to`,
        'the MiZanova specialist network at this time.',
        '',
        'If your circumstances change you are welcome to apply again.',
      ],
    },
  }[status]

  if (!wording) return null

  return {
    subject: wording.subject,
    text: [
      ...wording.body,
      // The reviewer's own words, because a decision without a reason is not
      // one the person can act on. Required by a check constraint for exactly
      // the two outcomes where it matters.
      ...(note ? ['', '---', note] : []),
      '',
      'The MiZanova team at Special Miles',
    ].join('\n'),
  }
}

/**
 * Sent to the person holding a check that is running out.
 *
 * Safe to send for the same reason as a decision letter: a person at Special
 * Miles read the record and chose to send it. It is not an automatic reply to
 * an address a stranger typed.
 *
 * IT ASKS FOR A REPLY RATHER THAN LINKING ANYWHERE. There is nowhere for a
 * specialist to sign in and update this — approval creates no account, and most
 * of these people have none. A link to a page that would refuse them is worse
 * than an address to write to.
 */
export function screeningReminderEmail({ fullName, checkLabel, expiresOn, daysLeft }) {
  /*
   * NO DATE IS ITS OWN CASE, and it was not handled when db/051 made the expiry
   * nullable. The arithmetic ran on null and this went to a real practitioner:
   *
   *   "Our record of your NDIS Worker Screening Check expires in null days
   *    (1 January 1970)."
   *
   * A person asked to act on that has no idea what is being claimed about them.
   * The honest version is shorter and asks for exactly the missing thing.
   */
  const unknown = daysLeft === null || daysLeft === undefined || !expiresOn

  const when = unknown
    ? null
    : daysLeft < 0
      ? `expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} ago`
      : daysLeft === 0
        ? 'expires today'
        : `expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`

  return {
    subject: unknown
      ? `We need the expiry date for your ${checkLabel} — MiZanova`
      : daysLeft < 0
        ? `Your ${checkLabel} has expired — MiZanova`
        : `Your ${checkLabel} expires soon — MiZanova`,
    text: [
      `Hello ${fullName || 'there'},`,
      '',
      ...(unknown
        ? [
            `We hold your ${checkLabel} number, but no expiry date for it, so we`,
            'cannot tell whether it is still current.',
            '',
            'Please reply with the date it runs out.',
          ]
        : [
            `Our record of your ${checkLabel} ${when} (${expiresOn}).`,
            '',
            'When you have renewed it, reply to this message with the new number',
            'and expiry date and we will update our records.',
          ]),
      '',
      // Said plainly, because the alternative is somebody assuming the worst
      // and cancelling sessions they did not need to.
      'Nothing has changed about your access in the meantime. We are asking',
      'because schools rely on this record being current, not because anything',
      'has been suspended.',
      '',
      'If you have already renewed and told us, please ignore this.',
      '',
      'The MiZanova team at Special Miles',
    ].join('\n'),
  }
}

export function guardianCodeEmail({ childName, schoolName, code, link }) {
  return {
    subject: `${schoolName}: your access code for ${childName}`,
    text: [
      `${schoolName} is sharing ${childName}'s progress with you on MiZanova.`,
      '',
      'Open this link to set up your account:',
      link,
      '',
      `Or go to the site and enter this code: ${code}`,
      '',
      'The code works once and expires in 30 days. It only works for the',
      'address this message was sent to, which is what stops somebody else',
      "reaching your child's record.",
      '',
      'If you were not expecting this, please tell the school.',
    ].join('\n'),
  }
}
