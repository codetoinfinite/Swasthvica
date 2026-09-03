import { readFileSync } from "node:fs";
import path from "node:path";
import type { CreateTaxRateDTO, CreateTaxRateRuleDTO, ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createTaxRateRulesWorkflow, createTaxRatesWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Loads the GST classification into Medusa: `npm run seed:gst`.
 *
 * WHAT THIS BUILDS, AND WHY IT LOOKS LIKE THIS
 *
 * The india-gst provider is handed its rates by the tax module; it never looks anything up. A tax
 * provider is loaded into its own container (modules-sdk/dist/loaders/utils/load-internal.js
 * registers only the module's declared dependencies, and the TAX definition declares LOGGER and
 * EVENT_BUS), so it cannot query products even if it wanted to. What it gets instead is
 * `{ line_item, rates }`, assembled by `getTaxRatesForItem` in
 * tax/dist/services/tax-module-service.js from `tax_rate_rule` rows matching
 * `{ reference: "product", reference_id }`.
 *
 * So the classification has to be in the database, shaped as the module expects:
 *
 *   tax_rate       code = the HSN, rate = the TOTAL GST percent, one row per HSN
 *   tax_rate_rule  one row per product, pointing at the rate its HSN carries
 *
 * The numbers come from src/data/gst.json, which is hand-authored and ships empty because HSN
 * classification is the client's CA's call (docs/BACKEND-PLAN.md 17.2). This refuses to run rather
 * than guess: a wrong HSN is a tax invoice that cannot be filed, and unlike a wrong price nobody
 * notices it until an assessment.
 *
 * Idempotent in the same shape as seed-promotions.ts, and for the same reason. An HSN Medusa
 * already holds is left exactly as it is -- the admin is where a rate is edited, and a seed that
 * overwrote it would silently undo the client's own correction. It only ever adds: a new HSN, or a
 * product newly classified under an HSN that already exists. `npm run check:catalogue` is what
 * shouts when the database and this file have drifted apart.
 */

type Gst = {
  /** HSN code -> total GST percentage for it (18, not 9). */
  rates: Record<string, number | null>;
  /** storefront slug (= Medusa product handle) -> the HSN it is classified under */
  products: Record<string, string | null>;
};

type Catalogue = { products: { handle: string; title: string }[] };

/** 4, 6 and 8 digit HSN codes all appear on GST invoices; anything else is a typo. */
const HSN = /^\d{4,8}$/;

export default async function seedGst({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const data = (name: string) =>
    JSON.parse(readFileSync(path.join(__dirname, "..", "data", name), "utf8"));
  const gst: Gst = data("gst.json");
  const catalogue: Catalogue = data("catalogue.json");

  // ------------------------------------------------------------ read the file
  //
  // Every one of these is a way of being half-configured, and every one of them ends as tax that
  // is silently absent or silently wrong. None of them is worth continuing past.
  const problems: string[] = [];

  for (const p of catalogue.products) {
    const hsn = gst.products[p.handle];
    if (hsn === undefined) {
      problems.push(`${p.handle} (${p.title}) is not in gst.json's \`products\`. Add it.`);
    } else if (hsn === null || hsn === "") {
      problems.push(`${p.handle} (${p.title}) has no HSN yet. The client's CA classifies it.`);
    } else if (!HSN.test(hsn)) {
      problems.push(`${p.handle} is classified as "${hsn}", which is not an HSN code.`);
    } else if (!(hsn in gst.rates)) {
      problems.push(`${p.handle} is HSN ${hsn}, but gst.json's \`rates\` has no rate for it.`);
    }
  }

  for (const [hsn, rate] of Object.entries(gst.rates)) {
    if (!HSN.test(hsn)) problems.push(`"${hsn}" in \`rates\` is not an HSN code.`);
    if (rate === null) problems.push(`HSN ${hsn} has no rate yet.`);
    else if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      problems.push(`HSN ${hsn} is ${rate}%, which is not a GST rate.`);
    }
  }

  if (problems.length) {
    for (const p of problems) logger.error(p);
    logger.error(
      `seed:gst refuses to guess. Fill in medusa/src/data/gst.json -- the HSN each product is ` +
        `classified under and the total GST percentage that HSN carries -- and run this again. ` +
        `Until then no product has a tax rate, and the storefront will refuse to price a cart ` +
        `rather than charge nothing.`,
    );
    process.exit(1);
  }

  // ----------------------------------------------------------- the tax region
  //
  // Rates hang off the country-level row, the one seed.ts creates. Without it the tax module
  // returns no lines at all, and does it silently (tax-module-service.js: `if (!parentRegion)
  // return []`), so an absent region has to be an error here rather than an empty run.
  const { data: regions } = await query.graph({
    entity: "tax_region",
    fields: ["id", "country_code", "province_code"],
    filters: { country_code: "in" },
  });
  const region = (regions as { id: string; province_code: string | null }[] | undefined)?.find(
    (r) => r.province_code === null,
  );
  if (!region) {
    logger.error("No tax region for India. Run `npm run seed` first.");
    process.exit(1);
  }

  // ------------------------------------------------------------- the products
  const handles = Object.keys(gst.products).filter((h) => gst.products[h]);
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: handles },
  });
  const productId = new Map(
    (products as { id: string; handle: string }[]).map((p) => [p.handle, p.id]),
  );
  const unknown = handles.filter((h) => !productId.has(h));
  if (unknown.length) {
    logger.error(
      `gst.json classifies ${unknown.join(", ")}, which Medusa has no product for. Run ` +
        `\`npm run seed\`, or correct the slug.`,
    );
    process.exit(1);
  }

  // ------------------------------------------------------- what already exists
  const { data: rates } = await query.graph({
    entity: "tax_rate",
    fields: [
      "id",
      "code",
      "rate",
      "name",
      "tax_region_id",
      "rules.reference",
      "rules.reference_id",
    ],
  });
  type RateRow = {
    id: string;
    code: string;
    rate: number | null;
    tax_region_id: string;
    rules: { reference: string; reference_id: string }[];
  };
  const existing = new Map(
    (rates as unknown as RateRow[])
      .filter((r) => r.tax_region_id === region.id)
      .map((r) => [r.code, r]),
  );

  // Which products each HSN covers, from the file.
  const covers = new Map<string, string[]>();
  for (const [handle, hsn] of Object.entries(gst.products)) {
    if (!hsn) continue;
    covers.set(hsn, [...(covers.get(hsn) ?? []), productId.get(handle)!]);
  }

  const newRates: CreateTaxRateDTO[] = [];
  const newRules: CreateTaxRateRuleDTO[] = [];
  const drift: string[] = [];

  for (const [hsn, ids] of covers) {
    const percent = gst.rates[hsn]!;
    const rule = (reference_id: string) => ({ reference: "product", reference_id });
    const held = existing.get(hsn);

    if (!held) {
      newRates.push({
        tax_region_id: region.id,
        code: hsn,
        rate: percent,
        // Only ever read in the admin: the provider replaces it with the head it charges under,
        // so what reaches an invoice is "CGST 9%", not this.
        name: `GST ${percent}% (HSN ${hsn})`,
        rules: ids.map(rule),
      });
      continue;
    }

    if (held.rate !== percent) {
      drift.push(
        `HSN ${hsn} is ${percent}% in gst.json and ${held.rate}% in Medusa. Left as Medusa ` +
          `holds it -- change it in the admin, or correct gst.json.`,
      );
    }
    const already = new Set(
      held.rules.filter((r) => r.reference === "product").map((r) => r.reference_id),
    );
    for (const id of ids) {
      if (!already.has(id)) newRules.push({ ...rule(id), tax_rate_id: held.id });
    }
  }

  // ------------------------------------------------------------------ write
  if (newRates.length) {
    await createTaxRatesWorkflow(container).run({ input: newRates });
    logger.info(
      `Created ${newRates.length} GST rate(s): ${newRates.map((r) => r.code).join(", ")}.`,
    );
  }
  if (newRules.length) {
    await createTaxRateRulesWorkflow(container).run({ input: { rules: newRules } });
    logger.info(`Attached ${newRules.length} product(s) to a GST rate that already existed.`);
  }
  for (const d of drift) logger.warn(d);

  if (!newRates.length && !newRules.length) {
    logger.info("GST rates already match gst.json. Nothing to create.");
  }
  logger.info(
    `seed:gst done. ${catalogue.products.length} product(s) classified across ` +
      `${covers.size} HSN code(s).`,
  );
}
