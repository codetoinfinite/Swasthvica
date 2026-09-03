/**
 * Writes the commerce-facing slice of the storefront catalogue to medusa/src/data/catalogue.json.
 *
 * This is the one direction data may flow across the hybrid seam (docs/BACKEND-PLAN.md 4).
 * src/lib/products.ts is the source of truth for everything editorial; Medusa is the source of
 * truth for price and stock. The seed needs to know which handles to create and what they are
 * called, so it reads a generated snapshot rather than a hand-maintained copy -- a hand-maintained
 * copy is the drift the drift guard exists to catch, and there is no reason to author it twice.
 *
 * Node 24 strips TypeScript natively, and src/lib/products.ts imports nothing, so the real module
 * is imported here rather than parsed. If that stops being true, this script fails loudly instead
 * of emitting a stale file.
 *
 * `price` is included as the value to seed a *fresh* database with. It is not authoritative after
 * that: once Medusa holds a price, Medusa's price wins and the seed leaves it alone.
 *
 * The same applies to `promotions`, snapshotted from src/lib/discounts.ts. That file ships to the
 * browser and can only ever preview a discount; Medusa's promotion module is what removes money
 * from a cart. Exporting the table rather than retyping it in the seed is what keeps the number the
 * customer is shown and the number the customer is charged the same number.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const out = resolve(root, "medusa/src/data/catalogue.json");

const { products } = await import(resolve(root, "src/lib/products.ts"));
const { TERMS } = await import(resolve(root, "src/lib/business.ts"));
const { RULES } = await import(resolve(root, "src/lib/discounts.ts"));
const { STATES } = await import(resolve(root, "src/lib/order.ts"));

if (!Array.isArray(products) || products.length === 0) {
  throw new Error("src/lib/products.ts exported no products");
}
if (!Array.isArray(RULES) || RULES.length === 0) {
  throw new Error("src/lib/discounts.ts exported no rules");
}
if (!Array.isArray(STATES) || STATES.length !== 36) {
  throw new Error(`src/lib/order.ts exported ${STATES?.length ?? 0} states, expected 36`);
}

/**
 * Restates one discount rule in the promotion module's own vocabulary.
 *
 * discounts.ts writes a percentage as a fraction because that is what multiplies a subtotal;
 * Medusa stores whole percent because that is what it divides by 100. Converting here, once, is
 * cheaper than two systems that each believe "10" means something different.
 */
function toPromotion(rule) {
  if (!rule.code || !rule.label) throw new Error(`discount rule ${rule.code ?? "?"} is incomplete`);

  const base = { code: rule.code, label: rule.label };
  if (rule.minSubtotal !== undefined) base.minSubtotal = rule.minSubtotal;
  if (rule.until !== undefined) base.until = rule.until;

  if ("flat" in rule.off) {
    if (!(rule.off.flat > 0)) throw new Error(`${rule.code}: flat amount must be positive`);
    return { ...base, type: "fixed", value: rule.off.flat };
  }

  const { percent, cap } = rule.off;
  if (!(percent > 0) || percent >= 1) {
    // A fraction, not whole percent. 0.1 is ten percent; 10 would be a thousand.
    throw new Error(`${rule.code}: percent must be a fraction between 0 and 1, got ${percent}`);
  }
  const out = { ...base, type: "percentage", value: percent * 100 };
  if (cap !== undefined) out.cap = cap;
  return out;
}

const snapshot = {
  $generated: "scripts/export-catalogue.mjs -- do not edit by hand",
  currency: "inr",
  terms: {
    shippingFlat: TERMS.shippingFlat,
    freeShippingAbove: TERMS.freeShippingAbove,
  },
  products: products.map((p) => {
    for (const k of ["slug", "name", "size", "status", "genericName"]) {
      if (!p[k]) throw new Error(`product ${p.slug ?? "?"} is missing ${k}`);
    }
    if (p.status === "live" && !(p.price > 0)) {
      throw new Error(`live product ${p.slug} has no price`);
    }
    return {
      // handle === slug. The whole seam.
      handle: p.slug,
      title: p.name,
      // Uppercased slug, so a picker reading a label off a box can find the row.
      sku: p.slug.toUpperCase(),
      size: p.size,
      status: p.status,
      family: p.family,
      genericName: p.genericName,
      price: p.price,
    };
  }),
  promotions: RULES.map(toPromotion),
  // The checkout form's state list, snapshotted so the backend can check its own copy against it.
  // The india-gst provider decides CGST+SGST vs IGST by comparing the seller's state to the one on
  // the delivery address, and both sides have to agree on how "Jammu and Kashmir" is spelled.
  states: STATES,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");
console.log(
  `catalogue: ${snapshot.products.length} products, ${snapshot.promotions.length} promotions, ` +
    `${snapshot.states.length} states -> ${out}`,
);
