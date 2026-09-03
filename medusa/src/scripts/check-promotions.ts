import { readFileSync } from "node:fs";
import path from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { FREE_SHIPPING_CODE } from "./free-shipping";

/**
 * The promotions drift guard. Run in CI and before every deploy: `npm run check:promotions`.
 *
 * src/lib/discounts.ts ships to the browser and can only ever *preview* a discount; Medusa's
 * promotion module is what actually removes money from a cart. Nothing connects the two at runtime
 * -- there is no /store/promotions route to read a definition back from -- so the only thing
 * standing between "10% off" on the cart page and a different number on the card is this file.
 *
 * Every assertion here covers a failure that is otherwise silent. A promotion left `draft` is not
 * an error, it is just a code that says "not one of ours". A missing currency_code on a fixed
 * promotion is not an error, it just applies ₹150 off a cart in any currency. A dropped
 * min-subtotal rule is not an error, it just gives the discount away to everyone.
 *
 * Free delivery is checked here too, under its own rules -- it is the one promotion that is
 * automatic, targets shipping rather than items, and is measured against terms.freeShippingAbove
 * instead of a discount code. A missing one is the worst failure of all: the cart page says
 * delivery is free and the card is charged for it anyway.
 */

type CataloguePromotion = {
  code: string;
  label: string;
  type: "fixed" | "percentage";
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

type MedusaPromotion = {
  code: string;
  status: string;
  is_automatic: boolean;
  is_tax_inclusive: boolean;
  application_method: {
    type: string;
    target_type: string;
    allocation: string | null;
    value: number;
    currency_code: string | null;
    max_quantity: number | null;
  } | null;
  rules: { attribute: string; operator: string; values: { value: string }[] }[];
};

export default async function checkPromotions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const catalogue: Catalogue = JSON.parse(
    readFileSync(path.join(__dirname, "..", "data", "catalogue.json"), "utf8"),
  );
  const currency = catalogue.currency;

  const problems: string[] = [];
  const fail = (msg: string) => problems.push(msg);

  const { data: rows } = await query.graph({
    entity: "promotion",
    fields: [
      "code",
      "status",
      "is_automatic",
      "is_tax_inclusive",
      "application_method.type",
      "application_method.target_type",
      "application_method.allocation",
      "application_method.value",
      "application_method.currency_code",
      "application_method.max_quantity",
      "rules.attribute",
      "rules.operator",
      "rules.values.value",
    ],
  });

  const medusa = new Map((rows as unknown as MedusaPromotion[]).map((p) => [p.code, p]));
  const expected = new Map(catalogue.promotions.map((p) => [p.code, p]));

  for (const p of catalogue.promotions) {
    // Codes discounts.ts can express and Medusa cannot are a real, deploy-blocking disagreement --
    // the storefront offers something the server will not honour. seed-promotions.ts refuses to
    // seed them; this refuses to let the mismatch pass as "not seeded yet".
    if (p.type === "percentage" && p.cap !== undefined) {
      fail(
        `${p.code} is capped at ₹${p.cap} in discounts.ts. Medusa 2.19 cannot cap a percentage ` +
          `promotion, so the storefront is previewing an offer the server cannot apply.`,
      );
      continue;
    }
    if (p.until) {
      fail(`${p.code} expires on ${p.until} in discounts.ts, but no campaign in Medusa ends it.`);
      continue;
    }

    const m = medusa.get(p.code);
    if (!m) {
      fail(
        `${p.code} is offered by discounts.ts but does not exist in Medusa. Run \`npm run seed:promotions\`.`,
      );
      continue;
    }

    // A draft or inactive promotion is rejected at the cart with no explanation the customer can act on.
    if (m.status !== "active")
      fail(`${p.code} is ${m.status} in Medusa, so the code does not work.`);
    if (m.is_automatic)
      fail(`${p.code} is automatic in Medusa -- it applies without being typed in.`);
    // MRPs are tax-inclusive, so a promotion that is not discounts the ex-tax figure and takes off
    // less than the cart page just promised.
    if (!m.is_tax_inclusive)
      fail(`${p.code} is not tax-inclusive, so it discounts the ex-GST amount.`);

    const am = m.application_method;
    if (!am) {
      fail(`${p.code} has no application method in Medusa, so it takes nothing off.`);
      continue;
    }

    if (am.type !== p.type) fail(`${p.code} is ${am.type} in Medusa, ${p.type} in discounts.ts.`);
    // The check this file exists for.
    if (Number(am.value) !== p.value) {
      fail(
        `${p.code} value drift: Medusa takes off ${am.value}, discounts.ts promises ${p.value}.`,
      );
    }
    if (am.target_type !== "items") {
      fail(`${p.code} targets ${am.target_type}, not items -- it would discount the wrong thing.`);
    }
    // "each" or "once" would apply the value per line rather than per cart, turning ₹150 off an
    // order into ₹150 off every bottle in it.
    if (am.allocation !== "across") {
      fail(
        `${p.code} allocation is ${am.allocation}, not across -- it applies per line, not per cart.`,
      );
    }
    if (p.type === "fixed" && am.currency_code !== currency) {
      fail(`${p.code} is a rupee amount but its currency is ${am.currency_code ?? "unset"}.`);
    }

    const rule = m.rules?.find((r) => r.attribute === "original_item_total");
    if (p.minSubtotal === undefined) {
      if (rule) fail(`${p.code} has a minimum in Medusa but none in discounts.ts.`);
    } else if (!rule) {
      fail(`${p.code} requires ₹${p.minSubtotal} in discounts.ts but has no minimum in Medusa.`);
    } else {
      if (rule.operator !== "gte") {
        fail(`${p.code} minimum uses operator ${rule.operator}, not gte.`);
      }
      const values = (rule.values ?? []).map((v) => v.value);
      if (values.length !== 1 || Number(values[0]) !== p.minSubtotal) {
        fail(
          `${p.code} minimum drift: Medusa requires ${values.join(", ") || "nothing"}, ` +
            `discounts.ts requires ${p.minSubtotal}.`,
        );
      }
    }

    // Rules the storefront cannot see are rules it cannot preview: the customer types a code, the
    // cart page says it is worth ₹150, and Medusa silently declines it.
    for (const r of m.rules ?? []) {
      if (r.attribute !== "original_item_total") {
        fail(
          `${p.code} carries an extra Medusa rule on "${r.attribute}" that discounts.ts knows nothing about.`,
        );
      }
    }
  }

  checkFreeShipping(medusa.get(FREE_SHIPPING_CODE), catalogue.terms?.freeShippingAbove, fail);

  for (const code of medusa.keys()) {
    if (code === FREE_SHIPPING_CODE) continue;
    if (!expected.has(code)) {
      fail(
        `Medusa holds promotion "${code}" that discounts.ts never offers -- nothing tells a customer it exists.`,
      );
    }
  }

  if (problems.length) {
    for (const p of problems) logger.error(p);
    logger.error(`check:promotions failed with ${problems.length} problem(s).`);
    process.exit(1);
  }

  logger.info(
    `check:promotions passed. ${catalogue.promotions.length} code(s) and free delivery agree with Medusa.`,
  );
}

