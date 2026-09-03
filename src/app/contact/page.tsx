import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import {
  BRAND,
  CIN,
  GRIEVANCE_OFFICER,
  GSTIN,
  LEGAL_NAME,
  OPERATIONS_ADDRESS,
  REGISTERED_ADDRESS,
  SUPPORT,
  TERMS,
  formatAddress,
  formatWhatsApp,
  whatsappHref,
} from "@/lib/business";
import { pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "Reach Swasthvica — customer care hours, e-mail, phone, registered office address and grievance redressal.";

export const metadata: Metadata = pageMetadata("Contact Us", DESCRIPTION, "/contact");

/**
 * The page a payment reviewer opens first and a customer opens angriest.
 *
 * Everything on it is plain text in the served HTML, deliberately: the phone number is not behind
 * an icon, an image or a click-to-reveal, because card-network compliance sweeps and gateway review
 * crawlers read the markup, and a number they cannot find is a number that is not there. Same
 * reason the legal entity name leads rather than the brand -- Consumer Protection (E-Commerce)
 * Rules 2020 r.4(2)(a) asks for the entity that actually contracts, not the name on the bottle.
 */
export default function ContactPage() {
  return (
    <PolicyPage
      eyebrow="Contact"
      title="Talk to us"
      standfirst="A small team, a real address, and a phone that is answered inside stated hours. Everything below is the whole of it — there is no queue behind it."
      updated={null}
    >
      <h2>Customer care</h2>
      <dl>
        <dt>E-mail</dt>
        <dd>
          <Fact value={SUPPORT.email} />
        </dd>
        <dt>Phone</dt>
        <dd>
          <Fact value={SUPPORT.phone} />
        </dd>
        {/* Only rendered once a number exists -- see SUPPORT.whatsapp. It sits between the phone
            and the hours because it is the channel that ignores them. */}
        {SUPPORT.whatsapp && (
          <>
            <dt>WhatsApp</dt>
            <dd>
              <a href={whatsappHref(SUPPORT.whatsapp)} target="_blank" rel="noreferrer">
                {formatWhatsApp(SUPPORT.whatsapp)}
              </a>
            </dd>
          </>
        )}
        <dt>Hours</dt>
        <dd>{SUPPORT.hours}</dd>
        <dt>Typical reply</dt>
        <dd>Within one business day. Every message is acknowledged within 48 hours.</dd>
      </dl>
      <p>
        Please quote your order number if you have one. It is on the confirmation e-mail and it is
        the fastest way for us to find you.
      </p>

      <h2>The business behind the brand</h2>
      <dl>
        <dt>Legal entity</dt>
        <dd>
          <Fact value={LEGAL_NAME} />
        </dd>
        <dt>Brand</dt>
        <dd>{BRAND}</dd>
        <dt>Registered office</dt>
        <dd>
          <Fact value={formatAddress(REGISTERED_ADDRESS)} />
        </dd>
        {OPERATIONS_ADDRESS && (
          <>
            <dt>Dispatch address</dt>
            <dd>
              <Fact value={formatAddress(OPERATIONS_ADDRESS)} />
            </dd>
          </>
        )}
        <dt>CIN</dt>
        <dd>
          <Fact value={CIN} />
        </dd>
        <dt>GSTIN</dt>
        <dd>
          <Fact value={GSTIN} />
        </dd>
      </dl>
      <p>
        We sell only through this website. We have no retail counter and no walk-in address; the
        registered office above is an office, not a shop.
      </p>

      <h2 id="grievance">Grievance redressal</h2>
      <p>
        If something has gone wrong and ordinary support has not fixed it, it goes to a named person
        with a published clock, under rule 4(4) of the Consumer Protection (E-Commerce) Rules, 2020.
      </p>
      <dl>
        <dt>Grievance Officer</dt>
        <dd>
          <Fact value={GRIEVANCE_OFFICER.name} />
        </dd>
        <dt>Designation</dt>
        <dd>
          <Fact value={GRIEVANCE_OFFICER.designation} />
        </dd>
        <dt>E-mail</dt>
        <dd>
          <Fact value={GRIEVANCE_OFFICER.email} />
        </dd>
        <dt>Phone</dt>
        <dd>
          <Fact value={GRIEVANCE_OFFICER.phone} />
        </dd>
        <dt>Post</dt>
        <dd>
          <Fact value={formatAddress(GRIEVANCE_OFFICER.address)} />
        </dd>
      </dl>
      <p>
        Every complaint is acknowledged within forty-eight (48) hours of receipt and redressed within
        one (1) month from the date of receipt. The full procedure, including how to escalate beyond
        us, is on the <IntentLink href="/grievance">grievance redressal page</IntentLink>.
      </p>

      <h2>Orders, returns and delivery</h2>
      <p>
        Most questions are answered faster by the policy than by us. Dispatch is within{" "}
        {TERMS.dispatchDays} of order confirmation, the return window is {TERMS.returnWindowDays}{" "}
        days from delivery, and approved refunds are processed within {TERMS.refundDays}.
      </p>
      <ul>
        <li>
          <IntentLink href="/shipping">Shipping &amp; delivery policy</IntentLink>
        </li>
        <li>
          <IntentLink href="/refunds">Cancellation &amp; refunds policy</IntentLink>
        </li>
        <li>
          <IntentLink href="/faq">Frequently asked questions</IntentLink>
        </li>
      </ul>

      <h2>Wholesale, stockists and press</h2>
      <p>
        Write to <Fact value={SUPPORT.email} /> with &ldquo;Wholesale&rdquo; or &ldquo;Press&rdquo;
        in the subject line and it reaches the right person directly.
      </p>
    </PolicyPage>
  );
}
