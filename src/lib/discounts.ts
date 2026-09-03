import type { Discount } from "@/lib/cart";

/**
 * Discount codes: authored here, enforced by Medusa, previewed in the browser.
 *
 * SECURITY, and it is not a small one: everything in this file ships to the customer. A code table
 * in a client bundle is a code table anybody can read, and a total computed in a browser is a total
 * anybody can edit. This is fine for exactly one job -- showing the customer what a code is worth
 * before they commit -- and is not fine as the thing that decides what gets charged.
 *
 * The enforcing copy now lives in Medusa's promotion module. `scripts/export-catalogue.mjs`
 * snapshots RULES into medusa/src/data/catalogue.json, `npm run seed:promotions` creates the
 * matching promotions, and `npm run check:promotions` exits non-zero the moment the two disagree.
 * So the offer is written once, here, and the server is what actually takes money off a cart. The
 * table still ships to the browser, so nothing in it may be worth more than a code found on a
 * poster: no staff codes, no "50% off everything" left lying in a bundle, nothing whose leak costs
 * anything.
 *
 * `minSubtotal` is checked against the pre-discount subtotal, which is the reading a customer
 * expects: "spend 1500, get 200 off" means spend 1500 on goods. Medusa is given the same reading --
 * a rule on the cart's `original_item_total`, the tax-inclusive items total before any adjustment.
 */

export type Rule = {
  code: string;
  label: string;
  /** whole rupees off, or a fraction of the subtotal -- one or the other, never both */
  off: { flat: number } | { percent: number; cap?: number };
  minSubtotal?: number;
  /** ISO date, exclusive. Undefined means it does not expire. */
  until?: string;
};

export const RULES: Rule[] = [
  {
    code: "FIRSTVALLEY",
    label: "10% off your first order",
    off: { percent: 0.1, cap: 150 },
    minSubtotal: 599,
  },
  {
    code: "TWOBOTTLES",
    label: "₹150 off two bottles or more",
    off: { flat: 150 },
    minSubtotal: 1200,
  },
];

export type CodeResult = { ok: true; discount: Discount } | { ok: false; reason: string };

const norm = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, "");

export function applyCode(raw: string, subtotal: number, now = new Date()): CodeResult {
  const code = norm(raw);
  if (!code) return { ok: false, reason: "Enter a code." };

  const rule = RULES.find((r) => r.code === code);
  if (!rule) return { ok: false, reason: "That code is not one of ours." };

  if (rule.until && now >= new Date(rule.until)) {
    return { ok: false, reason: "That code has expired." };
  }

  if (rule.minSubtotal && subtotal < rule.minSubtotal) {
    const short = rule.minSubtotal - subtotal;
    return { ok: false, reason: `Add ₹${short.toLocaleString("en-IN")} more to use this code.` };
  }

  const amount =
    "flat" in rule.off
      ? rule.off.flat
      : Math.min(rule.off.cap ?? Infinity, Math.floor(subtotal * rule.off.percent));

  if (amount <= 0) return { ok: false, reason: "That code is worth nothing on this order." };

  return { ok: true, discount: { code: rule.code, label: rule.label, amount } };
}
