import "server-only";
import Medusa from "@medusajs/js-sdk";
import { applyLiveAll, type LiveSku, type Overlay, type Product } from "@/lib/products";

/* ------------------------------------------------------------------------------------------------
 * The commerce read path.
 *
 * The only place the storefront asks Medusa what a bottle costs and how many are left. It runs on
 * the server -- `server-only` above turns an accidental client import into a build error rather
 * than a runtime `undefined` -- and hands the result down as a small overlay keyed by slug. The
 * editorial catalogue never leaves src/lib/products.ts, so nothing large crosses the RSC boundary.
 * ---------------------------------------------------------------------------------------------- */

const BASE_URL = process.env.MEDUSA_URL;
const PUBLISHABLE_KEY = process.env.MEDUSA_PUBLISHABLE_KEY;

/**
 * Is there a backend to talk to at all?
 *
 * Not the same question as "is the backend up", and the difference decides whether a build fails.
 * A storefront deployed with neither variable set is a storefront deployed ahead of its backend --
 * a real and intended state while the commerce side is still being stood up -- and it should build
 * and serve the editorial catalogue with every bottle reading "arriving soon". A storefront that
 * *has* a MEDUSA_URL and cannot reach it is an outage, and an outage during a build must be loud.
 */
const CONFIGURED = Boolean(BASE_URL && PUBLISHABLE_KEY);

/**
 * `next build` sets this (next/dist/build/index.js), the dev server does not.
 *
 * It is the one moment where failing closed is the wrong answer. Silently baking a catalogue of
 * "Arriving soon" into a production deploy because the backend blinked is worse than a red build,
 * so at build time an unreachable Medusa throws and at request time it does not.
 */
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

/** The currency this store sells in. Prices in anything else are ignored rather than converted. */
const CURRENCY = "inr";

/**
 * How long a price or a stock count may be stale.
 *
 * Next revalidates a whole route at the lowest interval any of its fetches asks for, and this one
 * is read from the root layout, so 60s is the site's refresh rate. `revalidateTag("catalogue")`
 * from an admin webhook is the way to beat it when a price actually moves.
 */
const CATALOGUE_TAG = "catalogue";
const PRODUCTS_TTL = 60;
/** Regions change when the business enters a new country, which is not a 60-second event. */
const REGIONS_TTL = 60 * 60;

/* The shapes this file reads back. @medusajs/types is a devDependency of the SDK and is not
   installed here, so the two responses are declared narrowly rather than imported -- if the API
   ever stops sending one of these fields, the guards below turn it into a closed door, not a crash. */
type RegionsResponse = {
  regions: { id: string; currency_code: string | null }[];
};

type ProductsResponse = {
  products: {
    handle: string;
    variants:
      | {
          id: string;
          manage_inventory?: boolean;
          allow_backorder?: boolean;
          inventory_quantity?: number;
          calculated_price?: {
            calculated_amount: number | null;
            is_calculated_price_tax_inclusive?: boolean;
            currency_code: string | null;
          } | null;
        }[]
      | null;
  }[];
};

let client: Medusa | null = null;

/**
 * The Store API client.
 *
 * Exported for src/lib/checkout.ts, which writes carts through the same key and base URL. Both
 * files are `server-only`: MEDUSA_PUBLISHABLE_KEY is deliberately not NEXT_PUBLIC_-prefixed, so a
 * cart is built by a route handler on this side of the wire, never by the browser.
 */
export function storeApi(): Medusa {
  if (!BASE_URL || !PUBLISHABLE_KEY) {
    throw new Error("MEDUSA_URL and MEDUSA_PUBLISHABLE_KEY must both be set.");
  }
  client ??= new Medusa({ baseUrl: BASE_URL, publishableKey: PUBLISHABLE_KEY });
  return client;
}

/**
 * A POST to the Store API with the whole response handed back, headers and all.
 *
 * `storeApi()` is the right door for almost everything, but `client.fetch` collapses a non-2xx into
 * a `FetchError` carrying the message and the status and nothing else -- the response headers and
 * the parsed body are dropped (@medusajs/js-sdk/dist/esm/client.js:96-98). `Retry-After` is the one
 * fact the tracking form needs from a refusal, so that lane reads the response itself.
 *
 * The timeout is not decoration. This runs inside a Next route handler answering a browser: without
 * it, a Medusa that accepts the connection and then stops talking holds the request open until the
 * platform kills it, and the customer watches a spinner until then. Eight seconds is far past any
 * healthy response and short enough to still be an answer.
 */
