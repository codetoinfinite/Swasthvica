import { esc, money, shortDate } from "../../../lib/brand";
import { label, PALETTE, panel, row, totalRow } from "./layout";
import type { Address, OrderLine } from "./types";

/* ------------------------------------------------------------------------------------------------
 * The blocks more than one order e-mail needs.
 *
 * Kept here rather than in layout.ts because layout.ts is the chrome -- it knows nothing about
 * orders -- and duplicated in neither, because a line table that renders quantities one way in the
 * confirmation and another in the dispatch note is the kind of small inconsistency a customer reads
 * as carelessness.
 * ---------------------------------------------------------------------------------------------- */

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/** The reference, in figures the customer can read back down a phone line. */
export function referencePanel(reference: string, placedAt: string | null): string {
  const placed = shortDate(placedAt);
  return panel(
    label("Reference") +
      `<p style="margin:0 0 ${placed ? "10px" : "0"};font-family:Georgia,'Times New Roman',Times,serif;font-size:22px;letter-spacing:0.08em;color:${PALETTE.brass300};">${esc(reference)}</p>` +
      (placed
        ? `<p style="margin:0;font-family:${SANS};font-size:13px;color:${PALETTE.cream300};">Placed ${esc(placed)}</p>`
        : ""),
  );
}

/**
 * The items. A `null` currency drops the price column -- the dispatch note lists what is in the box,
 * not what it cost, because the receipt already did that and a second set of figures invites a
 * second reading of them.
 *
 * A table, with the quantity inside the description cell rather than in a column of its own: three
 * columns at 600px hold, but they stop holding at the ~320px a phone gives a mail body, and a
 * squeezed price column wraps mid-number.
 */
export function lineTable(lines: OrderLine[], currency: string | null): string {
  const rows = lines
    .map((line) => {
      const name =
        esc(line.title) +
        (line.variant
          ? ` <span style="color:${PALETTE.cream300};">${esc(line.variant)}</span>`
          : "");
      const qty = `<span style="color:${PALETTE.cream300};"> × ${esc(line.quantity)}</span>`;
      const price = currency
        ? `<td align="right" valign="top" style="padding:10px 0;border-bottom:1px solid ${PALETTE.olive700};font-family:${SANS};font-size:14px;color:${PALETTE.brass300};white-space:nowrap;">${esc(money(line.total, currency))}</td>`
        : "";
      return (
        `<tr><td valign="top" style="padding:10px 12px 10px 0;border-bottom:1px solid ${PALETTE.olive700};font-family:${SANS};font-size:14px;line-height:1.5;color:${PALETTE.cream100};">${name}${qty}</td>` +
        price +
        `</tr>`
      );
    })
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">${rows}</table>`;
}

/** The same items, for the text part. */
export function lineText(lines: OrderLine[], currency: string | null): string[] {
  return lines.map((line) => {
    const name = line.variant ? `${line.title} (${line.variant})` : line.title;
    const price = currency ? `  ${money(line.total, currency)}` : "";
    return `  ${name} x ${line.quantity}${price}`;
  });
}

/** The totals, ruled off and ending on the amount that was charged. */
export function totalsPanel(args: {
  currency: string;
  subtotal: number;
  discount: number;
  discountCode: string | null;
  shipping: number;
  tax: number;
  total: number;
  totalLabel?: string;
}): string {
  const c = args.currency;
  const parts = [row("Items", esc(money(args.subtotal, c)))];
  if (args.discount > 0) {
    parts.push(
      row(
        args.discountCode ? `Discount (${args.discountCode})` : "Discount",
        `− ${esc(money(args.discount, c))}`,
      ),
    );
  }
  parts.push(row("Delivery", args.shipping > 0 ? esc(money(args.shipping, c)) : "Free"));
  // GST on this catalogue is tax-inclusive, so the line is shown for the record rather than added.
  if (args.tax > 0) parts.push(row("GST (included)", esc(money(args.tax, c))));
  parts.push(totalRow(args.totalLabel ?? "Paid", esc(money(args.total, c))));
  return panel(parts.join(""));
}

/** The totals, for the text part. */
export function totalsText(args: {
  currency: string;
  subtotal: number;
  discount: number;
  discountCode: string | null;
  shipping: number;
  tax: number;
  total: number;
  totalLabel?: string;
}): string[] {
  const c = args.currency;
  const out = [`  Items      ${money(args.subtotal, c)}`];
  if (args.discount > 0) {
    out.push(
      `  Discount   - ${money(args.discount, c)}${args.discountCode ? ` (${args.discountCode})` : ""}`,
    );
  }
  out.push(`  Delivery   ${args.shipping > 0 ? money(args.shipping, c) : "Free"}`);
  if (args.tax > 0) out.push(`  GST        ${money(args.tax, c)} (included)`);
  out.push(`  ${args.totalLabel ?? "Paid"}       ${money(args.total, c)}`);
  return out;
}

/** Every non-null part of an address, in the order it would be written on a parcel. */
export function addressLines(address: Address | null): string[] {
  if (!address) return [];
  const cityLine = [address.city, address.province].filter(Boolean).join(", ");
  const regionLine = [cityLine, address.postalCode].filter(Boolean).join(" ");
  return [address.name, address.line1, address.line2, regionLine, address.country, address.phone]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);
}

/** The address, as a panel. Returns "" when there is nothing to show. */
export function addressPanel(address: Address | null, heading = "Going to"): string {
  const lines = addressLines(address);
  if (lines.length === 0) return "";
  return panel(
    label(heading) +
      `<p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.7;color:${PALETTE.cream100};">${lines.map(esc).join("<br />")}</p>`,
  );
}
