import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import { PSP, SUPPORT, TERMS } from "@/lib/business";
import { formatINR, formatMRP } from "@/lib/products";
import { getCatalogue } from "@/lib/medusa";
import { pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "Every Swasthvica price in one place — maximum retail price inclusive of all taxes, pack size, shipping charges and the free-shipping threshold. No hidden fees.";

export const metadata: Metadata = pageMetadata("Pricing", DESCRIPTION, "/pricing");

/**
 * Razorpay's activation form asks for a "Pricing details" URL as a field of its own, separate from
 * the shipping and terms URLs, and a reviewer opening it wants one thing: to see every price the
 * site charges, in rupees, with tax treatment stated, without hunting through a catalogue.
 *
 * Generated from src/lib/products.ts rather than typed out. A pricing page that disagrees with the
 * product page is worse than no pricing page at all -- it is the single fastest way to fail a
 * gateway review and the single easiest thing to let rot.
 */
export default async function PricingPage() {
  // Read from Medusa, not from the catalogue file. This is the page a gateway reviewer opens to
  // check that the site charges what it says it charges, so it has to quote the same source the
  // basket does; a pricing page generated from a second copy of the numbers is exactly the rot the
  // note above is about.
  const catalogue = await getCatalogue();
  const live = catalogue.filter((p) => p.status === "live");
  const soon = catalogue.filter((p) => p.status !== "live");

  return (
    <PolicyPage
      eyebrow="Information"
      title="Pricing"
      standfirst="What everything costs, what is included in that, and what is added at checkout. There is nothing beyond this page."
    >
      <h2>How to read a price</h2>
      <ul>
        <li>
          All prices are in <strong>Indian Rupees (INR ₹)</strong>.
        </li>
        <li>
          Every price shown is the <strong>maximum retail price, inclusive of all taxes</strong>.
          GST is already inside it. Nothing is added for tax at checkout.
        </li>
        <li>
          The only line that can be added is shipping, and it is shown on its own before you pay.
        </li>
        <li>
          There is no handling fee, no convenience fee, no payment-gateway surcharge and no
          packaging charge. We sell and ship from India.
        </li>
      </ul>

      {live.length > 0 ? (
        <>
          <h2>Products on sale</h2>
          <dl>
            {live.map((p) => (
              <div key={p.slug}>
                <dt>
                  <IntentLink href={`/products/${p.slug}`}>{p.name}</IntentLink> —{" "}
                  {p.categoryCaps.toLowerCase()}, {p.size}
                </dt>
                <dd>{formatMRP(p.price)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <>
          <h2>Products on sale</h2>
          <p>
            Nothing is on sale at this moment. No price is quoted here that cannot be charged, so
            when the shelf is empty this list is empty too rather than showing a figure the basket
            would not honour.
          </p>
        </>
      )}

      {soon.length > 0 && (
        <>
          <h2>Not yet on sale</h2>
          <p>
            These are listed on the site as coming soon. They cannot be added to the basket and no
            payment can be taken for them. The price is published so it is not a surprise later, and
            it is the price that will apply on release.
          </p>
          <dl>
            {soon.map((p) => (
              <div key={p.slug}>
                <dt>
                  {p.name} — {p.categoryCaps.toLowerCase()}, {p.size}
                </dt>
                <dd>{formatMRP(p.price)} · coming soon</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <h2>Shipping charges</h2>
      <dl>
        <dt>Standard delivery, anywhere in India</dt>
        <dd>{formatINR(TERMS.shippingFlat)} flat, per order — not per item.</dd>

        <dt>Orders of {formatINR(TERMS.freeShippingAbove)} and above</dt>
        <dd>Free. The line still appears on your order, at zero.</dd>

        <dt>Cash on delivery</dt>
        <dd>
          {TERMS.codAvailable
            ? "Available on serviceable pin codes."
            : "Not offered. There is therefore no COD fee."}
        </dd>

        <dt>Return shipping</dt>
        <dd>
          Nothing, where the item was defective, damaged, wrong, short or not as described — we
          arrange and pay for the pickup. Where you simply changed your mind, the return leg is
          yours. See the <IntentLink href="/refunds">refunds policy</IntentLink>.
        </dd>

        <dt>International</dt>
        <dd>We do not ship outside India, so no duty or customs charge can arise.</dd>
      </dl>

      <h2>What you pay</h2>
      <p>
        Before you confirm an order, the checkout shows the price of each item, the quantity, the
        shipping line and the total. That total is what is debited — the same figure, to the rupee.
        Payment is collected by <strong>{PSP.name}</strong>, and the transaction currency is Indian
        Rupees.
      </p>
      <p>
        If a price is ever published in error, we will not dispatch at it and we will not charge
        you. We will tell you and refund in full. That is set out in clause 4 of the{" "}
        <IntentLink href="/terms">terms and conditions</IntentLink>.
      </p>

      <h2>Questions about a price</h2>
      <p>
        Write to <Fact value={SUPPORT.email} /> or call <Fact value={SUPPORT.phone} />,{" "}
        {SUPPORT.hours.toLowerCase()}. Wholesale and stockist enquiries are handled through the{" "}
        <IntentLink href="/contact">contact page</IntentLink>.
      </p>
    </PolicyPage>
  );
}
