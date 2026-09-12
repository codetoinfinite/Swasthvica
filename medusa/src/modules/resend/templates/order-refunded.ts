import { TERMS, esc, link, money } from "../../../lib/brand";
import { a, label, p, panel, shell, small, textShell } from "./layout";
import { referencePanel } from "./parts";
import type { OrderRefundedData, Template } from "./types";

/**
 * The refund note.
 *
 * The amount is the headline and the timing is the second line, in that order, because those are
 * the two questions the customer already has. TERMS.refundDays is quoted rather than restated so it
 * matches /refunds, and the sentence that follows it is the honest caveat: we release the money,
 * the bank decides when it lands, and a customer who is not told that will write on day three.
 *
 * There is no call to action. Nothing is being asked of them.
 */

const template: Template<OrderRefundedData> = {
  subject: (data) => `Refund issued for order ${data.reference}`,

  html: (data) =>
    shell({
      preheader: `${money(data.amount, data.currency)} is on its way back to you.`,
      heading: data.full ? "Your refund is on its way." : "A partial refund is on its way.",
      body:
        panel(
          label("Refunded") +
            `<p style="margin:0;font-family:Georgia,'Times New Roman',Times,serif;font-size:26px;color:#e2c37c;">${esc(money(data.amount, data.currency))}</p>`,
        ) +
        p(
          TERMS.refundDays
            ? `We have released it to the account you paid from. Refunds normally appear within ` +
                `<strong style="color:#f2ead8;">${esc(TERMS.refundDays)}</strong>, though your bank or card ` +
                `issuer decides the exact day.`
            : `We have released it to the account you paid from. Your bank or card issuer decides the ` +
                `exact day it appears.`,
        ) +
        referencePanel(data.reference, data.placedAt) +
        small(
          `If it has not arrived by then, send us the reference above and your bank statement line — ` +
            `${a(link("/contact"), "swasthvica.com/contact")}. Full policy: ${a(link("/refunds"), "swasthvica.com/refunds")}.`,
        ),
    }),

  text: (data) =>
    textShell(data.full ? "Your refund is on its way" : "A partial refund is on its way", [
      `Refunded: ${money(data.amount, data.currency)}`,
      `Reference: ${data.reference}`,
      "",
      TERMS.refundDays
        ? `We have released it to the account you paid from. Refunds normally appear within ${TERMS.refundDays}, though your bank or card issuer decides the exact day.`
        : "We have released it to the account you paid from. Your bank or card issuer decides the exact day it appears.",
      "",
      `If it has not arrived by then: ${link("/contact")}`,
      `Full policy: ${link("/refunds")}`,
    ]),
};

export default template;
