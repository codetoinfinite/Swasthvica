import { readFileSync } from "node:fs";
import path from "node:path";
import type { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createPricePreferencesWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  updateTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updatePricePreferencesWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import { GST_PROVIDER } from "../modules/india-gst";

/**
 * Brings a fresh database up to the state the storefront expects.
 *
 * Idempotent by construction: every step asks what already exists and creates only what is
 * missing, so this is safe to re-run after a schema change or a partial failure. It never updates
 * a price or a stock level that Medusa already holds -- past the first run, Medusa is the source of
 * truth for both (docs/BACKEND-PLAN.md 4), and a seed that overwrote them would quietly undo the
 * client's own edits in the admin.
 *
 * WHAT THIS DELIBERATELY DOES NOT INVENT:
 *  - Opening stock. Every inventory level is created at 0. src/lib/products.ts leaves `stock` unset
 *    on every SKU on purpose, citing the CCPA 2023 dark-patterns guidelines: a made-up number on a
 *    shelf is a false statement of fact. So the site will show everything as out of stock until the
 *    client gives a real count. That is the correct failure direction.
 *  - HSN codes and GST rates. No `hsn` metadata key is written, because a wrong one is worse than
 *    an absent one -- the india-gst provider is built to throw on an unmapped HSN rather than
 *    silently charge the wrong tax.
 *  - The warehouse address beyond its country. Place of supply is a client input (17), and it is
 *    the field GST is computed from, so a placeholder city here would become a wrong tax later.
 */

type CatalogueProduct = {
  handle: string;
  title: string;
  sku: string;
  size: string;
  status: "live" | "soon";
  family: string;
  genericName: string;
  price: number;
};

type Catalogue = {
  currency: string;
  terms: { shippingFlat: number; freeShippingAbove: number };
  products: CatalogueProduct[];
};

const SALES_CHANNEL = "Swasthvica Storefront";
const REGION = "India";
const STOCK_LOCATION = "Swasthvica";
const API_KEY_TITLE = "Storefront";

export default async function seed({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentService = container.resolve(Modules.FULFILLMENT);
  const apiKeyService = container.resolve(Modules.API_KEY);
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL);
  const storeService = container.resolve(Modules.STORE);

  // Generated from src/lib/products.ts by scripts/export-catalogue.mjs. Read rather than imported
  // so a stale checked-in copy cannot silently seed the wrong titles -- regenerate with
  // `npm run catalogue:export` at the repo root.
  const cataloguePath = path.join(__dirname, "..", "data", "catalogue.json");
  const catalogue: Catalogue = JSON.parse(readFileSync(cataloguePath, "utf8"));
  const currency = catalogue.currency;

  // ---------------------------------------------------------------- sales channel + store
  logger.info("Seeding sales channel...");
  const [store] = await storeService.listStores();

  /**
   * Adopted and renamed, never created alongside. Medusa's own boot runs createDefaultsWorkflow,
   * whose createDefaultSalesChannelStep does `listSalesChannels({}, { take: 1 })` -- it claims
   * whatever channel already exists rather than looking for one by name. Creating a channel here
   * under our own name would therefore strand "Default Sales Channel" permanently: unused, still
   * listed in the admin, and still the channel the default publishable key points at. Whoever then
   * copied that key out of the admin would get an empty product list and no error saying why.
   *
   * The store's own default is preferred over `take: 1` so the choice stays deterministic once more
   * than one channel exists, rather than depending on row order.
   */
  let salesChannel: { id: string } | undefined = store.default_sales_channel_id
    ? (await salesChannelService.listSalesChannels({ id: store.default_sales_channel_id }))[0]
    : undefined;
  salesChannel ??= (await salesChannelService.listSalesChannels({}, { take: 1 }))[0];

  if (!salesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: SALES_CHANNEL }] },
    });
    salesChannel = result[0];
  } else {
    await salesChannelService.updateSalesChannels(salesChannel.id, { name: SALES_CHANNEL });
  }

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [{ currency_code: currency, is_default: true }],
        default_sales_channel_id: salesChannel.id,
      },
    },
  });

  /**
   * THE FLAG THAT DECIDES WHETHER THE PRICE ON THE LABEL IS THE PRICE CHARGED.
   *
   * Setting is_tax_inclusive on the region (below) is not enough on its own. pricing-module.js:1191
   * resolves inclusivity like this:
   *
   *     if (regionRule && regionPreference) return regionPreference.is_tax_inclusive;
   *     if (currencyPreference)             return currencyPreference.is_tax_inclusive;
   *     return false;
   *
   * `regionRule` means the *price row itself* carries a region_id rule. These variant prices are
   * scoped by currency, not by region, so the region preference is never consulted and resolution
   * falls through to the currency preference -- which Medusa creates as false. The result would be
   * GST added on top of ₹649 at checkout while the page, the cart and the label all say ₹649 is
   * the final figure. Legal Metrology (Packaged Commodities) Rules 2011 r.6(1)(e) requires the
   * declared retail price to be the all-inclusive one, and src/lib/products.ts prints exactly that.
   *
   * The store is single-currency and single-country: every INR price on it is an MRP. So the
   * currency preference is the correct place to say so, and the region preference stays set as
   * well, for the day a region-scoped price list is added.
   */
  const { data: currencyPrefs } = await query.graph({
    entity: "price_preference",
    fields: ["id", "is_tax_inclusive"],
    filters: { attribute: "currency_code", value: currency },
  });
  if (currencyPrefs?.length) {
    await updatePricePreferencesWorkflow(container).run({
      input: {
        selector: { attribute: "currency_code", value: currency },
        update: { is_tax_inclusive: true },
      },
    });
  } else {
    await createPricePreferencesWorkflow(container).run({
      input: [{ attribute: "currency_code", value: currency, is_tax_inclusive: true }],
    });
  }

  // ---------------------------------------------------------------- region
  logger.info("Seeding region...");
  const { data: existingRegions } = await query.graph({
    entity: "region",
    fields: ["id", "name"],
    filters: { name: REGION },
  });
  // Annotated down to what is actually used: query.graph hands back the generated `Region`
  // entity type and the workflow hands back `RegionDTO`, and neither is assignable to the other.
  let region: { id: string } | undefined = existingRegions?.[0];
  if (!region) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: REGION,
            currency_code: currency,
            countries: ["in"],
            /**
             * The single most consequential flag in this file. Legal Metrology (Packaged
             * Commodities) Rules 2011 r.6(1)(e) requires the declared retail price to be the
             * all-inclusive one, and src/lib/products.ts prints exactly that with
             * formatMRP -- "MRP ₹649 (incl. of all taxes)". If Medusa treated 649 as a pre-tax
             * figure it would add GST on top at checkout and charge more than the label, which is
             * both a pricing bug and a labelling offence.
             *
             * Note this is not a column on the region: createRegionsWorkflow turns it into a
             * pricing price-preference keyed on region_id (core-flows/dist/region/workflows/
             * create-regions.js:42). It cannot be set through the region module's CreateRegionDTO.
             */
            is_tax_inclusive: true,
            // Razorpay is blocked on a client account (17). pp_system_default is Medusa's own
            // no-op provider; it lets a cart be completed in development and must be replaced
            // before launch.
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    });
    region = result[0];
  }

  // ---------------------------------------------------------------- tax region
  //
  // A country-level tax region with province_code null must exist even though every real rate
  // will be state-level, because tax/dist/services/tax-module-service.js resolves the country row
  // first and returns [] -- silently, with no error -- if it is missing.
  logger.info("Seeding tax region...");
  //
  // `tp_${identifier}_${id}` is how tax/dist/loaders/providers.js keys a provider, so GST_PROVIDER
  // is medusa-config.ts's india-gst entry (identifier "india-gst", id "in") spelled the way the
  // module looks it up. It is the one field on this row that is wiring rather than data, so unlike
  // every other value this script writes it is corrected on an existing row instead of left alone:
  // a region pointing at the wrong provider is a bug, not a decision somebody made in the admin.
  const { data: taxRegions } = await query.graph({
    entity: "tax_region",
    fields: ["id", "country_code", "province_code", "provider_id"],
    filters: { country_code: "in" },
  });
  const countryRow = (
    taxRegions as { id: string; province_code: string | null; provider_id: string | null }[]
  )?.find((t) => t.province_code === null);
  if (!countryRow) {
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "in", provider_id: GST_PROVIDER }],
    });
  } else if (countryRow.provider_id !== GST_PROVIDER) {
    await updateTaxRegionsWorkflow(container).run({
      input: [{ id: countryRow.id, provider_id: GST_PROVIDER }],
    });
    logger.info(`Tax region moved from ${countryRow.provider_id} to ${GST_PROVIDER}.`);
  }

  // ---------------------------------------------------------------- stock location
  logger.info("Seeding stock location...");
  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
    filters: { name: STOCK_LOCATION },
  });
  let stockLocation: { id: string } | undefined = locations?.[0];
  if (!stockLocation) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: STOCK_LOCATION,
            // address_1 and country_code are the only required fields. City and province are left
            // unset rather than guessed -- see the header.
            address: { address_1: "", country_code: "IN" },
          },
        ],
      },
    });
    stockLocation = result[0];
  }

  await updateStoresWorkflow(container).run({
    input: { selector: { id: store.id }, update: { default_location_id: stockLocation.id } },
  });

  // link.create is idempotent -- the link table has a unique constraint on the pair and the
  // service upserts, so re-running does not duplicate.
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  });

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: stockLocation.id, add: [salesChannel.id] },
  });

  // ---------------------------------------------------------------- fulfilment
  logger.info("Seeding fulfilment...");
  let [shippingProfile] = await fulfillmentService.listShippingProfiles({ type: "default" });
  if (!shippingProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    });
    shippingProfile = result[0];
  }

  let [fulfillmentSet] = await fulfillmentService.listFulfillmentSets(
    { name: "India delivery" },
    { relations: ["service_zones"] },
  );
  if (!fulfillmentSet) {
    fulfillmentSet = await fulfillmentService.createFulfillmentSets({
      name: "India delivery",
      type: "shipping",
      service_zones: [{ name: "India", geo_zones: [{ country_code: "in", type: "country" }] }],
    });
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    });
  }

  const serviceZoneId = fulfillmentSet.service_zones[0].id;

  const { data: shippingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  });
  if (!shippingOptions?.some((o: { name: string }) => o.name === "Standard delivery")) {
    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Standard delivery",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: serviceZoneId,
          shipping_profile_id: shippingProfile.id,
          type: { label: "Standard", description: "Delivered across India.", code: "standard" },
          // TERMS.shippingFlat, read from the storefront rather than repeated here, so the four
          // surfaces that quote a delivery charge cannot drift apart. The free-shipping threshold
          // is a rule on a second option and belongs to the promotions phase.
          prices: [{ currency_code: currency, amount: catalogue.terms.shippingFlat }],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
      ],
    });
  }

  // ---------------------------------------------------------------- publishable key
  logger.info("Seeding publishable API key...");
  // Adopted for the same reason as the sales channel: createDefaultsWorkflow only creates its key
  // `when` no publishable key of any title exists, so a second one here would orphan the first.
  const { data: apiKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "token", "title", "sales_channels.id"],
    filters: { type: "publishable" },
  });
  type KeyRow = { id: string; token: string; title: string; sales_channels?: { id: string }[] };
  // Same determinism point as the channel above: prefer the key already pointing at the channel
  // this seed uses, so a database that somehow holds two does not pick a different one each run.
  const rows = apiKeys as KeyRow[] | undefined;
  const existingKey: KeyRow | undefined =
    rows?.find((k) => k.sales_channels?.some((c) => c.id === salesChannel!.id)) ?? rows?.[0];
  let publishableKey: { id: string; token: string };
  if (existingKey) {
    publishableKey = existingKey;
    if (existingKey.title !== API_KEY_TITLE) {
      await apiKeyService.updateApiKeys(existingKey.id, { title: API_KEY_TITLE });
    }
  } else {
    const { result } = await createApiKeysWorkflow(container).run({
      input: { api_keys: [{ title: API_KEY_TITLE, type: "publishable", created_by: "seed" }] },
    });
    publishableKey = result[0];
  }
  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: publishableKey.id, add: [salesChannel.id] },
  });

  // ---------------------------------------------------------------- products
  logger.info("Seeding products...");
  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  });
  const known = new Set((existingProducts ?? []).map((p: { handle: string }) => p.handle));
  const missing = catalogue.products.filter((p) => !known.has(p.handle));

  if (missing.length) {
    await createProductsWorkflow(container).run({
      input: {
        products: missing.map((p) => ({
          title: p.title,
          // handle === slug is the whole hybrid seam. Everything editorial -- description,
          // ingredients, ritual, imagery -- stays in src/lib/products.ts and is joined on this.
          handle: p.handle,
          /**
           * A `soon` bottle is a draft, so the Store API will not return it at all. That is
           * intended: the storefront already renders those five words itself ("Arriving soon",
           * TwoQuestions.tsx:188) from its own catalogue, and a draft cannot be added to a cart
           * by anyone who guesses the URL.
           */
          status: p.status === "live" ? ProductStatus.PUBLISHED : ProductStatus.DRAFT,
          shipping_profile_id: shippingProfile.id,
          // Every Medusa product needs at least one option. These bottles have exactly one axis
          // and one value on it, and it is the fill size already printed on the label.
          options: [{ title: "Size", values: [p.size] }],
          variants: [
            {
              title: p.size,
              sku: p.sku,
              options: { Size: p.size },
              manage_inventory: true,
              allow_backorder: false,
              // Amounts are decimals in Medusa v2, not minor units: 649 is ₹649, not ₹6.49.
              prices: [{ currency_code: currency, amount: p.price }],
            },
          ],
          sales_channels: [{ id: salesChannel.id }],
        })),
      },
    });
  }

  // ---------------------------------------------------------------- inventory
  logger.info("Seeding inventory levels...");
  const { data: inventoryItems } = await query.graph({ entity: "inventory_item", fields: ["id"] });
  const { data: levels } = await query.graph({
    entity: "inventory_level",
    fields: ["inventory_item_id", "location_id"],
  });
  const held = new Set(
    (levels ?? []).map(
      (l: { inventory_item_id: string; location_id: string }) =>
        `${l.inventory_item_id}:${l.location_id}`,
    ),
  );

  const newLevels: CreateInventoryLevelInput[] = (inventoryItems ?? [])
    .filter((i: { id: string }) => !held.has(`${i.id}:${stockLocation.id}`))
    .map((i: { id: string }) => ({
      inventory_item_id: i.id,
      location_id: stockLocation.id,
      // Zero, on purpose. See the header.
      stocked_quantity: 0,
    }));

  if (newLevels.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: newLevels },
    });
  }

  logger.info(
    `Seed complete. ${catalogue.products.length} products, ${missing.length} created this run.`,
  );
  logger.info(`Publishable key: ${publishableKey.token}`);
  logger.warn(
    "All stock is 0 until the client provides opening counts. Nothing is buyable until then.",
  );
}
