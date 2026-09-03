import { readFileSync } from "node:fs";
import path from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { GST_PROVIDER } from "../modules/india-gst";
import { STATES, matchState } from "../modules/india-gst/states";

/**
 * The drift guard. Run in CI and before every deploy: `npm run check:catalogue`.
 *
 * Two systems describe the same five bottles. src/lib/products.ts holds the editorial half and is
 * rendered on the server, so it is what a customer sees first; Medusa holds price, stock and tax and
 * is what actually charges the card. Nothing in either system stops them disagreeing -- and the way
 * that disagreement surfaces is a page that says 649 and a card charged 749, which is the single
 * most trust-destroying bug this site could ship.
 *
 * So this asserts they agree, and exits non-zero when they do not. Every check here exists because
 * its absence would be silent: none of these failures throw on their own, they just quietly charge
 * the wrong amount or hide a product.
 */

type CatalogueProduct = {
  handle: string;
  title: string;
  sku: string;
  status: "live" | "soon";
  price: number;
};

type Catalogue = { currency: string; products: CatalogueProduct[]; states: string[] };

/** src/data/gst.json. Ships empty; see seed-gst.ts. */
type Gst = { rates: Record<string, number | null>; products: Record<string, string | null> };

export default async function checkCatalogue({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const data = (name: string) =>
    JSON.parse(readFileSync(path.join(__dirname, "..", "data", name), "utf8"));
  const catalogue: Catalogue = data("catalogue.json");
  const gst: Gst = data("gst.json");
  const currency = catalogue.currency;

  const problems: string[] = [];
  const warnings: string[] = [];
  const fail = (msg: string) => problems.push(msg);
  // Things that are wrong but not this repo's to fix: a client input nobody here can invent. Said
  // out loud every run so they are not rediscovered, but they do not fail the build.
  const warn = (msg: string) => warnings.push(msg);

  // ------------------------------------------------------------------ products
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "status",
      "variants.sku",
      "variants.manage_inventory",
      "variants.allow_backorder",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
  });

  type Row = {
    id: string;
    handle: string;
    status: string;
    variants: {
      sku: string;
      manage_inventory: boolean;
      allow_backorder: boolean;
      prices: { amount: number; currency_code: string }[];
    }[];
  };
  const medusa = new Map((products as unknown as Row[]).map((p) => [p.handle, p]));
  const expected = new Map(catalogue.products.map((p) => [p.handle, p]));

  for (const p of catalogue.products) {
    const m = medusa.get(p.handle);
    if (!m) {
      fail(`"${p.handle}" is in products.ts but has no Medusa product. Run \`npm run seed\`.`);
      continue;
    }

    // A live SKU that is still a draft is invisible to the store API -- the shop page renders it
    // from products.ts, the customer clicks buy, and the cart rejects a product it cannot see.
    const wantStatus = p.status === "live" ? "published" : "draft";
    if (m.status !== wantStatus) {
      fail(
        `"${p.handle}" is ${m.status} in Medusa but ${p.status} in products.ts (want ${wantStatus}).`,
      );
    }

    const variant = m.variants?.[0];
    if (!variant) {
      fail(`"${p.handle}" has no variant in Medusa.`);
      continue;
    }
    if (variant.sku !== p.sku) {
      fail(`"${p.handle}" SKU is ${variant.sku} in Medusa, ${p.sku} in products.ts.`);
    }

    // The check this file exists for.
    const price = variant.prices?.find((pr) => pr.currency_code === currency);
    if (!price) {
      fail(`"${p.handle}" has no ${currency.toUpperCase()} price in Medusa.`);
    } else if (Number(price.amount) !== p.price) {
      fail(
        `"${p.handle}" price drift: Medusa charges ${price.amount}, products.ts displays ${p.price}.`,
      );
    }

    // Backorder on a managed variant would let a zero-stock bottle be sold, which is the one
    // failure mode the "Arriving soon" copy promises cannot happen.
    if (!variant.manage_inventory) {
      fail(`"${p.handle}" has manage_inventory off, so stock is never checked.`);
    }
    if (variant.allow_backorder) {
      fail(`"${p.handle}" allows backorder, so it can be sold at zero stock.`);
    }
  }

  for (const handle of medusa.keys()) {
    if (!expected.has(handle)) {
      fail(
        `Medusa has product "${handle}" with no entry in products.ts -- it has no page to link to.`,
      );
    }
  }

  // ------------------------------------------------------------------ tax region
  //
  // tax-module-service resolves the country row before any province row and returns [] -- with no
  // error -- when it is missing. Without this assertion, "no tax region" and "zero tax" look
  // identical from the outside.
  const { data: taxRegions } = await query.graph({
    entity: "tax_region",
    fields: ["id", "country_code", "province_code", "provider_id"],
    filters: { country_code: "in" },
  });
  const countryRow = (
    taxRegions as { id: string; province_code: string | null; provider_id: string | null }[]
  )?.find((t) => t.province_code === null);
  if (!countryRow) {
    fail(`No country-level tax region for "in". getTaxLines will return [] and charge no tax.`);
  } else if (countryRow.provider_id !== GST_PROVIDER) {
    // The provider is read off the country row, so this one string decides whether an invoice
    // gets CGST/SGST/IGST heads or the built-in provider's single unnamed line. Nothing warns.
    fail(
      `The India tax region uses provider "${countryRow.provider_id}", not ${GST_PROVIDER}. ` +
        `GST would not be split into heads.`,
    );
  }

  // Tax is only calculated at all when the *store* region asks for it. region.automatic_taxes
  // defaults true (region/dist/models/region.js), so this is guarding an admin toggle, not a bug.
  const { data: storeRegions } = await query.graph({
    entity: "region",
    fields: ["name", "currency_code", "automatic_taxes"],
  });
  for (const r of (storeRegions as { name: string; automatic_taxes: boolean }[]) ?? []) {
    if (!r.automatic_taxes) {
      fail(`Region "${r.name}" has automatic_taxes off, so carts are priced with no GST at all.`);
    }
  }

  // ------------------------------------------------------------------ GST classification
  //
  // The place of supply decides CGST+SGST versus IGST. An unrecognised spelling cannot reach here
  // -- the provider refuses to boot on one -- so the only case left is an empty one, which is a
  // client input rather than a mistake.
  const origin = process.env.GST_ORIGIN_STATE;
  if (!origin) {
    warn("GST_ORIGIN_STATE is unset, so no cart can be priced. It is the registered state.");
  } else if (!matchState(origin)) {
    fail(`GST_ORIGIN_STATE is "${origin}", which is not one of the 36 states.`);
  }

  // The backend keeps its own copy of the state list because it cannot import the storefront's
  // (separate package, separate dependency tree). A copy that has drifted is how a customer picks
  // a state the tax provider then rejects at checkout.
  const drifted = [
    ...STATES.filter((s) => !catalogue.states.includes(s)),
    ...catalogue.states.filter((s) => !STATES.includes(s)),
  ];
  if (drifted.length) {
    fail(
      `The state list in src/modules/india-gst/states.ts has drifted from the storefront's: ` +
        `${drifted.join(", ")}. Copy src/lib/order.ts's STATES across.`,
    );
  }

  // Rates live as tax_rate rows keyed by HSN and attached to products by tax_rate_rule; the
  // provider is handed them and looks nothing up. Two ways that goes wrong silently: gst.json was
  // filled in but seed:gst never run, and a rate was edited in one place only.
  const { data: taxRates } = await query.graph({
    entity: "tax_rate",
    fields: ["code", "rate", "tax_region_id", "rules.reference", "rules.reference_id"],
  });
  type RateRow = {
    code: string;
    rate: number | null;
    tax_region_id: string;
    rules: { reference: string; reference_id: string }[];
  };
  const gstRates = ((taxRates as unknown as RateRow[]) ?? []).filter(
    (r) => r.tax_region_id === countryRow?.id,
  );
  const rateForProduct = new Map<string, RateRow>();
  for (const r of gstRates) {
    for (const rule of r.rules ?? []) {
      if (rule.reference === "product") rateForProduct.set(rule.reference_id, r);
    }
  }

  const classified = catalogue.products.filter((p) => gst.products[p.handle]);
  if (!classified.length) {
    warn(
      `No product has an HSN yet (src/data/gst.json is empty), so checkout cannot price GST. ` +
        `This is the client's CA's call -- see docs/BACKEND-PLAN.md 17.2.`,
    );
  }

  for (const p of classified) {
    const hsn = gst.products[p.handle]!;
    const m = medusa.get(p.handle) as unknown as { id?: string } | undefined;
    const held = m?.id ? rateForProduct.get(m.id) : undefined;
    if (!held) {
      fail(
        `"${p.handle}" is HSN ${hsn} in gst.json but has no tax rate. Run \`npm run seed:gst\`.`,
      );
      continue;
    }
    if (held.code !== hsn) {
      fail(`"${p.handle}" is HSN ${hsn} in gst.json and ${held.code} in Medusa.`);
    }
    const percent = gst.rates[hsn];
    if (percent !== null && percent !== undefined && held.rate !== percent) {
      fail(`HSN ${hsn} is ${percent}% in gst.json and ${held.rate}% in Medusa.`);
    }
  }

  // ------------------------------------------------------------------ tax-inclusive pricing
  //
  // Legal Metrology (Packaged Commodities) Rules 2011 r.6(1)(e): the declared retail price is the
  // all-inclusive one, and formatMRP in products.ts prints it as such. Medusa resolves inclusivity
  // from the *currency* preference for currency-scoped prices like these (pricing-module.js:1191),
  // and creates that preference as false. If it flips back, every order adds GST on top of the MRP.
  const { data: prefs } = await query.graph({
    entity: "price_preference",
    fields: ["attribute", "value", "is_tax_inclusive"],
    filters: { attribute: "currency_code", value: currency },
  });
  const currencyPref = (prefs as { is_tax_inclusive: boolean }[])?.[0];
  if (!currencyPref) {
    fail(`No ${currency} price preference. Prices would be treated as tax-exclusive.`);
  } else if (!currencyPref.is_tax_inclusive) {
    fail(
      `${currency.toUpperCase()} prices are NOT tax-inclusive. GST would be added on top of the printed MRP.`,
    );
  }

  // ------------------------------------------------------------------ soon SKUs are unsellable
  const { data: items } = await query.graph({
    entity: "inventory_item",
    fields: ["sku", "location_levels.stocked_quantity", "location_levels.reserved_quantity"],
  });
  const stockBySku = new Map(
    (items as { sku: string; location_levels: { stocked_quantity: number }[] }[]).map((i) => [
      i.sku,
      (i.location_levels ?? []).reduce((n, l) => n + Number(l.stocked_quantity ?? 0), 0),
    ]),
  );

  for (const p of catalogue.products) {
    if (p.status !== "soon") continue;
    const stocked = stockBySku.get(p.sku);
    if (stocked && stocked > 0) {
      fail(`"${p.handle}" is "soon" in products.ts but holds ${stocked} units -- it is sellable.`);
    }
  }

  // ------------------------------------------------------------------ storefront key
  const { data: keys } = await query.graph({
    entity: "api_key",
    fields: ["id", "title", "sales_channels.id"],
    filters: { type: "publishable" },
  });
  const linked = (keys as { sales_channels?: { id: string }[] }[]) ?? [];
  if (!linked.length) {
    fail("No publishable API key. The storefront cannot read the Store API at all.");
  } else if (!linked.some((k) => k.sales_channels?.length)) {
    fail("No publishable API key is linked to a sales channel -- /store/products returns nothing.");
  }

  // ------------------------------------------------------------------ report
  if (problems.length) {
    for (const p of problems) logger.error(p);
    logger.error(`check:catalogue failed with ${problems.length} problem(s).`);
    process.exit(1);
  }

  const zero = catalogue.products.filter((p) => (stockBySku.get(p.sku) ?? 0) === 0);
  logger.info(`check:catalogue passed. ${catalogue.products.length} products agree with Medusa.`);
  for (const w of warnings) logger.warn(w);
  if (zero.length) {
    // Not a failure: stock is a client input and zero is the honest default. But it is the reason
    // the shop looks empty, so it is said out loud rather than left to be rediscovered.
    logger.warn(`${zero.length} of them hold zero stock: ${zero.map((p) => p.handle).join(", ")}.`);
  }
}
