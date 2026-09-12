import { BRAND, esc, link } from "../../../lib/brand";
import { a, button, label, p, panel, shell, small, textShell } from "./layout";
import { referencePanel } from "./parts";
import type { OrderTransferRequestedData, Template } from "./types";

/**
 * The claim confirmation.
 *
 * A guest order is being moved into an account, and this e-mail is the whole of the authorisation:
 * it goes to the address on the *existing* order, so only the person who placed it can complete the
 * move. That is why the code is a code and not a one-click link -- src/components/dom/account/
 * ClaimForms.tsx asks for the order id and the code as two typed fields, and a mail client that
 * pre-fetches links would otherwise accept the transfer on the reader's behalf before they had read
 * the sentence explaining it.
 *
 * The refusal case is the important one and it is stated first in plain words: doing nothing is the
 * safe action, and it is also the default.
 */

const template: Template<OrderTransferRequestedData> = {
  subject: (data) => `Confirm the transfer of order ${data.reference}`,

  html: (data) =>
    shell({
      preheader: "Someone asked to move this order into an account.",
      heading: "Confirm this order is yours.",
      body:
        p(
          `Someone asked to move this order into a ${esc(BRAND)} account. It only moves if you ` +
            `enter the code below.`,
        ) +
        referencePanel(data.reference, data.placedAt) +
        panel(
          label("Order") +
            `<p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;word-break:break-all;color:#f2ead8;">${esc(data.orderId)}</p>` +
            label("Confirmation code") +
            `<p style="margin:0;font-family:Georgia,'Times New Roman',Times,serif;font-size:19px;letter-spacing:0.04em;word-break:break-all;color:#e2c37c;">${esc(data.code)}</p>`,
        ) +
        button(link("/account/claim"), "Enter the code") +
        small(
          `Paste both the order id and the code into ${a(link("/account/claim"), "swasthvica.com/account/claim")}.`,
        ) +
        small(
          `<strong style="color:#f2ead8;">Did not ask for this?</strong> Do nothing. The order stays ` +
            `where it is and nobody else can see it. If you would rather tell us, write to us at ` +
            `${a(link("/contact"), "swasthvica.com/contact")}.`,
        ),
    }),

  text: (data) =>
    textShell("Confirm this order is yours", [
      `Someone asked to move this order into a ${BRAND} account. It only moves if you enter the code below.`,
      "",
      `Reference: ${data.reference}`,
      `Order:     ${data.orderId}`,
      `Code:      ${data.code}`,
      "",
      `Enter both at: ${link("/account/claim")}`,
      "",
      "Did not ask for this? Do nothing. The order stays where it is and nobody else can see it.",
      `If you would rather tell us: ${link("/contact")}`,
    ]),
};

export default template;
