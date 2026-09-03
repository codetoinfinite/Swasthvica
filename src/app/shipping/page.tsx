import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import { SUPPORT, TERMS } from "@/lib/business";
import { pageMetadata } from "@/lib/site";
import { formatINR } from "@/lib/products";

const DESCRIPTION =
  "Dispatch windows, delivery estimates by region, shipping charges, courier partners and what happens when a parcel goes wrong.";

export const metadata: Metadata = pageMetadata("Shipping & Delivery Policy", DESCRIPTION, "/shipping");

/**
 * Numbers, not adjectives. Every figure on this page comes from TERMS in src/lib/business.ts, and
 * `averageDeliveryDays` there has to equal what was typed into Razorpay's "average delivery time
 * after receiving an order" field -- a policy page that disagrees with the KYC form is one of the
 * cheaper ways to fail a review. Rule 7(1)(a) of the Consumer Protection (E-Commerce) Rules, 2020
 * separately names "cost of return shipping" as something that must be stated, which is why that
 * has its own line rather than being folded into the returns policy.
 */
export default function ShippingPage() {
  return (
    <PolicyPage
      eyebrow="Legal"
      title="Shipping & delivery"
      standfirst="Where we ship, when it leaves, when it lands, and what it costs. Stated as numbers, because a range you can plan around is worth more than a promise you cannot."
    >
      <h2>At a glance</h2>
      <dl>
        <dt>Dispatch</dt>
        <dd>Within {TERMS.dispatchDays} of order confirmation.</dd>
        <dt>Average delivery</dt>
        <dd>{TERMS.averageDeliveryDays} days from order, across all serviceable pin codes.</dd>
        <dt>Shipping charge</dt>
        <dd>
          {formatINR(TERMS.shippingFlat)} flat. Free on orders above{" "}
          {formatINR(TERMS.freeShippingAbove)}.
        </dd>
        <dt>Cash on delivery</dt>
        <dd>{TERMS.codAvailable ? "Available on serviceable pin codes." : "Not available. Orders are prepaid."}</dd>
        <dt>We ship to</dt>
        <dd>All serviceable pin codes within India.</dd>
      </dl>

      <h2>Dispatch</h2>
      <p>
        Orders are picked and packed within {TERMS.dispatchDays} of confirmation, excluding Sundays
        and public holidays. Orders placed after 14:00 IST are treated as placed the following
        business day. You will receive a dispatch e-mail with the courier name and the tracking
        number the moment the parcel is handed over — that e-mail, not the order confirmation, is
        the point at which the contract of sale is concluded.
      </p>

      <h2>Delivery estimates by region</h2>
      <p>
        Counted in business days from dispatch, not from order. These are the courier&rsquo;s
        working estimates and they hold for the large majority of parcels.
      </p>
      <dl>
        <dt>Metro cities</dt>
        <dd>{TERMS.deliveryMetro}</dd>
        <dt>Other cities and towns</dt>
        <dd>{TERMS.deliveryRest}</dd>
        <dt>North-East, Jammu &amp; Kashmir, Ladakh, island territories</dt>
        <dd>{TERMS.deliveryRemote}</dd>
      </dl>
      <p>
        Delivery estimates are estimates. Weather, strikes, civil disruption, courier network
        failures and acts of government are outside our control, and the proviso to rule 7(4) of the
        Consumer Protection (E-Commerce) Rules, 2020 recognises that. Where a delay is caused by
        anything within our control, the delay is ours and the remedies in the{" "}
        <IntentLink href="/refunds">cancellation and refunds policy</IntentLink> apply.
      </p>

      <h2>Charges</h2>
      <dl>
        <dt>Standard shipping</dt>
        <dd>{formatINR(TERMS.shippingFlat)}, shown as a separate line before you pay.</dd>
        <dt>Free shipping</dt>
        <dd>On order values above {formatINR(TERMS.freeShippingAbove)}, before any discount.</dd>
        <dt>Taxes</dt>
        <dd>
          All product prices are MRP, inclusive of all taxes. Nothing is added to the displayed
          price at checkout except the shipping line above.
        </dd>
        <dt>Return shipping</dt>
        <dd>
          Borne by us where the item is defective, damaged, wrong or not as described. Borne by you
          where the return is for any other reason.
        </dd>
      </dl>

      <h2>Courier partners</h2>
      <p>
        Parcels are carried by <Fact value={TERMS.courier} />. We choose the carrier by pin code and
        cannot take carrier requests. The tracking link in your dispatch e-mail goes to the
        carrier&rsquo;s own tracking, which is the same information we have.
      </p>

      <h2>Addresses, and getting them wrong</h2>
      <ul>
        <li>
          Please check the shipping address before paying. Once a parcel is handed to the courier we
          cannot redirect it.
        </li>
        <li>
          An address correction is possible only before dispatch. Write to <Fact value={SUPPORT.email} />{" "}
          with your order number as soon as you notice.
        </li>
        <li>
          An incomplete address, an unreachable phone number or a pin code the carrier does not
          service will delay the parcel and may return it to us.
        </li>
      </ul>

      <h2>Failed delivery and returns to origin</h2>
      <p>
        Couriers attempt delivery up to three times. If all attempts fail, or the parcel is refused,
        it returns to us. When it arrives we will contact you to either reship it — at the shipping
        charge above — or refund it, less the original shipping charge where one was paid.
      </p>

      <h2>Damage, leakage and shortfall</h2>
      <p>
        Open the parcel with the outer packaging intact and check it. If anything is broken, leaking,
        missing or not what you ordered, tell us within 48 hours of delivery with photographs of the
        item and the outer box. We will replace or refund it in full, including both legs of the
        shipping, and we will not ask you to pay to send it back.
      </p>

      <h2>Partial shipments</h2>
      <p>
        Where one item in an order is ready before another, we may ship in parts at no extra charge
        to you. Each part has its own tracking. You will never be charged twice for shipping on a
        single order.
      </p>

      <h2>International orders</h2>
      <p>
        We currently ship only within India. Prices, taxes and this policy are stated for domestic
        delivery only.
      </p>

      <h2>Questions</h2>
      <p>
        Write to <Fact value={SUPPORT.email} /> or call <Fact value={SUPPORT.phone} /> during{" "}
        {SUPPORT.hours.toLowerCase()}. Complaints go through the{" "}
        <IntentLink href="/grievance">grievance procedure</IntentLink>, with the timelines stated there.
      </p>
    </PolicyPage>
  );
}
