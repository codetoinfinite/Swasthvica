import { readFileSync } from "node:fs";
import path from "node:path";
import type { CreatePromotionDTO, ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows";
import { FREE_SHIPPING_CODE, freeShippingPromotion } from "./free-shipping";

/**
 * Creates the discount codes in Medusa: `npm run seed:promotions`.
 *
 * The offer is authored once, in src/lib/discounts.ts, because that file is also what the browser
 * uses to *preview* a code before checkout. scripts/export-catalogue.mjs snapshots it into
 * data/catalogue.json and this reads the snapshot, so the number the customer is shown and the
 * number Medusa takes off the cart come from the same line of source. `npm run check:promotions`
 * fails the build the moment they stop agreeing.
 *
 * Idempotent like seed.ts: it looks each code up and creates only what is missing. It never
 * updates a promotion Medusa already holds -- once a code exists, the admin is where it is edited,
 * and a seed that overwrote it would silently undo the client's own change. Drift is the check
 * script's job to shout about, not this one's to paper over.
 *
 * Alongside the typed codes it seeds one promotion nobody types: the free-shipping threshold the
 * storefront has always printed. See free-shipping.ts for why that is a promotion and not a second
 * shipping option.
 *
 * WHAT THIS REFUSES TO DO, rather than approximate:
 *  - A percentage promotion with a rupee cap. Medusa 2.19 has no such field, and
 *    getPromotionValueForPercentage (@medusajs/utils/dist/totals/promotion/index.js) multiplies the
 *    full line amount unconditionally. Seeding the uncapped version would quietly give away more
 *    money than the offer promises on every large cart, so it fails loudly instead.
 *  - An expiry date. Medusa expresses that through a campaign's starts_at/ends_at, which nothing
 *    in the catalogue currently needs. A code seeded without the expiry it was written with would
 *    outlive its own offer.
 */

type CataloguePromotion = {
  code: string;
  label: string;
  type: "fixed" | "percentage";
  /** whole rupees for `fixed`, whole percent for `percentage` */
  value: number;
  cap?: number;
  minSubtotal?: number;
  until?: string;
};

type Catalogue = {
  currency: string;
  terms: { freeShippingAbove: number };
  promotions: CataloguePromotion[];
};

/**
 * Restates one snapshot rule as a promotion, or explains why it cannot be one.
 *
 * Returns a string instead of throwing so that one unrepresentable code does not stop the others
 * from being seeded -- a half-seeded store where the failure is named is more useful than an empty
 * one where the first error hid the rest.
 */
function toPromotion(p: CataloguePromotion, currency: string): CreatePromotionDTO | string {
  if (p.until) {
    return `${p.code} expires on ${p.until}. Medusa needs a campaign for that; none is seeded.`;
  }

  if (p.type === "percentage" && p.cap !== undefined) {
    return (
      `${p.code} is ${p.value}% off capped at ₹${p.cap}. Medusa 2.19 cannot cap a percentage ` +
      `promotion -- there is no field for it, and the uncapped version gives away more than the ` +
      `offer states on any cart above ₹${Math.round((p.cap / p.value) * 100)}. Change the offer in ` +
      `src/lib/discounts.ts, re-export, and re-run.`
    );
  }

  if (!(p.value > 0)) return `${p.code} is worth ${p.value}, which is not an offer.`;
  if (p.type === "percentage" && p.value > 100)
    return `${p.code} is ${p.value}%, which is not a discount.`;

  const rules =
    p.minSubtotal === undefined
      ? []
      : [
          {
            // `original_item_total` is the cart's items total including tax and before any
            // adjustment -- which under tax-inclusive INR pricing is exactly the subtotal the
            // storefront prints, and exactly what discounts.ts compares `minSubtotal` against.
            // Promotion-level rules are evaluated against the whole cart (promotion-module.js:511),
            // and rule values must be strings or areRulesValidForContext discards them.
            description: p.label,
            attribute: "original_item_total",
            operator: "gte" as const,
            values: [String(p.minSubtotal)],
          },
        ];

  return {
    code: p.code,
    type: "standard",
    status: "active",
    // Every price in this store is an MRP, inclusive of GST (Legal Metrology r.6(1)(e)). A
    // promotion that was not tax-inclusive would discount the ex-tax figure and take off less than
    // the storefront just promised.
    is_tax_inclusive: true,
    application_method: {
      type: p.type,
      target_type: "items",
      // "across" spreads one discount over the cart, which is what "₹150 off the order" means.
      // max_quantity is illegal with it (validateApplicationMethodAttributes) and would be wrong
      // anyway -- it caps units per line, never rupees per cart.
      allocation: "across",
      value: p.value,
      // A rupee amount only means something in rupees; a percentage means the same in any currency.
      ...(p.type === "fixed" ? { currency_code: currency } : {}),
    },
    rules,
  };
}

export default async function seedPromotions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const catalogue: Catalogue = JSON.parse(
    readFileSync(path.join(__dirname, "..", "data", "catalogue.json"), "utf8"),
  );

  if (!catalogue.promotions?.length) {
    logger.warn("catalogue.json holds no promotions. Run `node scripts/export-catalogue.mjs`.");
    return;
  }

  const { data: existing } = await query.graph({ entity: "promotion", fields: ["code"] });
  const have = new Set((existing as { code: string }[]).map((p) => p.code));

  const toCreate: CreatePromotionDTO[] = [];
  const refused: string[] = [];

  for (const p of catalogue.promotions) {
    if (have.has(p.code)) {
      logger.info(`Promotion ${p.code} already exists -- left as Medusa holds it.`);
      continue;
    }
    const built = toPromotion(p, catalogue.currency);
    if (typeof built === "string") refused.push(built);
    else toCreate.push(built);
  }

  // The one promotion that is not a discount code. Its threshold comes from the same snapshot the
  // storefront's TERMS does, so the cart page and the cart cannot disagree about who ships free.
  const threshold = catalogue.terms?.freeShippingAbove;
  if (typeof threshold !== "number" || !(threshold > 0)) {
    refused.push(
      `catalogue.json has no usable terms.freeShippingAbove, so free delivery cannot be seeded ` +
        `and every qualifying cart would be charged shipping the storefront says is waived.`,
    );
  } else if (have.has(FREE_SHIPPING_CODE)) {
    logger.info(`Promotion ${FREE_SHIPPING_CODE} already exists -- left as Medusa holds it.`);
  } else {
    toCreate.push(freeShippingPromotion(threshold));
  }

  if (toCreate.length) {
    await createPromotionsWorkflow(container).run({ input: { promotionsData: toCreate } });
    logger.info(
      `Created ${toCreate.length} promotion(s): ${toCreate.map((p) => p.code).join(", ")}.`,
    );
  }

  if (refused.length) {
    for (const r of refused) logger.error(r);
    logger.error(
      `${refused.length} discount code(s) could not be expressed in Medusa and were NOT seeded.`,
    );
    process.exit(1);
  }

  logger.info(
    `seed:promotions done. ${catalogue.promotions.length} code(s) plus free delivery accounted for.`,
  );
}
