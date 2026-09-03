import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import {
  DATA_PROTECTION_OFFICER,
  LEGAL_NAME,
  PROCESSORS,
  PSP,
  REGISTERED_ADDRESS,
  SUPPORT,
  formatAddress,
} from "@/lib/business";
import { pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "What Swasthvica collects, why, who it is shared with, how long it is kept, how it is secured, and how to have it corrected or erased.";

export const metadata: Metadata = pageMetadata("Privacy Policy", DESCRIPTION, "/privacy");

/**
 * Two regimes apply at once and the page has to satisfy both without reading as two documents.
 *
 * Rule 4 of the Information Technology (Reasonable Security Practices ... Sensitive Personal Data or
 * Information) Rules, 2011 is in force today and wants five things: the practices in plain terms,
 * the data collected, the purpose, the recipients, and the security practices. Rules 5(3), 5(4),
 * 5(6), 5(7) and 5(9) add the collection notice, the retention limit, review and correction,
 * withdrawal of consent, and a named grievance officer with a one-month clock.
 *
 * The Digital Personal Data Protection Act, 2023 sits on top: the notice under rule 3, breach
 * intimation under rule 7, a published contact under rule 9, a route to exercise rights under rule
 * 14, and transfer conditions under rule 15. Its substantive obligations phase in from 2027, but
 * writing to them now costs nothing and rewriting later costs a review cycle.
 *
 * One rule is absolute: never claim PCI-DSS. We never see a card number. The claim belongs to the
 * payment provider and is attributed to them everywhere it appears.
 */
export default function PrivacyPage() {
  return (
    <PolicyPage
      eyebrow="Legal"
      title="Privacy policy"
      standfirst="We ask for the least we can and keep it for the shortest time that still lets us deliver an order and honour a return. This page says exactly what that means."
    >
      <h2>Who is responsible for your data</h2>
      <p>
        <Fact value={LEGAL_NAME} />, of <Fact value={formatAddress(REGISTERED_ADDRESS)} />, is the
        data fiduciary for the information described here. Questions, requests and complaints about
        personal data go to <Fact value={DATA_PROTECTION_OFFICER.name} />,{" "}
        <Fact value={DATA_PROTECTION_OFFICER.designation} />, at{" "}
        <Fact value={DATA_PROTECTION_OFFICER.email} /> or <Fact value={DATA_PROTECTION_OFFICER.phone} />.
      </p>

      <h2>What we collect</h2>
      <p>Only what an order needs, and nothing gathered for its own sake.</p>
      <dl>
        <dt>Contact and delivery details</dt>
        <dd>
          Your name, e-mail address, phone number, and the delivery and billing addresses with pin
          code. Given by you at checkout. A courier cannot deliver without them.
        </dd>

        <dt>Order details</dt>
        <dd>
          What you bought, the amount, the date, the order number, and the dispatch and delivery
          status. Created by the transaction itself and kept as the record of it.
        </dd>

        <dt>Payment status</dt>
        <dd>
          Whether a payment succeeded, its reference number, the method used, and the last four
          digits of a card where the provider returns them.{" "}
          <strong>
            We never receive, see or store your full card number, expiry date, CVV, UPI PIN, netbanking
            password or any one-time password.
          </strong>{" "}
          Those go directly to {PSP.name}.
        </dd>

        <dt>Support correspondence</dt>
        <dd>
          The messages you send us and our replies, with any photographs you attach to a damage or
          defect claim. Kept so a ticket can be picked up by whoever answers it next.
        </dd>

        <dt>Technical data</dt>
        <dd>
          The ordinary server log every website receives — IP address, browser and device type, the
          page requested, and when. Used for security and to keep the site working, not to build a
          profile of you.
        </dd>

        <dt>Anything you volunteer about your health, hair or skin</dt>
        <dd>
          If you tell us in a message that you have a scalp condition, an allergy or a medical
          history, that is <strong>sensitive personal data</strong> and it is treated as such: used
          only to answer that message, never used to target anything at you, and deleted with the
          ticket. We do not ask for it, and you do not need to give it to buy anything.
        </dd>
      </dl>
      <p>
        We do not run a quiz, a skin analyser or a concern selector that records answers. We do not
        buy data about you from anyone, and we do not enrich what you give us with data from
        elsewhere.
      </p>

      <h2>Children</h2>
      <p>
        This site is not for children. We do not knowingly collect data from anyone under 18. If you
        believe a child&rsquo;s data has reached us, write to{" "}
        <Fact value={DATA_PROTECTION_OFFICER.email} /> and we will delete it.
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li>To take payment, dispatch your order, and let you and the courier track it.</li>
        <li>To send transactional messages — order confirmation, dispatch, delivery, refund. These are part of the order and are not marketing.</li>
        <li>To answer your questions and handle returns, refunds and complaints.</li>
        <li>To meet legal duties: tax and GST records, and the invoices we are required to keep.</li>
        <li>To detect and prevent fraud and abuse of the site.</li>
        <li>To send you offers and news, <strong>only if you have separately asked us to</strong>. Every such message carries a one-click unsubscribe, and unsubscribing never affects an order.</li>
      </ul>
      <p>
        We do not sell your data. We do not rent it, trade it, or share it with advertisers or data
        brokers. There is no advertising pixel on this site.
      </p>

      <h2>Who else sees it</h2>
      <p>
        Only the parties below, only the fields their job needs, and only under contracts that bind
        them to use it for that and nothing else.
      </p>
      <dl>
        {PROCESSORS.map((p) => (
          <div key={p.name}>
            <dt>
              <Fact value={p.name} />
            </dt>
            <dd>
              {p.purpose} Data location: <Fact value={p.where} />.
            </dd>
          </div>
        ))}
      </dl>
      <p>
        Beyond these, we disclose data only where the law requires it — to a court, a regulator, or a
        government agency acting under lawful authority — or where it is necessary to establish or
        defend a legal claim. If the business is ever sold or merged, customer records may transfer
        with it, and this policy travels with them.
      </p>

      <h2>Data that leaves India</h2>
      <p>
        Some of the providers above process data outside India, as marked. Where that happens, the
        transfer is made under contractual terms requiring protection at least equal to what is
        described here, to a country not restricted by the Central Government, and only for the
        purposes set out above. Your order and payment records themselves are held in India.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li><strong>Order, invoice and payment records:</strong> eight years from the end of the financial year, because tax and company law require it.</li>
        <li><strong>Delivery addresses and phone numbers:</strong> for the life of the order plus the return window, then reduced to the invoice record.</li>
        <li><strong>Support tickets, including anything you told us about your health:</strong> 12 months from closure, then deleted.</li>
        <li><strong>Marketing consent records:</strong> until you withdraw consent, and for 12 months after that as proof that you did.</li>
        <li><strong>Server logs:</strong> 90 days.</li>
      </ul>
      <p>
        We do not keep personal data for longer than the purpose it was collected for, and we do not
        keep it &ldquo;in case it is useful&rdquo;.
      </p>

      <h2>How it is protected</h2>
      <p>
        The site is served only over HTTPS. Access to customer records is restricted to the people
        who need it to fill an order or answer a ticket, over individual accounts with two-factor
        authentication. Our security practices follow the standards contemplated by rule 8 of the
        SPDI Rules, and are reviewed when the stack changes.
      </p>
      <p>
        Card data is handled entirely by {PSP.name}, who are certified to the PCI-DSS standard. That
        certification is theirs, not ours — we make no PCI claim of our own because no card number
        ever reaches our systems.
      </p>
      <p>
        No system is perfectly secure. If a breach affects your data, we will tell you and the Data
        Protection Board without delay, describing what happened, what it means for you, and what we
        are doing about it.
      </p>

      <h2>What you can ask us to do</h2>
      <dl>
        <dt>See what we hold</dt>
        <dd>A summary of your personal data, what it is used for, and who it has been shared with.</dd>

        <dt>Correct it</dt>
        <dd>Fix anything inaccurate, complete anything missing, update anything stale.</dd>

        <dt>Erase it</dt>
        <dd>
          Delete it, except records we are legally required to retain, such as tax invoices. We will
          tell you which ones those are.
        </dd>

        <dt>Withdraw consent</dt>
        <dd>
          As easily as you gave it. Unsubscribe from any marketing message, or write to us. Withdrawing
          consent does not undo what was lawfully done before it.
        </dd>

        <dt>Nominate someone</dt>
        <dd>Name a person to exercise these rights for you if you die or become incapacitated.</dd>

        <dt>Complain</dt>
        <dd>Raise a grievance and have it answered, without paying anything for it.</dd>
      </dl>
      <p>
        Write to <Fact value={DATA_PROTECTION_OFFICER.email} /> from the e-mail address the order was
        placed with, or include the order number, so we can find your records without exposing anyone
        else&rsquo;s. We answer within <strong>one month</strong>, and in every case within 90 days.
        There is no charge.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        This site does not set advertising or analytics cookies. It stores your basket on your own
        device and nothing else, and the payment provider sets its own cookies when you open the
        checkout. The full list, what each item does and how to clear it are on the{" "}
        <IntentLink href="/cookies">cookies page</IntentLink>.
      </p>

      <h2>If you are not satisfied</h2>
      <p>
        Escalate to our grievance officer using the route and the timelines on the{" "}
        <IntentLink href="/grievance">grievance redressal page</IntentLink>. You may also complain to the Data
        Protection Board of India once it is operational, and nothing on this page limits any right
        you have under the Information Technology Act, 2000, the Digital Personal Data Protection
        Act, 2023 or the Consumer Protection Act, 2019.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes materially we will say so on this page and, where the change affects
        how we use data you have already given us, tell you directly. The date at the top is when it
        last changed. Other terms are in the{" "}
        <IntentLink href="/terms">terms and conditions</IntentLink>; how to reach a human is on the{" "}
        <IntentLink href="/contact">contact page</IntentLink>, and support answers on{" "}
        <Fact value={SUPPORT.email} />.
      </p>
    </PolicyPage>
  );
}
