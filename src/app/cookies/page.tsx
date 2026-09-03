import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import { DATA_PROTECTION_OFFICER, PSP, STORAGE } from "@/lib/business";
import ConsentControls from "@/components/dom/legal/ConsentControls";
import { pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "Swasthvica loads no analytics or advertising script at all. Here is the complete list of what this site stores on your device, what each item does, how to change your answer, and how to clear it.";

export const metadata: Metadata = pageMetadata("Cookie Policy", DESCRIPTION, "/cookies");

/**
 * The DPDP Rules bring the substantive consent duties in from 2027, so nothing in force today
 * requires the notice this site now shows. It shows one anyway, because the site is built to start
 * measuring at launch and asking afterwards is not a thing you can do honestly.
 *
 * What the page must never become is the usual fiction. Right now no analytics or advertising
 * script exists in this bundle: src/lib/analytics.ts shapes the events and pushes them to a
 * dataLayer that nothing reads, and holds them in memory -- never on disk -- while the answer is
 * outstanding. The copy below says exactly that, and it has to be re-read the day a tag is added.
 * The table is generated from src/lib/business.ts, which was written against the code.
 */
export default function CookiesPage() {
  return (
    <PolicyPage
      eyebrow="Legal"
      title="Cookies & local storage"
      standfirst="This site loads no analytics script, no advertising pixel and no tracking cookie. It remembers your basket, it remembers the answer you gave to the notice, and the payment provider keeps your payment session together. That is the whole list."
    >
      <h2>Why you were asked</h2>
      <p>
        A consent notice exists to obtain permission before anything optional runs. At the time of
        writing there is nothing optional running at all: no Google Analytics, no tag manager, no
        advertising or social pixel, no fingerprinting, and nothing that follows you to another site.
        The measurement this site is built for has not been switched on.
      </p>
      <p>
        We ask first anyway, because the alternative is to start measuring and ask afterwards. While
        your answer is outstanding, the events the site would one day count are held in the memory of
        the tab you are reading this in — never written to your device, never sent anywhere — and
        they are thrown away the moment you refuse.
      </p>
      <p>
        The three items this site stores are strictly necessary: your basket, your answer to this
        notice, and the order you just placed on its way to the confirmation screen. None of them is
        a tracker, and none of them leaves your browser.
      </p>

      <ConsentControls />

      <h2>Everything stored on your device</h2>
      <dl>
        {STORAGE.map((s) => (
          <div key={s.name}>
            <dt>
              {s.name} — {s.kind.toLowerCase()}
            </dt>
            <dd>
              <strong>{s.category}.</strong> {s.purpose} {s.party}. Lifetime: {s.life.toLowerCase()}
            </dd>
          </div>
        ))}
      </dl>
      <p>
        The {PSP.name} cookies are set inside the payment window when you open it, by the provider
        rather than by us, and are governed by their own policy. They are necessary to complete a
        payment and to detect fraud; a payment cannot be taken without them.
      </p>

      <h2>What we do not use</h2>
      <ul>
        <li>No analytics or measurement cookies, and no analytics script of any kind today.</li>
        <li>No advertising, retargeting or conversion pixels.</li>
        <li>No social-network embeds that read your session on another site.</li>
        <li>No cross-site identifiers, device fingerprinting or session recording.</li>
        <li>No data sold or shared with data brokers.</li>
      </ul>
      <p>
        Our hosting provider keeps ordinary server logs — IP address, browser, page, timestamp — for
        security. Those are not cookies and are not stored on your device. They are described in the{" "}
        <IntentLink href="/privacy">privacy policy</IntentLink>.
      </p>

      <h2>Clearing it</h2>
      <p>
        &ldquo;Ask me again&rdquo; above forgets your answer to this notice. Emptying your basket
        removes the stored basket. To clear everything, use your browser&rsquo;s
        &ldquo;clear site data&rdquo; or &ldquo;cookies and other site data&rdquo; option for this
        site — in Chrome and Edge under Settings, Privacy and security; in Safari under Settings,
        Privacy, Manage website data; in Firefox under Settings, Privacy &amp; Security, Cookies and
        Site Data.
      </p>
      <p>
        You can also block storage entirely in your browser settings, or browse privately. The site
        will work, but your basket will not survive a reload and the checkout may not open.
      </p>

      <h2>Changes and questions</h2>
      <p>
        If we ever add analytics, this page changes before the script ships, and it will say what the
        script is, who runs it and what it records. Your answer above is asked for again whenever the
        list of what we would run changes. Questions go to <Fact value={DATA_PROTECTION_OFFICER.email} />.
      </p>
    </PolicyPage>
  );
}
