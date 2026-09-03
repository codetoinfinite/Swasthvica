import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import { SUPPORT, TERMS } from "@/lib/business";
import { pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "How to cancel an order, when a return is accepted, who pays return shipping, and the exact number of days a refund takes.";

export const metadata: Metadata = pageMetadata(
  "Cancellation & Refunds",
  DESCRIPTION,
  "/refunds",
);

/**
 * The page most likely to be read twice: once by a reviewer checking the refund turnaround is a
 * number rather than "at our discretion", and once by someone who wants their money back.
 *
 * Two clauses here are not ours to soften. Rule 4(8) of the Consumer Protection (E-Commerce) Rules,
 * 2020 makes a one-sided cancellation charge unlawful -- we may not charge you for cancelling
 * unless we would bear the same charge cancelling on you -- and rule 7(4) requires goods to be
 * taken back and the consideration refunded where they are defective, deficient, spurious, not as
 * advertised, or delivered late. A blanket "no returns on hygiene grounds" cannot override that; it
 * can only cover an opened, non-defective item, which is how it is written below.
 */
export default function RefundsPage() {
  return (
    <PolicyPage
      eyebrow="Legal"
      title="Cancellation & refunds"
      standfirst="If it is wrong, we take it back and you are made whole. If you simply changed your mind, you have a week and we ask you to cover the return leg."
    >
      <h2>At a glance</h2>
      <dl>
        <dt>Cancel before dispatch</dt>
        <dd>Free, in full, no charge of any kind.</dd>
        <dt>Return window</dt>
        <dd>{TERMS.returnWindowDays} days from delivery.</dd>
        <dt>Refund processed</dt>
        <dd>{TERMS.refundDays} from the day the return reaches us and passes check.</dd>
        <dt>Refund method</dt>
        <dd>Back to the original payment instrument. Always.</dd>
        <dt>Return shipping</dt>
        <dd>Ours if the fault is ours. Yours if you changed your mind.</dd>
      </dl>

      <h2>Cancelling an order</h2>
      <p>
        An order can be cancelled at any time before it is dispatched. Write to{" "}
        <Fact value={SUPPORT.email} /> or call <Fact value={SUPPORT.phone} /> with your order number
        and we will stop it and refund the whole amount, including any shipping charge paid.
      </p>
      <p>
        <strong>There is no cancellation charge.</strong> We do not levy one, and under rule 4(8) of
        the Consumer Protection (E-Commerce) Rules, 2020 we could not levy one unless we bore the
        same charge ourselves when cancelling unilaterally on you.
      </p>
      <p>
        Once a parcel has been handed to the courier it cannot be cancelled. It becomes a return,
        under the terms below.
      </p>

      <h2>When we cancel</h2>
      <p>
        Occasionally we have to: a stock count is wrong, a batch fails its own check, the address is
        not serviceable, or a price was published in error and you have not yet been charged
        correctly. In every one of those cases we tell you why and refund in full within{" "}
        {TERMS.refundDays}. We do not cancel an order without telling you the reason.
      </p>

      <h2>Returns we accept without question</h2>
      <p>
        Where the item is <strong>defective, damaged in transit, leaking, expired, the wrong item,
        short of what you ordered, spurious, not of the characteristics or features advertised, or
        delivered materially late</strong>, we take it back and refund the consideration paid in
        full — this is rule 7(4), and it is not something we negotiate.
      </p>
      <ul>
        <li>Tell us within 48 hours of delivery, with photographs of the item and the outer box.</li>
        <li>We arrange and pay for the pickup. You are not asked to post anything at your cost.</li>
        <li>
          You choose: a replacement of the same item, or a full refund of everything paid including
          both legs of shipping.
        </li>
      </ul>

      <h2>Returns because you changed your mind</h2>
      <p>
        Within {TERMS.returnWindowDays} days of delivery, an item can be returned if it is{" "}
        <strong>unopened, unused, with its seal and outer packaging intact</strong>, and in a
        condition we could sell it in.
      </p>
      <ul>
        <li>Return shipping is at your cost, or we deduct the pickup charge from the refund.</li>
        <li>The original shipping charge, where one was paid, is not refunded.</li>
        <li>The product price is refunded in full once the item reaches us and passes check.</li>
      </ul>

      <h2>What we cannot take back</h2>
      <p>
        These are personal-care preparations. Once a seal is broken we cannot resell an item and we
        will not resell one, so an <strong>opened item that is not defective</strong> cannot be
        returned on a change of mind. This exclusion applies only to that case. It never applies to
        an item that is defective, damaged, expired, spurious, wrong, short, not as described or
        late — those come back to us whatever their condition.
      </p>
      <p>Also outside the window: items returned after {TERMS.returnWindowDays} days, and items
        damaged after delivery by misuse, storage in heat or direct sun, or decanting.</p>

      <h2>How to start a return</h2>
      <ol>
        <li>
          Write to <Fact value={SUPPORT.email} /> with your order number, the item, the reason, and
          photographs where the item is damaged or wrong.
        </li>
        <li>
          We reply with a ticket number and, where the pickup is ours, a scheduled pickup date —
          within one business day.
        </li>
        <li>Repack the item in its outer box, with the seal intact where it still is.</li>
        <li>We check the item on arrival and confirm the outcome the same day.</li>
      </ol>

      <h2>The refund itself</h2>
      <dl>
        <dt>When it starts</dt>
        <dd>
          The day the returned item reaches us and passes check. For a pre-dispatch cancellation,
          the day you ask.
        </dd>
        <dt>How long we take</dt>
        <dd>{TERMS.refundDays}. This is our part and we hold ourselves to it.</dd>
        <dt>How long your bank takes</dt>
        <dd>
          A further 2 – 7 business days for the credit to appear, depending on your bank or card
          issuer. That leg is outside our control and we cannot speed it up.
        </dd>
        <dt>Where it goes</dt>
        <dd>
          Back to the original payment instrument — the same card, UPI handle, wallet or account it
          came from. We do not refund to a different instrument, and we do not offer store credit in
          place of a refund unless you ask for it.
        </dd>
      </dl>
      <p>
        Refunds are processed through our payment service provider. You will receive a refund
        reference number; quote it to your bank if the credit has not appeared after the window
        above.
      </p>

      <h2>Exchanges</h2>
      <p>
        An exchange is handled as a return followed by a fresh order, so that the refund clock and
        the dispatch clock both stay visible. Where the exchange is because we sent the wrong item,
        we ship the replacement before the wrong one comes back and pay for both legs.
      </p>

      <h2>Warranty</h2>
      <p>
        These products carry no warranty or guarantee beyond the statutory rights above and the
        best-before date printed on each pack. Store them as the pack says — cool, dry, out of
        direct sun — and use them before that date.
      </p>

      <h2>If you disagree with an outcome</h2>
      <p>
        Take it to the <IntentLink href="/grievance">grievance officer</IntentLink>. Every complaint is
        acknowledged within 48 hours and redressed within one month, and nothing on this page limits
        any right you have under the Consumer Protection Act, 2019.
      </p>
    </PolicyPage>
  );
}
