import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import {
  BRAND,
  CIN,
  GSTIN,
  LEGAL_FORM,
  LEGAL_NAME,
  PSP,
  REGISTERED_ADDRESS,
  SUPPORT,
  TERMS,
  formatAddress,
} from "@/lib/business";
import { pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "The terms on which Swasthvica sells to you — who you are contracting with, when the contract forms, pricing, payment, delivery, support and governing law.";

export const metadata: Metadata = pageMetadata("Terms & Conditions", DESCRIPTION, "/terms");

/**
 * Written to be read, which is not the usual ambition of a terms page but is the only way it does
 * its job. A reviewer checks that five things are actually here -- the contracting entity, delivery
 * of goods, customer support, dispute resolution, and the payment service provider named with its
 * contact details, the last of which is rule 7(1)(c) of the Consumer Protection (E-Commerce) Rules,
 * 2020 rather than a courtesy. A customer checks one clause and leaves. Both fail on a wall of
 * capitals, so there are none.
 */
export default function TermsPage() {
  return (
    <PolicyPage
      eyebrow="Legal"
      title="Terms & conditions"
      standfirst="The agreement between you and the company behind Swasthvica, in the plainest language we can write it without changing what it means."
    >
      <h2>1. Who you are dealing with</h2>
      <p>
        This website and the {BRAND} brand are operated by <Fact value={LEGAL_NAME} /> (
        <Fact value={CIN} />
        ), a <Fact value={LEGAL_FORM} /> registered in India
        at <Fact value={formatAddress(REGISTERED_ADDRESS)} />, GSTIN <Fact value={GSTIN} />.
        &ldquo;We&rdquo;, &ldquo;us&rdquo; and &ldquo;our&rdquo; mean that company.
        &ldquo;You&rdquo; means the person placing an order or using the site.
      </p>
      <p>
        You can reach us at <Fact value={SUPPORT.email} /> or <Fact value={SUPPORT.phone} /> during{" "}
        {SUPPORT.hours.toLowerCase()}.
      </p>

      <h2>2. Using this site</h2>
      <p>
        By browsing or ordering you accept these terms, the <IntentLink href="/privacy">privacy policy</IntentLink>
        , the <IntentLink href="/shipping">shipping policy</IntentLink>, the{" "}
        <IntentLink href="/refunds">cancellation and refunds policy</IntentLink> and the{" "}
        <IntentLink href="/disclaimer">disclaimer</IntentLink>. They form one agreement. If you do not accept
        them, please do not order.
      </p>
      <p>
        You must be at least 18 years old and legally capable of contracting under the Indian
        Contract Act, 1872. If you are ordering on behalf of a company, you confirm you are
        authorised to bind it.
      </p>
      <p>You agree not to:</p>
      <ul>
        <li>Use the site for any unlawful purpose, or to place orders you do not intend to pay for.</li>
        <li>Interfere with the site, probe it, scrape it at volume, or attempt to gain access to any part of it that is not public.</li>
        <li>Resell our products as new without our written agreement, or misrepresent their origin, contents or licensing.</li>
        <li>Impersonate anyone, or use another person&rsquo;s payment instrument without authority.</li>
      </ul>

      <h2>3. Products, descriptions and images</h2>
      <p>
        We describe our products as accurately as we can, and every mandatory declaration —
        ingredients, net quantity, MRP, manufacturer, best-before, country of origin — appears on the
        product page as well as on the pack. Photography and the three-dimensional rendering on this
        site are representations; natural preparations vary in colour, viscosity and scent between
        batches, and that variation is not a defect.
      </p>
      <p>
        Nothing on this site is medical advice. Our products are for personal care and general
        wellbeing and are not intended to diagnose, treat, cure or prevent any disease or condition.
        Please read the <IntentLink href="/disclaimer">disclaimer</IntentLink> before you buy.
      </p>

      <h2>4. Prices</h2>
      <ul>
        <li>All prices are in Indian Rupees (INR ₹).</li>
        <li>
          Every product price shown is the maximum retail price, <strong>inclusive of all taxes</strong>.
          Nothing is added to it at checkout except the shipping line, which is shown separately
          before you pay.
        </li>
        <li>
          The total payable, with its full breakup, is shown before you confirm. There are no
          charges after that point.
        </li>
        <li>
          Prices can change. The price that applies to your order is the one displayed when you place
          it.
        </li>
        <li>
          Very occasionally a price is published in error. Where the error is obvious, we may decline
          or cancel the order before dispatch and refund you in full rather than dispatch at a price
          neither of us intended. We will tell you, and we will not charge you anything.
        </li>
      </ul>

      <h2>5. How the contract is formed</h2>
      <p>
        Placing an order is an <strong>offer</strong> to buy. The order confirmation e-mail
        acknowledges that we have received it and that payment has been authorised; it is not
        acceptance. <strong>The contract is concluded when we dispatch the goods</strong> and send
        you the dispatch e-mail with the tracking number. Until then we may decline the order — for
        stock, for a serviceability failure, for a pricing error, or where we suspect fraud — and
        refund you in full.
      </p>
      <p>
        Risk in the goods passes to you on delivery. Title passes on delivery, or on receipt of
        payment in full, whichever is later.
      </p>

      <h2>6. Payment</h2>
      <p>
        We accept the payment methods shown at checkout, which may include credit and debit cards,
        UPI, net banking and wallets.{" "}
        {TERMS.codAvailable
          ? "Cash on delivery is available on serviceable pin codes."
          : "We do not offer cash on delivery; all orders are prepaid."}
      </p>
      <p>
        Payments are collected and processed by our payment service provider,{" "}
        <strong>{PSP.name}</strong>, of {PSP.address} — reachable at{" "}
        <a href={`mailto:${PSP.email}`}>{PSP.email}</a> and{" "}
        <a href={PSP.url} rel="noopener noreferrer" target="_blank">
          {PSP.url}
        </a>
        . We never see or store your full card number, expiry or CVV. Card details are handled and
        tokenised by the provider under the Reserve Bank of India&rsquo;s card-on-file tokenisation
        framework.
      </p>
      <p>
        <strong>Recurring payments.</strong> We do not offer subscriptions and we do not create
        standing instructions or e-mandates on your card or account. Nothing on this site will debit
        you a second time. If a recurring mandate is ever introduced, it will be optional, disclosed
        before you authorise it, and cancellable from your order account and by writing to{" "}
        <Fact value={SUPPORT.email} />.
      </p>
      <p>
        <strong>Chargebacks.</strong> If you do not recognise a charge, please write to us first —
        most are resolved the same day and a refund is faster than a dispute. You keep every right
        to raise a chargeback with your bank or card issuer under their rules. We do not charge you
        any fee for raising one. Where a chargeback is raised on an order that was delivered as
        described, we will contest it with the delivery evidence.
      </p>

      <h2>7. Delivery of goods</h2>
      <p>
        Orders are dispatched within {TERMS.dispatchDays} of confirmation and delivered in{" "}
        {TERMS.deliveryMetro} to metro cities, {TERMS.deliveryRest} to other cities and towns, and{" "}
        {TERMS.deliveryRemote} to the North-East, Jammu &amp; Kashmir, Ladakh and the island
        territories. The full policy, including charges, carriers, failed deliveries and damage in
        transit, is on the <IntentLink href="/shipping">shipping and delivery page</IntentLink>. We ship only
        within India.
      </p>

      <h2>8. Cancellation, returns and refunds</h2>
      <p>
        You may cancel free of charge at any time before dispatch. After delivery you have{" "}
        {TERMS.returnWindowDays} days to return an unopened item, and an open-ended right to return
        anything defective, damaged, wrong, short, expired, spurious, not as described or delivered
        late. Approved refunds are processed within {TERMS.refundDays} to the original payment
        instrument. The full terms are on the{" "}
        <IntentLink href="/refunds">cancellation and refunds page</IntentLink>, and they prevail over anything in
        this clause.
      </p>

      <h2>9. Customer support</h2>
      <p>
        Support is by e-mail at <Fact value={SUPPORT.email} /> and by phone at{" "}
        <Fact value={SUPPORT.phone} />, {SUPPORT.hours.toLowerCase()}. Every message is acknowledged
        within 48 hours with a ticket number, and we aim to answer within one business day.
        Complaints escalate to a named grievance officer under the procedure and timelines on the{" "}
        <IntentLink href="/grievance">grievance redressal page</IntentLink>.
      </p>

      <h2>10. Your account and your data</h2>
      <p>
        You do not need an account to buy. Where you give us details — name, e-mail, phone, address —
        they are handled as set out in the <IntentLink href="/privacy">privacy policy</IntentLink>. To exercise a
        data right, or to have an order looked up, we will ask for the e-mail address or phone number
        the order was placed with and the order number; those are the identifiers that let us find
        your records without exposing anyone else&rsquo;s.
      </p>
      <p>
        Keep your order number and confirmation e-mail to yourself. Anyone holding them can ask us
        about that order.
      </p>

      <h2>11. Intellectual property</h2>
      <p>
        The {BRAND} name and marks, the photography, the artwork, the three-dimensional scene, the
        text and the code of this site belong to us or to our licensors. You may read, share and
        link to the pages. You may not copy, reproduce, adapt or use any of it commercially, or
        train a model on it, without our written permission.
      </p>

      <h2>12. Liability</h2>
      <p>
        We are responsible for delivering products that match their description, are of satisfactory
        quality and are fit for their ordinary purpose. Where we fail, your remedies are the ones in
        the refunds policy and under the Consumer Protection Act, 2019, and nothing here limits them.
      </p>
      <p>
        Beyond that, and to the extent Indian law allows, our total liability arising out of an order
        is limited to the amount you paid for it. We are not liable for indirect or consequential
        loss, for loss of profit, or for any outcome of using a product contrary to its instructions
        or the <IntentLink href="/disclaimer">disclaimer</IntentLink>. Nothing in these terms excludes liability
        for death or personal injury caused by our negligence, for fraud, or for anything else that
        cannot lawfully be excluded.
      </p>

      <h2>13. Force majeure</h2>
      <p>
        Neither of us is in breach for a failure caused by something outside reasonable control —
        natural events, epidemic, fire, flood, strike, civil disruption, failure of a carrier or a
        payment network, or an act of government. Where such an event delays an order materially, you
        may cancel it and we will refund you in full.
      </p>

      <h2>14. Changes to these terms</h2>
      <p>
        We may update these terms. The version that applies to an order is the version published when
        the order was placed, and the date at the top of this page tells you when it last changed.
      </p>

      <h2>15. Governing law and disputes</h2>
      <p>
        These terms are governed by the laws of India. We would much rather resolve a dispute
        directly: please raise it through the{" "}
        <IntentLink href="/grievance">grievance procedure</IntentLink> first, which is quicker than any other
        route and costs you nothing.
      </p>
      <p>
        Failing that, the courts at <Fact value={TERMS.jurisdiction} /> have exclusive jurisdiction.
        This does not affect your right as a consumer to approach the consumer commission with
        territorial jurisdiction over where you reside or work, under section 34(2)(d) of the
        Consumer Protection Act, 2019, or to use the National Consumer Helpline on 1915.
      </p>

      <h2>16. Severability and waiver</h2>
      <p>
        If any clause is held unenforceable, the rest stands. If we do not enforce a term on one
        occasion, we have not given it up.
      </p>
    </PolicyPage>
  );
}
