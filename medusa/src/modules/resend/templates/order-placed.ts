import { TERMS, esc, link, shortDate } from "../../../lib/brand";
import { a, button, label, p, shell, small, textShell } from "./layout";
import {
  addressLines,
  addressPanel,
  lineText,
  lineTable,
  referencePanel,
  totalsPanel,
  totalsText,
} from "./parts";
import type { OrderPlacedData, Template } from "./types";

/**
 * The receipt.
 *
 * The one e-mail a customer keeps, so it carries everything they might need later without them
 * having to come back and ask: what they bought, what they paid, where it is going, when it leaves,
 * and the reference that finds it. The delivery promise is quoted from TERMS rather than written
 * here, so it cannot disagree with /shipping -- see src/lib/brand.ts for that seam.
 */

/** A first name, when the customer gave one. "Thank you, Meera." reads better than "Dear customer". */
function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

function greeting(name: string | null): string {
  const first = firstName(name);
  return first ? `Thank you, ${first}.` : "Thank you.";
}

const template: Template<OrderPlacedData> = {
  subject: (data) => `Order ${data.reference} confirmed`,

  html: (data) => {
    const dispatch = TERMS.dispatchDays
      ? p(
          `We pack by hand, in the order things were gathered, and yours goes out within ` +
            `<strong style="color:#f2ead8;">${esc(TERMS.dispatchDays)}</strong>. ` +
            `You will get the courier and a tracking number the moment it leaves us.`,
        )
      : p(`You will get the courier and a tracking number the moment it leaves us.`);

    const windows =
      TERMS.deliveryMetro && TERMS.deliveryRest
        ? small(
            `After dispatch: ${esc(TERMS.deliveryMetro)} to the metros, ${esc(TERMS.deliveryRest)} elsewhere` +
              (TERMS.deliveryRemote
                ? `, ${esc(TERMS.deliveryRemote)} to the hills and islands`
                : "") +
              `.`,
          )
        : "";

    const wrongAddress = addressLines(data.address).length
      ? small(
          `Wrong address? Tell us before it is dispatched, quoting ${esc(data.reference)} — ` +
            `${a(link("/contact"), "swasthvica.com/contact")}. Once it is with the courier it cannot be redirected.`,
        )
      : "";

    return shell({
      preheader: TERMS.dispatchDays
        ? `We have your order. It leaves us within ${TERMS.dispatchDays}.`
        : `We have your order.`,
      heading: "The valley is bottling yours.",
      body:
        p(`${esc(greeting(data.customerName))} Your order is confirmed and paid for.`) +
        referencePanel(data.reference, data.placedAt) +
        label("What is in it") +
        lineTable(data.lines, data.currency) +
        totalsPanel({
          currency: data.currency,
          subtotal: data.subtotal,
          discount: data.discount,
          discountCode: data.discountCode,
          shipping: data.shipping,
          tax: data.tax,
          total: data.total,
        }) +
        addressPanel(data.address) +
        dispatch +
        button(link("/track"), "Track this order") +
        windows +
        wrongAddress,
    });
  },

  text: (data) =>
    textShell("Order confirmed", [
      `${greeting(data.customerName)} Your order is confirmed and paid for.`,
      "",
      `Reference: ${data.reference}`,
      ...(shortDate(data.placedAt) ? [`Placed:    ${shortDate(data.placedAt)}`] : []),
      "",
      "WHAT IS IN IT",
      ...lineText(data.lines, data.currency),
      "",
      ...totalsText({
        currency: data.currency,
        subtotal: data.subtotal,
        discount: data.discount,
        discountCode: data.discountCode,
        shipping: data.shipping,
        tax: data.tax,
        total: data.total,
      }),
      ...(addressLines(data.address).length
        ? ["", "GOING TO", ...addressLines(data.address).map((line) => `  ${line}`)]
        : []),
      "",
      ...(TERMS.dispatchDays ? [`We pack and dispatch within ${TERMS.dispatchDays}.`] : []),
      "You will get the courier and a tracking number the moment it leaves us.",
      "",
      `Track it: ${link("/track")}`,
    ]),
};

export default template;
