import { TERMS } from "@/lib/business";
import type { Product } from "@/lib/products";

/**
 * One cart, four surfaces.
 *
 * The drawer, the cart page, the checkout and the confirmation all have to agree on the same
 * arithmetic, and until now the drawer was the only one that had it -- inline, halfway down a
 * component. Four copies of "subtotal >= freeShippingAbove" is four chances for the shipping line
 * on the cart page to disagree with the shipping line on the checkout, which is the one class of
 * bug a customer reads as dishonesty rather than as a bug.
 *
 * Everything here is pure and synchronous: given the persisted lines and an optional code, it
 * returns what the customer owes. Nothing in here talks to a network, and nothing in here is
 * authoritative -- see the note on discounts in src/lib/discounts.ts.
 */

export type CartLine = { slug: string; qty: number };

/** The per-line ceiling. The store clamps to it; the + button greys out at it. */
export const MAX_QTY = 99;

export type ResolvedLine = {
  product: Product;
  qty: number;
  /** price * qty, in whole rupees */
  amount: number;
};

export type Discount = {
  code: string;
  label: string;
  /** whole rupees taken off the subtotal */
  amount: number;
};

export type Totals = {
  lines: ResolvedLine[];
  /** total number of bottles, not number of rows */
  count: number;
  subtotal: number;
  discount: Discount | null;
  shipping: number;
  total: number;
  /** rupees still to spend before shipping is free; 0 once it is */
  toFreeShipping: number;
  freeShipping: boolean;
};

/**
 * Lines whose slug has left the catalog are dropped rather than rendered as a blank row. The store
 * already filters these on rehydrate; this is the second gate, for a catalog edit that lands while
 * a tab is open.
 *
 * The catalogue is passed in rather than imported. Prices are Medusa's, they arrive with the page,
 * and a default argument here would be a quiet way for one of these four surfaces to keep totting
 * up the seed numbers in src/lib/products.ts long after the real ones had moved.
 */
export function resolveLines(cart: CartLine[], catalogue: Product[]): ResolvedLine[] {
  const out: ResolvedLine[] = [];
  for (const line of cart) {
    const product = catalogue.find((p) => p.slug === line.slug);
    if (!product) continue;
    out.push({ product, qty: line.qty, amount: product.price * line.qty });
  }
  return out;
}

export function totals(
  cart: CartLine[],
  catalogue: Product[],
  discount: Discount | null = null,
): Totals {
  const lines = resolveLines(cart, catalogue);
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  // A code can never take the order below zero, and can never be worth more than the goods.
  const off = discount ? Math.min(discount.amount, subtotal) : 0;
  const payable = subtotal - off;

  // The threshold is read against what the customer actually pays, not the pre-discount subtotal:
  // a 20% code that drops the order under the bar has to drop it under the bar, or the free
  // shipping is being given away on money nobody spent.
  const empty = lines.length === 0;
  const freeShipping = empty || payable >= TERMS.freeShippingAbove;
  const shipping = freeShipping ? 0 : TERMS.shippingFlat;

  return {
    lines,
    count: lines.reduce((sum, l) => sum + l.qty, 0),
    subtotal,
    discount: discount && off > 0 ? { ...discount, amount: off } : null,
    shipping,
    total: payable + shipping,
    toFreeShipping: empty || freeShipping ? 0 : TERMS.freeShippingAbove - payable,
    freeShipping: !empty && freeShipping,
  };
}
