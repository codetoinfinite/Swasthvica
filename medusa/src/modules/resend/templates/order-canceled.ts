import { TERMS, esc, link, money } from "../../../lib/brand";
import { a, button, p, shell, small, textShell } from "./layout";
import { referencePanel } from "./parts";
import type { OrderCanceledData, Template } from "./types";

/**
 * The cancellation.
 *
 * Two audiences read this: the customer who asked for it, and the customer who did not. The second
 * one is why the refund position is stated plainly and why there is a way to reply -- an
 * unexplained cancellation with no money mentioned is how a chargeback starts.
 *
 * `paid` is `null` for an order cancelled before anything was captured, and the wording changes
 * rather than the amount going to zero: "nothing was charged" and "₹0.00 refunded" are different
 * statements and only one of them is true.
 */

const template: Template<OrderCanceledData> = {
  subject: (data) => `Order ${data.reference} has been cancelled`,

  html: (data) => {
    const refundLine =
      data.paid && data.paid > 0
        ? p(
            `<strong style="color:#f2ead8;">${esc(money(data.paid, data.currency))}</strong> goes back to the ` +
              `account you paid from` +
              (TERMS.refundDays ? `, normally within ${esc(TERMS.refundDays)}` : "") +
              `. Your bank decides the exact day it appears.`,
          )
        : p(`Nothing was charged for this order, so there is nothing to refund.`);

    return shell({
      preheader: "This order has been cancelled.",
      heading: "This order has been cancelled.",
      body:
        p(`Your order will not be packed or dispatched.`) +
        referencePanel(data.reference, data.placedAt) +
        refundLine +
        p(`If you did not ask for this, tell us and we will find out what happened.`) +
        button(link("/contact"), "Talk to us") +
        small(
          `Our refunds policy is at ${a(link("/refunds"), "swasthvica.com/refunds")}. Quote ${esc(data.reference)} in any reply.`,
        ),
    });
  },

  text: (data) =>
    textShell("Your order has been cancelled", [
      "Your order will not be packed or dispatched.",
      "",
      `Reference: ${data.reference}`,
      "",
      data.paid && data.paid > 0
        ? `${money(data.paid, data.currency)} goes back to the account you paid from${TERMS.refundDays ? `, normally within ${TERMS.refundDays}` : ""}. Your bank decides the exact day it appears.`
        : "Nothing was charged for this order, so there is nothing to refund.",
      "",
      "If you did not ask for this, tell us and we will find out what happened.",
      "",
      `Talk to us: ${link("/contact")}`,
      `Policy:     ${link("/refunds")}`,
    ]),
};

export default template;
