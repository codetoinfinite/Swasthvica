import { TERMS, esc, link, shortDate } from "../../../lib/brand";
import { a, button, p, shell, small, textShell } from "./layout";
import { referencePanel } from "./parts";
import type { OrderDeliveredData, Template } from "./types";

/**
 * The delivery note.
 *
 * Short on purpose: the parcel is in their hands, so the only work left is telling them what to do
 * if it is wrong. The return window is the one fact worth repeating, because a customer who finds a
 * leaking bottle on day eight and only then reads the policy has a bad afternoon and so do we.
 */

const template: Template<OrderDeliveredData> = {
  subject: (data) => `Order ${data.reference} was delivered`,

  html: (data) => {
    const when = shortDate(data.deliveredAt);
    const window = Number.isFinite(TERMS.returnWindowDays) ? TERMS.returnWindowDays : null;

    return shell({
      preheader: when
        ? `Delivered ${when}. We hope it travelled well.`
        : "Your order was delivered.",
      heading: "It arrived.",
      body:
        p(
          when
            ? `The courier marked your order delivered on ${esc(when)}. We hope it travelled well.`
            : `The courier marked your order delivered. We hope it travelled well.`,
        ) +
        referencePanel(data.reference, data.placedAt) +
        (window
          ? p(
              `If anything is damaged, missing or not what you expected, tell us within ` +
                `<strong style="color:#f2ead8;">${esc(window)} days</strong> of delivery and we will put it right.`,
            )
          : p(
              `If anything is damaged, missing or not what you expected, tell us and we will put it right.`,
            )) +
        button(link("/contact"), "Something is wrong") +
        small(
          `Our full returns and refunds policy is at ${a(link("/refunds"), "swasthvica.com/refunds")}.`,
        ),
    });
  },

  text: (data) => {
    const when = shortDate(data.deliveredAt);
    const window = Number.isFinite(TERMS.returnWindowDays) ? TERMS.returnWindowDays : null;
    return textShell("Your order was delivered", [
      when
        ? `The courier marked your order delivered on ${when}. We hope it travelled well.`
        : "The courier marked your order delivered. We hope it travelled well.",
      "",
      `Reference: ${data.reference}`,
      "",
      window
        ? `If anything is damaged, missing or not what you expected, tell us within ${window} days of delivery and we will put it right.`
        : "If anything is damaged, missing or not what you expected, tell us and we will put it right.",
      "",
      `Tell us:  ${link("/contact")}`,
      `Policy:   ${link("/refunds")}`,
    ]);
  },
};

export default template;
