/**
 * Does email actually send?
 *
 *   npm run mail-check your.address@example.com
 *
 * WHY THIS EXISTS. Every other way of finding out involves creating a real
 * invitation for a real person and waiting to see whether anything arrives —
 * and if nothing does, there is no way to tell a wrong key from a wrong sender
 * address from a provider outage. This asks the provider directly and prints
 * what it says back.
 *
 * IT REPORTS FAILURE TO SEND AS FAILURE. Not "attempted", not "queued". The
 * one thing this script must never do is what the bundle secret check, the
 * key-rotation probe, the health endpoint and four other things in this
 * project have each done once: report success without having checked.
 */
import { loadEnv } from './lib/env.mjs'

const env = loadEnv()
for (const [name, value] of Object.entries(env)) {
  if (value !== undefined) process.env[name] = value
}

const { mailConfigured, mailProvider, smtpSenderMismatch, sendMail } =
  await import('../server/mail.js')

/**
 * Everything lives in here so a failure can `return` rather than `process.exit`.
 *
 * `process.exit()` tears the process down while fetch still holds a keep-alive
 * socket, and libuv on Windows reports that as
 * "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" — printed directly
 * AFTER a PASS, leaving somebody to work out which of the two lines to believe.
 * A check whose own output is ambiguous is not much of a check.
 */
async function main() {
  const to = process.argv[2]
  if (!to) {
    console.error('Which address? Usage: npm run mail-check you@example.com')
    return 1
  }

  if (!mailConfigured()) {
    console.log('NOT CONFIGURED — no way to send is set up.\n')
    console.log('This is not a failure of the app. Invitations and access codes')
    console.log('still work; their links are copied by hand instead of emailed.')
    console.log('\nTo reach ANY address, use a Gmail App Password:')
    console.log('  1. On that Google account, turn on 2-Step Verification')
    console.log('  2. myaccount.google.com/apppasswords — create one')
    console.log('  3. In .env.local set SMTP_USER, SMTP_PASS and MAIL_FROM,')
    console.log('     all three naming the SAME address')
    console.log('  4. Run this again')
    console.log('\nResend is the alternative, but its sandbox sender delivers only')
    console.log('to the account holder. Reaching strangers needs a verified domain.')
    return 1
  }

  console.log(`Sending via ${mailProvider()}`)

  /*
   * Named BEFORE the send, not after. Gmail does not refuse a From it does not
   * own — it rewrites the header and delivers, so the result of the send looks
   * like a clean pass and the mismatch is invisible in it.
   */
  const mismatch = smtpSenderMismatch()
  if (mismatch) {
    console.log(
      `\nMAIL_FROM says ${mismatch.claimed} but the login is ${mismatch.actual}.` +
        `\nGmail will rewrite it, so this will arrive from ${mismatch.actual}.`,
    )
  }

  console.log(`\nSending a test message to ${to} …\n`)

  const result = await sendMail({
    to,
    subject: 'MiZanova: email is working',
    text: [
      'This is the test message from `npm run mail-check`.',
      '',
      'If you are reading it, invitations and guardian access codes will reach',
      'the people they are addressed to instead of having to be copied by hand.',
    ].join('\n'),
  })

  if (result.sent) {
    console.log('PASS — the provider accepted the message.')
    console.log('\nCheck the inbox. Accepted is not the same as delivered: a')
    console.log('message can still be refused by the receiving server or filed')
    console.log('as spam, and no API can tell you that.')
    return 0
  }

  console.log(`FAIL — ${result.error}\n`)

  /*
   * Gmail's own words, matched first, because they are specific enough to give
   * a specific instruction. "Username and Password not accepted" almost always
   * means an ordinary account password was pasted where an App Password was
   * wanted — a mistake nothing else in this output would explain.
   */
  if (/535|BadCredentials|Username and Password not accepted/i.test(result.error ?? '')) {
    console.log('Gmail rejected the login. Two causes, in order of likelihood:')
    console.log('  1. SMTP_PASS is the account password, not an App Password.')
    console.log('     They look different: an App Password is 16 letters, no digits.')
    console.log('     Make one at myaccount.google.com/apppasswords')
    console.log('  2. 2-Step Verification is off, so App Passwords do not exist yet.')
  } else if (/domain|from|sender/i.test(result.error ?? '')) {
    console.log('That reads like a sender problem. On Resend, either verify a')
    console.log('domain or send only to the address that owns the account. On')
    console.log('Gmail, MAIL_FROM must name the same address as SMTP_USER.')
  } else if (/api|key|unauthor|401|403/i.test(result.error ?? '')) {
    console.log('That reads like the key. Check RESEND_API_KEY in .env.local, and')
    console.log('remember the server reads that file at startup — restart it.')
  }
  return 1
}

process.exitCode = await main()
