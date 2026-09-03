import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import { SUPPORT, TERMS } from "@/lib/business";
import { formatINR } from "@/lib/products";
import { pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "Delivery times, returns, payment, storage and shelf life, and what to do when something goes wrong — the questions we are actually asked.";

export const metadata: Metadata = pageMetadata("FAQ", DESCRIPTION, "/faq");

/**
 * Written for people, not for a rich result.
 *
 * Deliberately NO FAQPage structured data: Google retired the FAQ rich result on 7 May 2026 and
 * pulled the search appearance, the rich-result report and Rich Results Test support in
 * June 2026, so the markup now buys nothing and is one more thing
 * to keep in sync with the prose. Every answer here that has a policy behind it links to the policy
 * and quotes it from src/lib/business.ts rather than restating it, because the version a customer
 * reads on this page and the version we are bound by must never be able to disagree.
 */
export default function FaqPage() {
  return (
    <PolicyPage
      eyebrow="Help"
      title="Questions"
      standfirst="The things people ask most. If yours is not here, write to us — a person answers."
      updated={null}
    >
      <h2>Ordering and payment</h2>
      <dl>
        <dt>Do I need an account?</dt>
        <dd>No. Add to the basket and check out with an e-mail address and a delivery address.</dd>

        <dt>How can I pay?</dt>
        <dd>
          Cards, UPI, net banking and wallets, through our payment provider.{" "}
          {TERMS.codAvailable
            ? "Cash on delivery is available on serviceable pin codes."
            : "We do not offer cash on delivery — all orders are prepaid."}{" "}
          Prices are in Indian Rupees and include all taxes; see <IntentLink href="/pricing">pricing</IntentLink>.
        </dd>

        <dt>Is my card safe?</dt>
        <dd>
          Your card details never reach us. They go directly to the payment provider, who is PCI-DSS
          certified and tokenises them under the RBI framework. We see only whether the payment
          succeeded and the last four digits.
        </dd>

        <dt>My payment failed but money left my account.</dt>
        <dd>
          Failed payments are auto-reversed by the bank, usually within 5 to 7 business days. If it
          has been longer, send us the order number and the bank reference and we will chase it with
          the provider.
        </dd>

        <dt>Can I change or cancel an order?</dt>
        <dd>
          Yes, free of charge, any time before dispatch — write to <Fact value={SUPPORT.email} /> with
          the order number. There is no cancellation fee. See{" "}
          <IntentLink href="/refunds">cancellations and refunds</IntentLink>.
        </dd>
      </dl>

      <h2>Delivery</h2>
      <dl>
        <dt>How long will it take?</dt>
        <dd>
          Dispatched within {TERMS.dispatchDays}, then {TERMS.deliveryMetro} to metro cities,{" "}
          {TERMS.deliveryRest} elsewhere, and {TERMS.deliveryRemote} to the North-East, Jammu &amp;
          Kashmir, Ladakh and the islands.
        </dd>

        <dt>What does shipping cost?</dt>
        <dd>
          {formatINR(TERMS.shippingFlat)} flat per order, and free above{" "}
          {formatINR(TERMS.freeShippingAbove)}.
        </dd>

        <dt>Do you ship outside India?</dt>
        <dd>Not yet. We deliver within India only.</dd>

        <dt>Where is my parcel?</dt>
        <dd>
          The dispatch e-mail carries the courier name and the tracking number. If tracking has not
          moved for three days, send us the order number and we will find out why. Full detail on the{" "}
          <IntentLink href="/shipping">shipping page</IntentLink>.
        </dd>

        <dt>It arrived damaged or leaking.</dt>
        <dd>
          Tell us within 48 hours with photographs of the parcel and the bottle. We replace it or
          refund you in full, and we pay both legs of the shipping. You do not need to argue about
          this.
        </dd>
      </dl>

      <h2>Returns</h2>
      <dl>
        <dt>Can I return something I have changed my mind about?</dt>
        <dd>
          Within {TERMS.returnWindowDays} days, if it is unopened and the seal is intact. The return
          shipping is yours in that case.
        </dd>

        <dt>What if it is defective or not what I ordered?</dt>
        <dd>
          Then it goes back at our cost, opened or not — defective, damaged, wrong, short, expired,
          spurious, not as described, or delivered late. We arrange the pickup.
        </dd>

        <dt>When do I get my money?</dt>
        <dd>
          The refund is initiated within {TERMS.refundDays} of the return being received or the
          cancellation confirmed, back to the instrument you paid with. Your bank then takes its own
          two to seven days.
        </dd>
      </dl>

      <h2>The products</h2>
      <dl>
        <dt>Are they natural?</dt>
        <dd>
          They are made from plant material, cold-pressed and filtered, in short batches. Colour,
          scent and viscosity shift a little between batches because the plants do. That variation is
          normal.
        </dd>

        <dt>Will this treat my condition?</dt>
        <dd>
          No. These are personal-care and general wellness preparations, not medicines, and they are
          not intended to diagnose, treat, cure or prevent anything. If you are managing a health
          condition or taking medication, ask your doctor before using them. Please read the{" "}
          <IntentLink href="/disclaimer">disclaimer</IntentLink>.
        </dd>

        <dt>I have sensitive skin or an allergy.</dt>
        <dd>
          Read the full ingredient list on the product page, and patch test on the inside of the
          forearm for 24 hours before first use. Natural is not the same as non-allergenic.
        </dd>

        <dt>How should I store it, and how long does it keep?</dt>
        <dd>
          Cool, dry, out of direct sunlight, cap closed. The best-before date is printed on the pack
          with the batch number. Do not decant into another bottle.
        </dd>

        <dt>Is it tested on animals?</dt>
        <dd>No.</dd>

        <dt>Something has settled at the bottom of the bottle.</dt>
        <dd>
          Fine sediment in an unstandardised herbal oil is expected — it is plant matter, not
          spoilage. Warm the bottle in your hands and turn it over slowly. If the smell has turned or
          the colour has changed sharply, do not use it; send us the batch number and a photograph.
        </dd>
      </dl>

      <h2>Anything else</h2>
      <dl>
        <dt>How do I reach a human?</dt>
        <dd>
          <Fact value={SUPPORT.email} /> or <Fact value={SUPPORT.phone} />,{" "}
          {SUPPORT.hours.toLowerCase()}. Every message gets a ticket number within 48 hours.
        </dd>

        <dt>I am not happy with how a complaint was handled.</dt>
        <dd>
          Escalate to our grievance officer, who is named — with a phone number and a deadline — on
          the <IntentLink href="/grievance">grievance page</IntentLink>.
        </dd>

        <dt>Do you sell wholesale, or to shops?</dt>
        <dd>
          Write to us through the <IntentLink href="/contact">contact page</IntentLink> and tell us where you are.
        </dd>
      </dl>
    </PolicyPage>
  );
}
