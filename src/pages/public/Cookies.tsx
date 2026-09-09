import PublicLayout from '../../components/PublicLayout'
import { Lead, NextStep, NotThis, Section } from '../../components/PublicSections'

/**
 * "Cookie Policy" from the Figma footer.
 *
 * SHORT, BECAUSE THE TRUTH IS SHORT. This application sets no advertising or
 * analytics cookies, so the page most sites fill with a table of third-party
 * trackers is four paragraphs.
 *
 * It is worth having anyway: a school's procurement asks, and "we don't track
 * you" is far more convincing when the page explains exactly what IS stored on
 * the device and why it has to be.
 */
export default function Cookies() {
  return (
    <PublicLayout
      title="Cookies and what is on your device"
      subtitle="There is no advertising, no analytics, and nothing that follows you."
    >
      <Lead>
        MiZanova sets no tracking cookies. There is no advertising network, no
        analytics product and no third-party script anywhere in this
        application, which is why you have never been asked to accept anything.
      </Lead>

      <Section title="What is stored on your device, and why">
        <p>
          <strong className="text-foreground">Your sign-in.</strong> Staying
          signed in requires keeping a token in the browser. Signing out removes
          it.
        </p>
        <p>
          <strong className="text-foreground">
            Behaviour logs written offline.
          </strong>{' '}
          Kept on the device only until it uploads, then deleted.
        </p>
        <p>
          <strong className="text-foreground">Your class roster.</strong> Names
          only, so the log form works offline. Nothing else about a child is
          ever stored on the device, because school laptops are shared.
        </p>
        <p>
          <strong className="text-foreground">The application itself.</strong>{' '}
          The screens are cached so the app opens without a connection. That is
          code, not information about anybody.
        </p>
      </Section>

      <Section title="Clearing it">
        <p>
          Signing out clears your session and roster. Clearing site data
          removes everything, including an offline log that has not uploaded —
          so upload first on a bad connection.
        </p>
      </Section>

      <NotThis>
        <p>
          No cookie banner, because there is nothing to consent to. If a
          tracking tool is ever added, this page changes and a banner appears
          with it — in that order.
        </p>
      </NotThis>

      <NextStep
        heading="Procurement asking for detail?"
        body="We will answer specifically about storage, retention and what is held on a device, including where the answer is that nothing has been decided yet."
        to="/enquiry"
        label="Ask us"
      />
    </PublicLayout>
  )
}
