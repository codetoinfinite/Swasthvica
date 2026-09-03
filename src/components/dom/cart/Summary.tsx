import Fact from "@/components/dom/legal/Fact";
import { LEGAL_NAME, TERMS } from "@/lib/business";
import { formatINR } from "@/lib/products";
import type { Totals } from "@/lib/cart";

/**
 * The price breakup, on all three surfaces that show one.
 *
 * Rule 7(1)(e) of the Consumer Protection (E-Commerce) Rules 2020 requires a breakup of the total
 * price with every separate charge named -- delivery included -- shown before the order is placed
 * rather than after. Every figure here comes from the same TERMS object as /shipping and /pricing,
 * so the three cannot drift apart.
 *
 * `tabular-nums` on every amount is not styling: the column is right-aligned, and proportional
 * digits leave the rupee figures visibly ragged against the total.
 */
export default function Summary({ totals, className = "" }: { totals: Totals; className?: string }) {
  const { count, subtotal, discount, shipping, total } = totals;
  return (
    <div className={className}>
      <dl className="space-y-1.5 text-[13px] text-cream-300/70">
        <div className="flex justify-between gap-4">
          <dt>
            Items <span className="text-cream-300/60">({count})</span>
          </dt>
          <dd className="tabular-nums">{formatINR(subtotal)}</dd>
        </div>

        {discount && (
          <div className="flex justify-between gap-4 text-brass-300/85">
            <dt>
              Discount <span className="font-mono text-[11px] tracking-wider">{discount.code}</span>
            </dt>
            <dd className="tabular-nums">− {formatINR(discount.amount)}</dd>
          </div>
        )}

        <div className="flex justify-between gap-4">
          <dt>
            Delivery
            {shipping === 0 && count > 0 && (
              <span className="ml-1.5 text-brass-400/75">
                free over {formatINR(TERMS.freeShippingAbove)}
              </span>
            )}
          </dt>
          <dd className="tabular-nums">{shipping === 0 ? "Free" : formatINR(shipping)}</dd>
        </div>

        <div className="flex justify-between gap-4 text-cream-300/60">
          <dt>Taxes</dt>
          <dd>Included in the price</dd>
        </div>
      </dl>

      <div className="mt-3.5 flex items-baseline justify-between gap-4 border-t border-olive-700/60 pt-3.5 text-cream-100">
        <span className="tracking-wide">{count === 0 ? "Subtotal" : "Total to pay"}</span>
        <span className="font-display text-xl tabular-nums text-brass-300">{formatINR(total)}</span>
      </div>

      {/* Visa and Mastercard both require the transaction currency, the merchant's country of
          domicile and its permanent establishment to appear as text on the checkout screen or the
          screen immediately before it -- explicitly not only behind a hyperlink. */}
      <p className="mt-2.5 text-[11px] leading-relaxed text-cream-300/60">
        All prices are in Indian Rupees (INR ₹), inclusive of all taxes. Sold and shipped from India
        by <Fact value={LEGAL_NAME} />.
      </p>
    </div>
  );
}