export function storePost(path: string, body: unknown, timeoutMs = 8000): Promise<Response> {
  if (!BASE_URL || !PUBLISHABLE_KEY) {
    throw new Error("MEDUSA_URL and MEDUSA_PUBLISHABLE_KEY must both be set.");
  }
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * The region whose prices we quote.
 *
 * Not an env var. `region_id` is a required pricing context on every store product read -- without
 * it Medusa answers "Missing required pricing context to calculate prices" rather than guessing --
 * and pinning the id into the environment means a re-seeded backend silently serves a catalogue
 * with no prices. Looking it up by currency lets the storefront configure itself.
 */
export async function regionId(): Promise<string | null> {
  const res = await storeApi().client.fetch<RegionsResponse>("/store/regions", {
    query: { fields: "id,currency_code", limit: 50 },
    next: { revalidate: REGIONS_TTL, tags: [CATALOGUE_TAG] },
  });
  const region = res.regions.find((r) => r.currency_code?.toLowerCase() === CURRENCY);
  return region?.id ?? null;
}

/**
 * Every published SKU, as price and stock.
 *
 * The field list is exact and two parts of it are load-bearing. `+variants.inventory_quantity` is
 * computed by a response wrapper that skips any variant whose `manage_inventory` it cannot see, so
 * omitting `+variants.manage_inventory` drops the count with no error and every bottle reads as
 * sold out. And `is_calculated_price_tax_inclusive` is not decoration: rule 6(1)(e) of the Legal
 * Metrology (Packaged Commodities) Rules, 2011 requires the quoted price to be the all-inclusive
 * one, so a price that does not assert it is discarded rather than shown short.
 *
 * Drafts never appear -- the store API filters to published on its own -- which is what makes
 * "absent from this map" mean "not for sale" and lets `applyLive` fail closed on it.
 */
async function fetchOverlay(): Promise<Overlay> {
  const region = await regionId();
  if (!region) throw new Error(`No Medusa region found for currency "${CURRENCY}".`);

  const res = await storeApi().client.fetch<ProductsResponse>("/store/products", {
    query: {
      region_id: region,
      limit: 100,
      fields: [
        "handle",
        "+variants.manage_inventory",
        "+variants.allow_backorder",
        "+variants.inventory_quantity",
        "variants.calculated_price.calculated_amount",
        "variants.calculated_price.is_calculated_price_tax_inclusive",
        "variants.calculated_price.currency_code",
      ].join(","),
    },
    next: { revalidate: PRODUCTS_TTL, tags: [CATALOGUE_TAG] },
  });

  const overlay: Overlay = {};
  for (const product of res.products) {
    // One size per bottle today, so the first variant is the bottle. A second size would need a
    // variant picker in the UI before it could be resolved here, not a change to this line.
    const variant = product.variants?.[0];
    const price = variant?.calculated_price;
    if (!variant || !price) continue;
    if (price.calculated_amount === null) continue;
    if (price.currency_code?.toLowerCase() !== CURRENCY) continue;
    if (price.is_calculated_price_tax_inclusive !== true) continue;

    const counted = variant.manage_inventory === true && variant.allow_backorder !== true;
    const sku: LiveSku = { variantId: variant.id, price: price.calculated_amount };
    if (counted) sku.stock = variant.inventory_quantity ?? 0;
    overlay[product.handle] = sku;
  }
  return overlay;
}

/**
 * The overlay, or a closed shop.
 *
 * Callers get `{}` when the backend cannot be reached, which `applyLive` renders as "arriving
 * soon" across the board: no price is quoted that has not been confirmed and no bottle is offered
 * that has not been counted. The log line is the operator's signal, since the page itself is
 * deliberately quiet about it.
 */
export async function getOverlay(): Promise<Overlay> {
  // No backend configured: not an error, and specifically not a build failure. See CONFIGURED.
  if (!CONFIGURED) return {};
  try {
    return await fetchOverlay();
  } catch (error) {
    if (IS_BUILD) throw error;
    console.error("[medusa] catalogue unavailable, falling back to an unpriced shelf:", error);
    return {};
  }
}

/** The editorial catalogue with Medusa's numbers folded in. Server components read this. */
export async function getCatalogue(): Promise<Product[]> {
  return applyLiveAll(await getOverlay());
}
