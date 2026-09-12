import { TERMS, esc, httpUrl, link } from "../../../lib/brand";
import { a, button, label, p, panel, shell, small, textShell } from "./layout";
import { lineTable, lineText, referencePanel } from "./parts";
import type { OrderShippedData, Template } from "./types";

/**
 * The dispatch note.
 *
 * The AWB is the point of this e-mail, so it is the first thing under the heading and it is set to
 * be read aloud and typed into a courier's own site -- some customers will do exactly that rather
 * than trust a link in an e-mail. The tracking URL is a button, not the only route.
 *
 * The courier's name is `null` until a fulfilment provider reports one (docs/BACKEND-PLAN.md 8,
 * Shiprocket), so every line that mentions it is conditional. Saying "your courier" is honest;
 * naming the wrong one is not.
 */

const template: Template<OrderShippedData> = {
  subject: (data) => `Order ${data.reference} is on its way`,

  html: (data) => {
    const numbers = data.trackingNumbers.filter((n) => n && n.trim().length > 0);

    const trackingBlock = numbers.length
      ? panel(
          label(data.courier ? `Tracking — ${data.courier}` : "Tracking number") +
            `<p style="margin:0;font-family:Georgia,'Times New Roman',Times,serif;font-size:20px;letter-spacing:0.06em;color:#e2c37c;">${numbers.map(esc).join("<br />")}</p>`,
        )
      : "";

    const followUrl = httpUrl(data.trackingUrl);
    const cta = followUrl
      ? button(followUrl, "Follow the parcel")
      : button(link("/track"), "Track this order");

    const windows =
      TERMS.deliveryMetro && TERMS.deliveryRest
        ? small(
            `Expect it in ${esc(TERMS.deliveryMetro)} to the metros and ${esc(TERMS.deliveryRest)} elsewhere` +
              (TERMS.deliveryRemote
                ? `, ${esc(TERMS.deliveryRemote)} to the hills and islands`
                : "") +
              `. A courier's first scan can take a few hours to appear.`,
          )
        : small(`A courier's first scan can take a few hours to appear.`);

    return shell({
      preheader: numbers.length
        ? `${data.courier ? `${data.courier}: ` : ""}${numbers[0]}`
        : "Your order has left us.",
      heading: "It has left the valley.",
      body:
        p(
          data.courier
            ? `Your order is packed and with ${esc(data.courier)}.`
            : `Your order is packed and with the courier.`,
        ) +
        trackingBlock +
        cta +
        referencePanel(data.reference, data.placedAt) +
        (data.lines.length ? label("In this parcel") + lineTable(data.lines, null) : "") +
        windows +
        small(
          `If it has not moved for three days, tell us at ${a(link("/contact"), "swasthvica.com/contact")} and quote ${esc(data.reference)}.`,
        ),
    });
  },

  text: (data) => {
    const numbers = data.trackingNumbers.filter((n) => n && n.trim().length > 0);
    return textShell("Your order has shipped", [
      data.courier
        ? `Your order is packed and with ${data.courier}.`
        : "Your order is packed and with the courier.",
      "",
      `Reference: ${data.reference}`,
      ...(numbers.length ? [`Tracking:  ${numbers.join(", ")}`] : []),
      ...(httpUrl(data.trackingUrl)
        ? [`Follow it: ${httpUrl(data.trackingUrl)}`]
        : [`Track it:  ${link("/track")}`]),
      ...(data.lines.length ? ["", "IN THIS PARCEL", ...lineText(data.lines, null)] : []),
      "",
      ...(TERMS.deliveryMetro && TERMS.deliveryRest
        ? [`Expect it in ${TERMS.deliveryMetro} to the metros, ${TERMS.deliveryRest} elsewhere.`]
        : []),
      "A courier's first scan can take a few hours to appear.",
    ]);
  },
};

export default template;
