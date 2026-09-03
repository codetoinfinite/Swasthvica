"use client";
import { consentFor, useConsent } from "@/lib/consent";
import type { Totals } from "@/lib/cart";
import type { Product } from "@/lib/products";

/**
 * The measurement layer -- one call site shape, no vendor.
 *
 * No tag is installed. What is installed is the seam: every commerce moment in the site calls
 * `track()`, the payload is shaped the way GA4's recommended e-commerce events are shaped, and it
 * lands on `window.dataLayer`. Dropping a container in later is then a script tag and nothing else,
 * rather than a hunt through twenty components for the places an event should have been.
 *
 * Consent is enforced here rather than at each call site, because a rule enforced in twenty places
 * is a rule broken in one of them. Three states, three behaviours:
 *
 *   granted    -> straight through to the dataLayer
 *   refused    -> dropped on the floor, permanently
 *   undecided  -> held in memory, and replayed only if the visitor later says yes
 *
 * The buffer is capped and lives in a module variable: nothing is written to disk before consent,
 * because a queue of the visitor's browsing sitting in localStorage while they have not agreed to
 * be measured is the exact thing the consent was for.
 */

type Props = Record<string, unknown>;
type Event = { event: string; ts: number } & Props;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

const MAX_HELD = 30;
let held: Event[] = [];
let watching = false;

function push(e: Event) {
  if (typeof window === "undefined") return;
  (window.dataLayer ??= []).push(e);
}

/**
 * Subscribed lazily, on the first event of the session, so a visitor who never triggers one never
 * pays for the subscription. Once the answer is in, the subscription is dropped: after that every
 * call is a straight consent read and a push.
 */
function watch() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  const stop = useConsent.subscribe((s) => {
    if (s.analytics === null) return;
    if (s.analytics) for (const e of held) push(e);
    held = [];
    stop();
    watching = false;
  });
}

export function track(event: string, props: Props = {}) {
  if (typeof window === "undefined") return;
  const payload: Event = { event, ts: Date.now(), ...props };
  if (consentFor("analytics")) return push(payload);
  if (useConsent.getState().analytics === false) return;
  // undecided: hold it, oldest first out
  held.push(payload);
  if (held.length > MAX_HELD) held.shift();
  watch();
}

// ── the commerce vocabulary ────────────────────────────────────────────────────────────────────
// GA4 wants `items` with `item_id`/`item_name`/`price`/`quantity`, and `value`/`currency` beside
// them. Shaping it here means a call site never has to remember that.

const item = (p: Product, qty = 1) => ({
  item_id: p.slug,
  item_name: p.name,
  item_category: p.categoryCaps,
  price: p.price,
  quantity: qty,
});

const money = (value: number) => ({ currency: "INR", value });

export const ev = {
  viewItem: (p: Product) => track("view_item", { ...money(p.price), items: [item(p)] }),

  addToCart: (p: Product, qty = 1) =>
    track("add_to_cart", { ...money(p.price * qty), items: [item(p, qty)] }),

  removeFromCart: (p: Product, qty = 1) =>
    track("remove_from_cart", { ...money(p.price * qty), items: [item(p, qty)] }),

  viewCart: (t: Totals) =>
    track("view_cart", { ...money(t.subtotal), items: t.lines.map((l) => item(l.product, l.qty)) }),

  beginCheckout: (t: Totals) =>
    track("begin_checkout", {
      ...money(t.total),
      coupon: t.discount?.code,
      items: t.lines.map((l) => item(l.product, l.qty)),
    }),

  addShippingInfo: (t: Totals) =>
    track("add_shipping_info", {
      ...money(t.total),
      shipping_tier: t.shipping === 0 ? "free" : "flat",
      items: t.lines.map((l) => item(l.product, l.qty)),
    }),

  addPaymentInfo: (t: Totals, method: string) =>
    track("add_payment_info", {
      ...money(t.total),
      payment_type: method,
      items: t.lines.map((l) => item(l.product, l.qty)),
    }),

  purchase: (ref: string, t: Totals) =>
    track("purchase", {
      transaction_id: ref,
      ...money(t.total),
      shipping: t.shipping,
      coupon: t.discount?.code,
      items: t.lines.map((l) => item(l.product, l.qty)),
    }),

  paymentFailed: (ref: string, reason: string) =>
    track("payment_failed", { transaction_id: ref, reason }),

  selectPromotion: (code: string) => track("select_promotion", { promotion_name: code }),

  search: (term: string, results: number) => track("search", { search_term: term, results }),
};
