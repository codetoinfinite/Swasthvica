"use client";
import { TERMS } from "@/lib/business";
import { formatINR } from "@/lib/products";
import type { Totals } from "@/lib/cart";

/**
 * How far the basket is from free delivery.
 *
 * The threshold is not news to the customer -- it is on the PDP, the shipping page and the pricing
 * page -- but the distance to it is, and it is the one number that is different for every basket.
 *
 * The bar is `aria-hidden` and the sentence above it is the accessible content, because a
 * progressbar role here would announce "62 percent" to a screen reader when the useful fact is
 * "₹350 more". The fill transition is dropped under prefers-reduced-motion: it is a decorative
 * animation on a value that changes as a side effect of pressing a button somewhere else on screen.
 */
export default function FreeShipBar({ totals }: { totals: Totals }) {
  if (totals.lines.length === 0) return null;

  const pct = totals.freeShipping
    ? 100
    : Math.min(99, Math.round(((TERMS.freeShippingAbove - totals.toFreeShipping) / TERMS.freeShippingAbove) * 100));

  return (
    <div className="rounded-lg border border-olive-700/70 bg-olive-950/40 px-4 py-3">
      <p className="text-[12.5px] leading-snug text-cream-200/80">
        {totals.freeShipping ? (
          <>
            <span className="text-brass-300">Delivery is on us.</span> Dispatched within{" "}
            {TERMS.dispatchDays}.
          </>
        ) : (
          <>
            Add <span className="text-brass-300 tabular-nums">{formatINR(totals.toFreeShipping)}</span>{" "}
            more for free delivery.
          </>
        )}
      </p>
      <div aria-hidden className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-olive-700/70">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brass-600 to-brass-400 transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
