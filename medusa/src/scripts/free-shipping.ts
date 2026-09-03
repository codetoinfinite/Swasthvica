import type { CreatePromotionDTO } from "@medusajs/framework/types";

/**
 * The free-shipping offer, in the one form Medusa can express it.
 *
 * The storefront has promised "free delivery over ₹999" since the cart page was written
 * (src/lib/cart.ts, TERMS.freeShippingAbove) and prints it on the cart, the checkout, the product
 * page and the shipping policy. Medusa, meanwhile, holds a single flat ₹79 shipping option --
 * seed.ts deferred the threshold to "the promotions phase" and the promotions phase shipped
 * without it. Every basket at or above the threshold would have been charged ₹79 more than the
 * number the customer was shown. This closes that.
 *
 * WHY A PROMOTION AND NOT A SECOND SHIPPING OPTION. Medusa can gate a shipping option behind a
 * rule, but the rules a shipping option accepts are cart *attributes*, and the option list is
 * priced before the customer has finished building the cart -- a basket that crosses ₹999 after a
 * discount code would keep the paid option it was quoted. A promotion is recomputed on every cart
 * refresh (addShippingMethodToCartWorkflow -> refreshCartItemsWorkflow -> updateCartPromotionsWorkflow),
 * so it follows the cart rather than the moment the shipping method was attached.
 *
 * WHY `item_total` AND NOT `original_item_total`. The storefront gives free shipping on the
 * *payable* figure -- subtotal after any discount code (cart.ts: `payable >= freeShippingAbove`).
 * `item_total` is the items total after adjustments and inclusive of tax, which under tax-inclusive
 * INR pricing is exactly that number. `original_item_total` is the pre-discount one and would give
 * free delivery away on a cart that no longer qualifies.
 *
 * THE ONE-REFRESH LAG, and why it is not engineered around. computeActions evaluates rules against
 * the cart's current adjustments (promotion-module.js), so a just-typed code can leave `item_total`
 * one pass behind. To be bitten, a cart would need `original_item_total >= 1200` (TWOBOTTLES' own
 * minimum) *and* `original_item_total - 150 < 999`, i.e. under ₹1149 -- an empty range. With the
 * shelf as it stands (₹599, ₹649, ₹699, ₹749, ₹899) no basket can reach it. If a cheaper SKU or a
 * larger code ever opens that gap, this comment is where to start.
 */

/**
 * Automatic promotions are never typed, but Medusa still keys every promotion by `code` --
 * computeActions builds its adjustment map from it. It is visible to nobody but the admin.
 */
export const FREE_SHIPPING_CODE = "FREESHIPPING";

/** `threshold` is the rupee figure from catalogue.json's `terms.freeShippingAbove`. */
export function freeShippingPromotion(threshold: number): CreatePromotionDTO {
  return {
    code: FREE_SHIPPING_CODE,
    type: "standard",
    status: "active",
    // Nobody types this. It applies the moment the cart qualifies, which is what the storefront
    // has already told the customer will happen.
    is_automatic: true,
    is_tax_inclusive: true,
    application_method: {
      // 100% of the shipping subtotal. applyPromotionToShippingMethods under ACROSS + PERCENTAGE
      // takes min(value/100 * applicableTotal, applicableTotal), so this removes the whole charge
      // and cannot go negative if the flat rate ever changes.
      type: "percentage",
      target_type: "shipping_methods",
      allocation: "across",
      value: 100,
      // No target_rules: areRulesValidForContext returns true for an empty list, so this covers
      // every shipping method the store ever offers rather than naming today's only one.
    },
    rules: [
      {
        description: `Order total of ${threshold} or more`,
        attribute: "item_total",
        operator: "gte",
        values: [String(threshold)],
      },
    ],
  };
}