/**
 * The free-shipping promotion, asserted against the threshold the storefront prints.
 *
 * Everything here is a way for the cart page and the card statement to disagree in silence: a
 * missing promotion charges ₹79 the customer was told was waived; a value under 100 leaves part of
 * the charge behind; the wrong target discounts the bottles instead of the delivery; a drifted
 * threshold hands free delivery to the wrong baskets in either direction.
 */
function checkFreeShipping(
  m: MedusaPromotion | undefined,
  threshold: number | undefined,
  fail: (msg: string) => void,
) {
  if (typeof threshold !== "number" || !(threshold > 0)) {
    fail(
      `catalogue.json has no usable terms.freeShippingAbove. Re-run \`node scripts/export-catalogue.mjs\`.`,
    );
    return;
  }

  if (!m) {
    fail(
      `Free delivery over ₹${threshold} is promised on the cart and checkout pages but no such ` +
        `promotion exists in Medusa, so every qualifying cart is charged for shipping. ` +
        `Run \`npm run seed:promotions\`.`,
    );
    return;
  }

  if (m.status !== "active") fail(`Free delivery is ${m.status} in Medusa, so it never applies.`);
  // Nobody is ever shown this code to type. If it stopped being automatic it would simply stop.
  if (!m.is_automatic) fail(`Free delivery is not automatic in Medusa, so it is never applied.`);
  if (!m.is_tax_inclusive)
    fail(`Free delivery is not tax-inclusive, so it waives the ex-GST fare.`);

  const am = m.application_method;
  if (!am) {
    fail(`Free delivery has no application method in Medusa, so it takes nothing off.`);
    return;
  }
  if (am.target_type !== "shipping_methods") {
    fail(
      `Free delivery targets ${am.target_type}, not shipping_methods -- it discounts the goods.`,
    );
  }
  if (am.allocation !== "across") {
    fail(`Free delivery allocation is ${am.allocation}, not across.`);
  }
  if (am.type !== "percentage" || Number(am.value) !== 100) {
    fail(
      `Free delivery is ${am.type} ${am.value} in Medusa, not 100% -- part of the shipping charge survives.`,
    );
  }

  const rule = m.rules?.find((r) => r.attribute === "item_total");
  if (!rule) {
    fail(
      `Free delivery has no item_total minimum in Medusa, so every cart ships free regardless of size.`,
    );
    return;
  }
  if (rule.operator !== "gte")
    fail(`Free delivery minimum uses operator ${rule.operator}, not gte.`);
  const values = (rule.values ?? []).map((v) => v.value);
  if (values.length !== 1 || Number(values[0]) !== threshold) {
    fail(
      `Free delivery threshold drift: Medusa waives shipping above ${values.join(", ") || "nothing"}, ` +
        `the storefront promises ₹${threshold}.`,
    );
  }
  for (const r of m.rules ?? []) {
    if (r.attribute !== "item_total") {
      fail(
        `Free delivery carries an extra Medusa rule on "${r.attribute}" the storefront cannot see.`,
      );
    }
  }
}
