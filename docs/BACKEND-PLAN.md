# Swasthvica — Commerce Backend Plan

**Medusa v2.19.0 · AWS Mumbai (ap-south-1) · Razorpay · Shiprocket**
Written 2026-08-29. Companion to `docs/PLAN.md` (frontend), which is complete and frozen.

---

## 0. Decisions locked

| #   | Decision                  | Choice               | Consequence                                                                                                                         |
| --- | ------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Catalogue source of truth | **Hybrid**           | Editorial stays in `src/lib/products.ts`. Medusa owns price, stock, orders, promotions, tax, fulfilment. Joined on `slug ≡ handle`. |
| 2   | Customer accounts         | **Accounts + guest** | Both paths ship. Guest checkout unchanged; new `/account/*` surface; guest orders claimable after registration.                     |
| 3   | Hosting                   | **AWS ap-south-1**   | Order data at rest in India. ECS Fargate + RDS Postgres + ElastiCache Redis + S3 + CloudFront.                                      |
| 4   | Fulfilment                | **Shiprocket**       | Custom fulfilment provider module. Fills `TERMS.courier` and the `PROCESSORS[]` courier row in `src/lib/business.ts`.               |

**Decided without asking** (say so now, reversible cheaply):

- **Payment capture: auto-capture.** Razorpay captures at authorisation. Indian D2C norm; avoids the 5-day auto-refund of uncaptured authorisations. Manual capture only makes sense with a fraud-review step this store does not have.
- **Email: Resend, via a custom notification provider.** Medusa ships only `notification-local` and `notification-sendgrid` — there is no official Resend module, so it is bespoke either way. Resend's React Email templating is the better fit for a brand this typographic.
- **Search: none.** Five SKUs. `search-local` is dead weight. Revisit past ~40 SKUs.

---

## 1. Ground truth — verified, not assumed

Every claim below was read out of the published 2.19.0 tarballs, not from documentation or memory. Paths are inside the packages.

| Fact                                                                                     | Where it was verified                                                                                                             |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `@medusajs/medusa`, `framework`, `admin-sdk`, `js-sdk` all at **2.19.0**                 | npm registry metadata                                                                                                             |
| Node engines `^20.19.0 \|\| >=22.12.0` — local Node **24.14.1** satisfies it             | `package.json` engines                                                                                                            |
| **No official Razorpay payment module.** Only `payment-stripe`.                          | `@medusajs/medusa` dependency map, all 55 `@medusajs/*` modules                                                                   |
| **No official Resend module.** Only `notification-local`, `notification-sendgrid`.       | same                                                                                                                              |
| Amounts are stored as **decimals**, not minor units. `INR.decimal_digits = 2`.           | `utils/dist/defaults/currencies.js:455`, `utils/dist/totals/big-number.d.ts`                                                      |
| Payment webhook route preserves the raw body — HMAC verification is possible             | `core/dist/api/hooks/middlewares.js` → `bodyParser: { preserveRawBody: true }`                                                    |
| Webhook payload carries `rawData`                                                        | `types/dist/payment/mutations.d.ts:281` `ProviderWebhookPayload`                                                                  |
| Webhook subscriber **silently drops** any result without `data.session_id`               | `core/dist/subscribers/payment-webhook.js`                                                                                        |
| Built-in tax provider returns **at most 2 rates**, and only a rate + its _parent_        | `tax/dist/services/tax-module-service.js` → `getTaxRatesForItem`                                                                  |
| `ItemTaxLineDTO.rate_id` is **optional** — a custom provider may synthesise lines        | `types/dist/tax/common.d.ts:437`                                                                                                  |
| `getTaxLines` returns `[]` if no country-level tax region exists                         | `tax/dist/services/tax-module-service.js`                                                                                         |
| `TaxableItemDTO` has **no HSN field**; `TaxCalculationContext` has **no origin address** | `types/dist/tax/common.d.ts`, `types/dist/tax/provider.d.ts`                                                                      |
| **`GET /store/orders/:id` is unauthenticated**                                           | `core/dist/api/store/orders/middlewares.js` — see §11.1                                                                           |
| Registration is two-step (actorless token → create customer)                             | `core/dist/api/auth/[actor_type]/[auth_provider]/register/route.js`, `store/customers/middlewares.js` (`allowUnregistered: true`) |
| Guest orders can be **transferred** to an account                                        | `core/dist/api/store/orders/[id]/transfer/*`                                                                                      |

**Deliberately not asserted:** per-SKU HSN codes and GST rates. Searches returned contradictory figures (18% under HSN 3305 for shampoo/hair oil; 12% under 3304 for "ayurvedic hair oil"). These are the client's CA's call. The system is built to take them as configuration — see §5.4.

---

### 1.1 Store API footguns, verified against a running server

Two of these cost real time in phase 2, and both fail _silently_ rather than loudly.

- **`region_id` is mandatory on `/store/products` for any price to come back.** `currency_code` is not a valid store query param — it is rejected outright (`Invalid request: Unrecognized fields: 'currency_code'`) — and `country_code=in` alone yields `Missing required pricing context to calculate prices - region_id`. The storefront therefore resolves the region by currency from `/store/regions` at read time (`src/lib/medusa.ts`) rather than pinning an id in an env var, so a re-seeded backend self-configures.
- **`+variants.inventory_quantity` is silently dropped unless `+variants.manage_inventory` is requested alongside it.** From `@medusajs/medusa/dist/api/utils/middlewares/products/variant-inventory-quantity.js`: `if (!variant.manage_inventory) { continue; }` — the middleware needs the field on the variant it is decorating. Ask for the quantity alone and the response is a clean 200 with no quantity in it, which reads as "unlimited" to any caller that does not know better.
- `inventory_quantity` is **availability** (stocked − reserved), scoped to a single sales channel, and `wrapVariantsWithInventoryQuantityForSalesChannel` **throws** unless the publishable key resolves to exactly one channel. One key, one channel, permanently.

## 2. Topology — two apps, one repo, two installs

```
swasthavic/
├── package.json              # Next 16.3.1 storefront — UNCHANGED
├── src/                      # UNCHANGED except §12
├── docs/
│   ├── PLAN.md               # frontend (done)
│   └── BACKEND-PLAN.md       # this file
└── medusa/                   # NEW — independent package, own lockfile
    ├── package.json
    ├── medusa-config.ts
    ├── .env.template
    └── src/
        ├── modules/
        │   ├── razorpay/         # payment provider
        │   ├── india-gst/        # tax provider
        │   ├── shiprocket/       # fulfilment provider
        │   └── resend/           # notification provider
        ├── api/
        │   ├── middlewares.ts    # route overrides + rate limits
        │   └── store/            # custom store routes
        ├── subscribers/          # order-placed, shipment-created, …
        ├── workflows/            # sync-catalogue, claim-guest-order
        ├── jobs/                 # scheduled: stock snapshot, token refresh
        ├── links/                # module links
        └── scripts/seed.ts
```

**Why `medusa/` is not a pnpm workspace package.** Workspace hoisting would place a second React/Next resolution path in the tree. Two costs, both real: `AGENTS.md` instructs reading `node_modules/next/dist/docs/` resolved from the repo root, and it explicitly warns that in a monorepo "the `next` package may not be visible from the repo root"; and Medusa's admin brings its own React, pinned by the starter at 18.3.1 (`medusa/package.json`), which pnpm would try to dedupe against the storefront's 19.2.8. Two `pnpm install` runs cost seconds. A broken module resolver costs a day. YAGNI says separate trees until there is shared code to share — and there is none, only a shared _contract_ (§4).

All `@medusajs/*` deps pinned **exact** at `2.19.0`. No carets. The three plugin candidates that already broke on this are in §8.1.

---

## 3. Config

`medusa/medusa-config.ts` — keys below are from `types/dist/common/config-module.d.ts`, not guessed.

```ts
import { defineConfig, Modules } from "@medusajs/framework/utils";

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    workerMode: process.env.MEDUSA_WORKER_MODE as "server" | "worker" | "shared",
    http: {
      storeCors: process.env.STORE_CORS, // https://swasthvica.com
      adminCors: process.env.ADMIN_CORS, // https://admin.swasthvica.com
      authCors: process.env.AUTH_CORS, // both of the above
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },
  },
  admin: {
    disable: process.env.MEDUSA_WORKER_MODE === "worker",
    backendUrl: process.env.MEDUSA_BACKEND_URL,
  },
  modules: [/* §3.1 */],
});
```

### 3.1 Module list

| Module                                                                                                                       | Package                                          | Why                                                              |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| Cache                                                                                                                        | `@medusajs/cache-redis`                          | in-memory cache is per-process; two Fargate tasks would disagree |
| Event bus                                                                                                                    | `@medusajs/event-bus-redis`                      | required for the payment webhook subscriber to survive a restart |
| Workflow engine                                                                                                              | `@medusajs/workflow-engine-redis`                | in-memory loses long-running workflow state on deploy            |
| Locking                                                                                                                      | `@medusajs/locking-redis`                        | inventory reservation races across tasks                         |
| File                                                                                                                         | `@medusajs/file-s3`                              | S3 ap-south-1 + CloudFront                                       |
| Auth                                                                                                                         | `@medusajs/auth-emailpass`                       | accounts; `auth-google` deferred (§10.4)                         |
| Notification                                                                                                                 | **custom `resend`** + `notification-local` (dev) | no official Resend module                                        |
| Payment                                                                                                                      | **custom `razorpay`**                            | no official or usable third-party module (§8.1)                  |
| Tax                                                                                                                          | **custom `india-gst`**                           | built-in provider cannot emit CGST+SGST (§5.2)                   |
| Fulfilment                                                                                                                   | **custom `shiprocket`** + `fulfillment-manual`   | manual stays registered as the fallback lane                     |
| Stock location, Inventory, Promotion, Pricing, Product, Region, Tax, Order, Cart, Customer, Sales channel, API key, Currency | core                                             | default-on                                                       |

`MEDUSA_WORKER_MODE` splits the deployment (§13): `server` serves Store/Admin API and the admin dashboard; `worker` runs subscribers, scheduled jobs and workflow steps. Both share one Postgres and one Redis. This is not optional at production — a webhook retry storm on the API task is an outage.

---

## 4. The hybrid contract

**The seam is `slug` ≡ `handle`.** One string, two systems, no mapping table.

| Field                                                                                | Owner                  | Note                                                           |
| ------------------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------- |
| `slug`                                                                               | code → Medusa `handle` | the join key                                                   |
| `name`, `size`, `categoryCaps`, `benefit`, `family`, `biome`                         | **code**               | drives `TwoQuestions.tsx`, `/shop`, sitemap priorities         |
| `description`, `ingredients[]`, `ritual[]`, `disclaimer`, `genericName`, `shelfLife` | **code**               | AYUSH-sensitive copy; belongs in review, not an admin textarea |
| `image`                                                                              | **code** (`public/`)   | art-directed, next/image optimised                             |
| `status: "live" \| "soon"`                                                           | **code**               | gates the sitemap and the buy button                           |
| `price`                                                                              | **Medusa**             | `price_set` on the variant, INR                                |
| `stock`                                                                              | **Medusa**             | `inventory_quantity`, replaces the currently-unset field       |
| order, discount, tax, shipment                                                       | **Medusa**             | wholly                                                         |

### 4.1 One variant per product

Five SKUs, no size or colour axis. Each product gets a single default variant, `sku` = uppercased slug (`HERBAL-SHAMPOO`). Adding a 250 ml/500 ml axis later is an additive migration, not a rewrite.

### 4.2 Drift guard

The failure mode of any hybrid is silent divergence: a slug renamed in code, a product deleted in admin, a price live on a `status: "soon"` SKU.

- `medusa/src/scripts/seed.ts` — idempotent upsert of all five products from a JSON snapshot of `products.ts`. Safe to re-run.
- `medusa/src/scripts/check-catalogue.ts` — exits non-zero if any `slug` in `products.ts` has no Medusa `handle`, if any Medusa product has no matching slug, or if a `status: "soon"` SKU has purchasable inventory. Runs in CI and as a pre-deploy gate.
- The storefront **fails closed**: a product whose slug resolves in code but not in Medusa renders as `soon` (no buy button), never as a buyable item with a missing price.

---

## 5. Region, currency, and Indian GST

### 5.1 Region

One region: `India`, currency `inr`, countries `["in"]`, **`is_tax_inclusive: true`**.

Tax-inclusive is not a preference here — it is what `src/lib/products.ts` already promises:

```ts
export const formatMRP = (n: number) => `MRP ${formatINR(n)} (incl. of all taxes)`;
```

₹649 is the MRP. Medusa must back the tax out of it, not add tax on top. The same flag exists on order line items, so historical orders keep their own basis.

**Correction, found during phase 2.** `is_tax_inclusive` is not a column on the region. `createRegionsWorkflow` translates it into a **pricing preference** row, and setting it on the region alone is _not enough_. From `@medusajs/pricing/dist/services/pricing-module.js:1191-1201`, a region preference is consulted only when the price row itself carries a `region_id` rule; a plain currency-scoped variant price has no such rule, so resolution falls through to the **`currency_code` preference**. A catalogue priced per currency — which is what §6 seeds — therefore needs _both_ preferences set, or every calculated price comes back with `is_calculated_price_tax_inclusive: false` and the storefront quotes a figure that is not the MRP. `seed.ts` sets both; `check-catalogue.ts` asserts the flag on every SKU so a re-seed cannot quietly lose it.

### 5.2 Why the built-in tax provider cannot do this

From `tax/dist/services/tax-module-service.js`:

```js
const prioritizedRates = this.prioritizeRates(rates, item);
const rate = prioritizedRates[0];
const ratesToReturn = [rate];
if (!(rate.is_combinable && rate.tax_region.parent_id)) {
  return ratesToReturn;
}
const parentRate = prioritizedRates.find((r) => r.tax_region.id === rate.tax_region.parent_id);
if (parentRate) {
  ratesToReturn.push(parentRate);
}
return ratesToReturn;
```

At most two rates, and the second must be the **parent** of the first. An intra-state Indian sale needs CGST and SGST as two **siblings** at the same province level. The `system` provider structurally cannot emit that. It would produce one merged 18% line, which is wrong on the invoice even when the total is right — and a GST invoice that does not itemise CGST and SGST separately is not a compliant tax invoice.

### 5.3 The custom `india-gst` provider

`ITaxProvider` is a one-method interface (`types/dist/tax/provider.d.ts`), and `ItemTaxLineDTO.rate_id` is optional (`types/dist/tax/common.d.ts:437`) — so a provider may return more lines than there are stored rate rows, and may name them whatever the invoice needs. That is the whole escape hatch: one 18% row in the database, two 9% lines on the bill.

**Correction, found during phase 4.** The paragraph that used to sit here said the provider "resolves HSN by querying product metadata". It cannot. `modules-sdk/dist/loaders/utils/load-internal.js:123-129` builds a **fresh, isolated Awilix container per module** and registers into it only `resolution.dependencies` plus `MANAGER`, `CONFIG_MODULE`, `LOGGER`, `PG_CONNECTION`, `EVENT_BUS` and `CACHING`. `definitions.js:205-215` gives the Tax module `dependencies: [LOGGER, EVENT_BUS]` and no `__passSharedContainer`. So `ContainerRegistrationKeys.QUERY` is not resolvable from inside a tax provider — there is no product read to be had, at any price. A provider that needs a fact about a product must be _handed_ it.

**The seam it is handed through is the rate row itself.** `tax/dist/services/tax-module-service.js:161-234` does the lookup before the provider is ever called: it finds the tax regions for the destination, collects candidate `tax_rate` rows, and matches them with `getTaxRateQueryForItem` (`:333-358`), which for a line item asks for rules of shape `{ reference: "product", reference_id: item.product_id }` — or, for shipping, `{ reference: "shipping_option", reference_id: item.shipping_option_id }`. The matched rows are prioritised and passed through as `{ line_item, rates }`.

So the two facts the provider needs ride in on `TaxRateDTO`:

| carries                      | field                                                        | example     |
| ---------------------------- | ------------------------------------------------------------ | ----------- |
| HSN code                     | `tax_rate.code` — `NOT NULL` since `Migration20240924114005` | `"3305"`    |
| total GST %                  | `tax_rate.rate`                                              | `18`        |
| which products it applies to | `tax_rate_rule` rows, `reference: "product"`                 | one per SKU |

`tax_rate_rule` is `UNIQUE (tax_rate_id, reference_id)` (`IDX_tax_rate_rule_unique_rate_reference`), so a product can be attached to a rate exactly once, and `tax_rate.rules` cascade-delete with the rate.

```
getTaxLines(itemLines, shippingLines, context):

  origin = options.originState               // seller's state, full name, from module options
  dest   = context.address.province_code     // TaxCalculationContext has NO origin
  rate   = rates[0].rate                     // total GST %, handed in by the module
  hsn    = rates[0].code                     // ditto

  if canonical(dest) === canonical(origin):  // intra-state
      → two lines: CGST rate/2, SGST rate/2
  else:                                      // inter-state
      → one line:  IGST rate
```

Splitting one rate into two heads is arithmetically safe: both `calculateAmountsWithTax` and `getLineItemTotals` sum every tax line's rate _before_ dividing, so CGST 9 + SGST 9 backs exactly the same rupees out of a tax-inclusive MRP as IGST 18.

Four structural constraints this respects:

1. **A country-level tax region (`province_code: null`) for `in` must exist**, or `getTaxLines` hits `if (!parentRegion) return []` (`:176`) and _no tax is calculated at all_ — silently, with no error anywhere. Seeded first, asserted by `check:catalogue`.
2. **`provider_id` is read off that country-level parent region** (`:232`), not off a province row. It must hold `tp_india-gst_in` — `` `tp_${identifier}${id ? `_${id}` : ""}` `` is how `tax/dist/loaders/providers.js` keys a provider. The string is defined once, as `GST_PROVIDER` in `src/modules/india-gst/index.ts`, and imported by `medusa-config.ts`, `seed.ts` and `check-catalogue.ts`, because a typo in any one of them means carts are priced by a provider that does not split GST, with nothing said. `seed.ts` _corrects_ this field on an existing region — alone among the values it writes — on the grounds that it is wiring, not a decision anybody made in the admin.
3. **The context reaching the provider is un-normalized.** `normalizeTaxCalculationContext` (`:258-269`) lowercases country and province codes, but only for the region lookup; line 232 passes the **original** `calculationContext` on. `province_code` is therefore whatever the cart address holds, verbatim — `"Uttar Pradesh"`, `"uttar pradesh"`, `"Jammu & Kashmir"`. Hence `canonicalState()` in `src/modules/india-gst/states.ts`: lowercase, `&` → `and`, strip non-letters, compare.
4. **`region.automatic_taxes` must be on**, or nothing calls the tax module during a cart at all. Asserted per region by `check:catalogue`.

Shipping is taxed at the rate of the principal supply — the composite-supply rule, CGST Act s.8(a). If a shipping option carries its own `tax_rate_rule` the module hands that rate over and the provider uses it; otherwise the provider falls back to the **highest-rated line item in the cart** and taxes carriage at that. With no rated item at all it emits no shipping tax line rather than guessing zero. Flagged for the CA to confirm.

The failure directions are deliberate, and each is a test in `src/modules/india-gst/__tests__/service.unit.spec.ts` (19 of them):

| situation                      | behaviour                                   |
| ------------------------------ | ------------------------------------------- |
| product with no rate rule      | `NOT_FOUND` — loud, at checkout             |
| `rate: 0` (nil-rated goods)    | valid; emits a 0% line                      |
| `rate` null, or outside 0–100  | `INVALID_DATA`                              |
| destination state unrecognised | `INVALID_DATA`, naming the value            |
| origin state unset             | boots fine; refuses the first cart          |
| origin state misspelled        | **module load fails**, listing all 36 names |

Unset-but-required is not a contradiction. The place of supply is a client fact nobody here can invent (§17); taking the whole backend down over it would be worse than carrying the gap to the first cart that actually needs it and refusing there.

### 5.4 Rates are data, never code

There is no `GST_RATES` environment variable and no rate table in the source. Per-SKU classification lives in one hand-authored file:

```jsonc
// medusa/src/data/gst.json — ships empty; every value below is the client's CA to fill
{
  "rates":    { "<hsn>": <total GST %> },   // e.g. "3305": 18 — the total, not the half
  "products": { "<storefront slug>": "<hsn>" }
}
```

`npm run seed:gst` reads it, validates it, and writes `tax_rate` + `tax_rate_rule` rows into the India region. It refuses — every problem listed, then exit 1 — on a catalogue handle missing from the map, a null or malformed HSN (`/^\d{4,8}$/`), an HSN with no rate, or a rate outside 0–100. It never overwrites: a rate that already exists in the database but disagrees with the file is reported as drift and left alone, because the admin UI is the client's to use after handover. Only missing rows are added, so the script is idempotent.

Module options are now one line:

```ts
// medusa-config.ts
{ resolve: "./src/modules/india-gst", id: GST_PROVIDER_ID, options: { originState: process.env.GST_ORIGIN_STATE } }
```

`GST_ORIGIN_STATE` is a **full state name spelled as the storefront's own address form spells it** — `"Uttar Pradesh"`, `"Tamil Nadu"`, `"Jammu and Kashmir"` — not the 2-letter code this plan first proposed. The 36 names are copied into `src/modules/india-gst/states.ts` from `src/lib/order.ts`, and `check:catalogue` fails if the two lists ever drift apart. There is no `defaultRate`: an unmapped product raises rather than quietly taxing a bottle at 0%.

**The provider refuses rather than defaults, and that has a consequence for the laptop.** With no `tax_rate` covering a product, pricing a cart fails outright:

```
No GST rate is configured for line item cali_… (product prod_…). Add its HSN and rate to
medusa/src/data/gst.json and run `npm run seed:gst`, or set the rate in Settings → Tax
Regions in the admin.
```

That is correct — a silent 0% would put wrong invoices in front of customers — but it means a development database with an empty `gst.json` cannot complete a single checkout. So `src/scripts/_dev-tax.ts` and `_dev-tax-clear.ts` (and `_dev-stock.ts`) **stay** until §17.2 and §17.3 arrive. They are `_`-prefixed, unwired to any npm script, and create one fixture rate under the code `DEVHSN` which no real HSN can collide with. An earlier draft of this plan called for deleting them at the end of phase 5; that was written before the refusal above was observed, and deleting them would leave the laptop unable to exercise phases 6–12.

`check:catalogue` separates **failures** (this repo's bugs — wrong provider id, `automatic_taxes` off, state-list drift, a classified product whose stored HSN or rate disagrees with `gst.json`) from **warnings** (client inputs nobody here can supply — `GST_ORIGIN_STATE` empty, `gst.json` still blank, zero opening stock). Warnings print every run so they are not rediscovered, but they keep the build green.

---

## 6. Inventory

- One stock location: the fulfilment address (TBC, §17).
- `manage_inventory: true` on all five variants. Backorders **off**.
- Reservation is taken when the cart completes, released on cancellation.
- The storefront's `p.stock` — currently unset on every SKU, deliberately — is fed by `variant.inventory_quantity`. `LOW_STOCK_AT = 6` stays a frontend constant.

This is the switch that turns on the already-built UI in `LineRows.tsx`:

```tsx
{
  state === "low" && <span>Low stock — {p.stock} left</span>;
}
{
  state === "out" && <span>Out of stock. Remove it to check out…</span>;
}
```

The comment in `products.ts` citing CPA 2019 s.2(28) and the CCPA dark-pattern guidelines still binds: this number must be the **real** on-hand count. No floors, no "only 3 left!" theatre. If the real count is 40, the badge does not show.

The three `status: "soon"` SKUs get products with zero inventory and stay in `draft` status until the client releases them. `check-catalogue.ts` enforces that.

**Deviation, taken during phase 2.** They are seeded _with_ prices rather than with none. Medusa's store API applies `{ status: ProductStatus.PUBLISHED }` as a default filter (`store/products/middlewares.js`), so a draft is invisible to the storefront regardless of what it is priced at — absence from the response is what makes `applyLive` render "arriving soon". Seeding the price now means the release step is a single status flip in the admin instead of a price entry the client has to get right under time pressure, and there is no window in which a published product has no price. The price is not a claim while the product is a draft, because no surface can read it.

---

## 7. Promotions

`src/lib/discounts.ts` becomes a **preview** only. Its own header already says so — the server must recompute and refuse a mismatch. Medusa's promotion module becomes the truth.

There is no `/store/promotions` route in Medusa 2.19 (the store API exposes carts, products, regions, shipping-options and the rest, but nothing that reads a promotion definition back), so the storefront cannot fetch the offer at runtime. The seam is therefore build-time, and identical in shape to the catalogue seam of §4: `discounts.ts` exports `RULES` → `scripts/export-catalogue.mjs` snapshots them into `medusa/src/data/catalogue.json` → `npm run seed:promotions` creates the matching promotions → `npm run check:promotions` exits non-zero the moment the two disagree. One author, one export, one guard.

| Code           | Type       | Rule                                    | Server representation                                                                                                                                                                                      | Status                       |
| -------------- | ---------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `TWOBOTTLES`   | fixed      | flat ₹150 off, min subtotal ₹1200       | `type: standard`, `is_tax_inclusive: true`, `application_method: { type: fixed, target_type: items, allocation: across, value: 150, currency_code: inr }`, rule `original_item_total gte 1200`             | **live**                     |
| `FIRSTVALLEY`  | percentage | 10% off, capped ₹150, min subtotal ₹599 | not expressible — see §7.2                                                                                                                                                                                 | **blocked, client decision** |
| `FREESHIPPING` | percentage | delivery free over ₹999, never typed in | `is_automatic: true`, `is_tax_inclusive: true`, `application_method: { type: percentage, target_type: shipping_methods, allocation: across, value: 100 }`, rule `item_total gte 999`, empty `target_rules` | **live**                     |

`FREESHIPPING` is the odd one out and is checked under its own rules in `check-promotions.ts`: it is the only automatic promotion, the only one targeting `shipping_methods` rather than items, and the only one measured against `TERMS.freeShippingAbove` instead of a discount code. Nobody is ever shown it to type — if it stopped being automatic it would simply stop, silently, while the cart page went on promising free delivery and the card went on being charged ₹79. Its threshold is `item_total`, not `original_item_total`: the storefront's own `totals()` measures free shipping against `payable` (subtotal − discount), and `item_total` is Medusa's name for exactly that. Verified live: ₹649 → `shipping_total` 79; ₹1298 → `shipping_total` 0 with `promos: [FREESHIPPING]`.

### 7.1 The min-subtotal rule

`{ attribute: "original_item_total", operator: "gte", values: ["1200"] }`, verified against installed source:

- Promotion-level `rules` are evaluated against the **whole cart** — `update-cart-promotions.js` passes the cart as `computeActionContext`, and `promotion-module.js:511` calls `areRulesValidForContext(promotionRules, applicationContext, ApplicationMethodTargetType.ORDER)`.
- `decorateCartTotals` sets `cart.original_item_total = Σ item.original_total` — the items total **including tax, before any discount**. Under tax-inclusive INR pricing that is exactly the MRP subtotal the storefront prints, and exactly what `discounts.ts` compares `minSubtotal` against. (`subtotal` and `item_subtotal` are ex-tax and would gate ≈₹200 too early on a ₹1200 threshold.) It is in `cartFieldsForRefreshSteps`, so it is populated when rules run.
- Rule values must be **strings**: `areRulesValidForContext` builds `validRuleValues` only from values passing `isString`, and returns `false` if none survive. `pickValueFromObject` + `MathBN.convert` then coerce the cart's `BigNumber` for the comparison.
- The module does not restrict rule attributes — `validatePromotionRuleAttributes` checks only that `attribute` and `operator` are present and the operator is in the enum.

**Admin caveat:** `original_item_total` is not in the admin's `rule-attributes-map.js`, whose only entries are `customer.groups.id`, `region.id`, `shipping_address.country_code`, `sales_channel_id` and a disguised `currency_code`. The API accepts the rule (`validateRuleAttribute` is wired only to the `rule-value-options` dropdown route, never to create/update), but the admin promotion form will not render it as a named field. Edit these two codes through the seed script, not the admin.

`allocation: "across"` is what "₹150 off the order" means — one discount spread over the cart. `max_quantity` is illegal with it (`validateApplicationMethodAttributes`) and would be wrong regardless: it caps units per line, never rupees per cart. Verified on real carts: ₹1298 → ₹150 off; ₹649 → no action; ₹749 + ₹649 → ₹80.36 + ₹69.64, summing to exactly ₹150.

### 7.2 FIRSTVALLEY cannot be built as specified

Medusa 2.19 has **no monetary cap on a percentage promotion**. `getPromotionValueForPercentage` (`@medusajs/utils/dist/totals/promotion/index.js`) is `value / 100 × lineItemAmount`, unconditionally, and `CreateApplicationMethodDTO` has no cap field. Every workaround is closed:

- **`max_quantity`** caps units per line, not rupees per cart, and is illegal with `allocation: across`.
- **Two promotions sharing one code** — blocked by `IDX_unique_promotion_code`, a unique index on `promotion.code`.
- **Campaign budget** — campaign-wide spend, not a per-order cap.
- **Workflow hooks** — `setPromotionContext` affects rule _evaluation_ only; nothing can rewrite the adjustments the module has computed.

The cap binds on ordinary carts (3 × ₹749 = ₹2,247, 10% = ₹224.70, which the storefront preview caps to ₹150), so it cannot be waved through. `seed-promotions.ts` refuses to seed the uncapped version and `check-promotions.ts` fails the build while the disagreement stands — the storefront must not preview an offer the server will not honour. Resolving it is a commercial decision, listed in §17.

**Free shipping ships as an automatic promotion, and the ordering still holds.** `src/lib/cart.ts` evaluates the ₹999 threshold against the **post-discount** payable:

```ts
const off = discount ? Math.min(discount.amount, subtotal) : 0;
const payable = subtotal - off;
const freeShipping = empty || payable >= TERMS.freeShippingAbove;
```

That ordering is a deliberate customer-unfavourable-looking choice that is actually the honest one (a ₹1,050 cart with ₹150 off pays shipping). An earlier draft of this plan proposed reproducing it inside the Shiprocket provider's `calculatePrice`; it is instead `FREESHIPPING`'s `item_total gte 999` rule, because `item_total` is Medusa's name for exactly that post-discount figure and the arithmetic then lives in one place rather than two. The shipping option goes on quoting the published flat ₹79 and the promotion zeroes it. A checkout total that differs from the cart total is the single most trust-destroying bug an e-commerce site can ship, so it still gets an explicit test (§16).

---

## 8. Payment — custom Razorpay provider

### 8.1 Why custom

Four candidates, all rejected on verified npm metadata:

| Package                     | Latest                    | Verdict                                                               |
| --------------------------- | ------------------------- | --------------------------------------------------------------------- |
| `medusa-payment-razorpay`   | 7.3.2 (2024-11-20)        | peers `@medusajs/medusa ^1.12.0` + `typeorm` — **Medusa v1 only**     |
| `medusa-plugin-razorpay-v2` | 0.1.4 (2025-12-31)        | peers hard-pinned to **2.12.3**                                       |
| `@sgftech/payment-razorpay` | 2.1.11 (2024-11-05)       | unmaintained ~21 months                                               |
| `@devx-commerce/razorpay`   | 6.0.0-beta.0 (2026-05-19) | still beta after 51 releases, no repo URL, peers pinned to **2.14.2** |

A payment provider is ~400 lines against a stable, documented abstract class. Taking a dependency that pins a peer two minors behind, on the one code path that moves money, is the worse risk.

### 8.2 The contract

`AbstractPaymentProvider` (from `utils/dist/payment/abstract-payment-provider.d.ts`) — ten abstract methods, all required:

| Method                            | Razorpay action                                                |
| --------------------------------- | -------------------------------------------------------------- |
| `initiatePayment`                 | `POST /v1/orders` → return `{ id: rzp_order_id, data: { … } }` |
| `authorizePayment`                | verify the checkout signature → `{ status: "authorized" }`     |
| `capturePayment`                  | no-op under auto-capture; reads back payment state             |
| `getPaymentStatus`                | `GET /v1/payments/:id` → map to `PaymentSessionStatus`         |
| `retrievePayment`                 | `GET /v1/payments/:id`                                         |
| `updatePayment`                   | amount changed pre-payment → create a fresh Razorpay order     |
| `cancelPayment` / `deletePayment` | Razorpay orders expire on their own; local cleanup             |
| `refundPayment`                   | `POST /v1/payments/:id/refund`, paise                          |
| `getWebhookActionAndData`         | §8.5                                                           |

### 8.3 The money conversion — the bug this section exists to prevent

Medusa stores INR as a **decimal** (`INR.decimal_digits = 2`, and `BigNumber` holds `649`, not `64900`). Razorpay's `amount` is an **integer in paise**, minimum `100`.

```ts
const paise = Math.round(new BigNumber(input.amount).numeric * 100);
```

Get this wrong in either direction and the store charges ₹6.49 or ₹64,900. It is asserted in a unit test with the five real SKU prices and every promotion combination (§16).

### 8.4 Idempotency

`receipt` on the Razorpay order is the `OrderDraft.ref` the browser already generates:

```ts
// src/lib/order.ts
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford minus I,L,O,U
export function newRef(now = new Date()): string {
  /* `SV${yy}${mm}${dd}-${5 chars}` */
}
```

`SV260829-K3P7M` — 14 characters, well inside Razorpay's 40-char `receipt` limit, and unique. The header comment in `order.ts` anticipated exactly this: the ref "becomes the idempotency key the browser sent". A double-submitted checkout reuses the receipt and does not create a second charge.

### 8.5 Webhook — the part that must not be got wrong

**Verification.** `X-Razorpay-Signature` is HMAC-SHA256 over the **raw** body, keyed with the **webhook secret** — a different secret from `KEY_SECRET`. Medusa makes the raw body available:

```js
// core/dist/api/hooks/middlewares.js
{ method: ["POST"], bodyParser: { preserveRawBody: true }, matcher: "/hooks/payment/:provider" }
```

so `getWebhookActionAndData` receives `payload.rawData` and verifies against that, never against a re-serialised `payload.data`. Re-serialising is the classic silent break: key order changes, the HMAC fails, every webhook 400s.

**The `session_id` requirement.** From `core/dist/subscribers/payment-webhook.js`:

```js
const processedEvent = await paymentService.getWebhookActionAndData(input);
if (!processedEvent.data?.session_id) {
  return;
}
```

No `session_id`, no error, no log, nothing happens. So the provider **must** resolve the Razorpay order back to a Medusa payment session. Done by storing `session_id` in the Razorpay order's `notes` at `initiatePayment` (`notes` allows 15 pairs × 256 chars, ASCII) and reading it back on the webhook.

**Checkout-handler verification.** The `order_id` in the signature payload is read from **our** database, never from the `razorpay_order_id` the browser echoes back:

```
generated_signature = hmac_sha256(order_id + "|" + razorpay_payment_id, key_secret)
```

Trusting the browser's copy is the documented way to forge a payment confirmation.

**Belt and braces.** The webhook is authoritative, not the browser callback. If the customer closes the tab between paying and redirecting, `payment.captured` still arrives and still completes the order. The frontend's `startPayment` result is a UI convenience; the order exists because Razorpay said so.

### 8.6 The storefront seam — built

Three new files and two edits, all verified against the running backend on 2026-09-01.

The publishable key is deliberately **not** `NEXT_PUBLIC_`-prefixed, so the browser cannot talk to Medusa at all. Every write goes through a route handler on the storefront's own origin:

```
POST /api/checkout          → src/lib/checkout.ts  startCheckout(draft)
POST /api/checkout/complete → src/lib/checkout.ts  completeCheckout(cartId)
```

`startCheckout` runs a fixed order of operations, because `createPaymentCollectionForCartWorkflow` freezes `amount` from the cart total and nothing may move it afterwards:

```
regionId()  →  slug → variant_id + stock check (getOverlay)
  → POST /store/carts        { region_id, email, shipping_address, items, promo_codes?, metadata:{draft_ref} }
  → GET  /store/shipping-options?cart_id=…      (exactly one, or refuse)
  → POST /store/carts/:id/shipping-methods      ← the authoritative total
  → TOTAL TRIPWIRE
  → GET  /store/payment-providers?region_id=…
  → POST /store/payment-collections             { cart_id }
  → POST /store/payment-collections/:id/payment-sessions { provider_id }
```

Four things there are load-bearing:

- **The tripwire.** The draft total the browser sends is used exactly once — compared against Medusa's, to ±0.005. Any drift refuses the order and logs the full breakdown. Nothing the browser says about money is ever charged.
- **`metadata: { draft_ref }`.** `complete-cart.js:454` copies cart metadata onto the order, so the customer-facing `SV260901-XXXXX` survives into Medusa and `Confirmation.tsx`, `/track` and the support mailto keep working unchanged.
- **Provider selection is asked, not assumed.** A `pp_razorpay*` provider wins. Outside production the first enabled provider is accepted, which is what lets a laptop with no Razorpay keys exercise the whole path against `pp_system_default`. **In production a missing Razorpay provider refuses the order** rather than silently authorising every checkout for free.
- **`landmark` rides in `shipping_address.metadata`.** `AddressPayload` is `.strict()` and has no such field; jamming it into `address_2` would corrupt the courier label.

`completeCheckout` draws the one distinction that matters:

| Medusa says                        | Route handler answers                 | Browser does                                                                    |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| `{ type: "order" }`                | `{ ok: true, orderId }`               | confirmed                                                                       |
| HTTP 200 `{ type: "cart", error }` | `{ ok: false, indeterminate: false }` | declined — this is a **fact**, the provider re-read Razorpay and no money moved |
| anything thrown                    | `{ ok: false, indeterminate: true }`  | **treated as paid** — the webhook subscriber finishes the order server-side     |

That last row is the whole point. A timeout after the money has moved must never tell a customer they were not charged.

`src/lib/payment.ts` opens Razorpay Standard Checkout directly (checkout.js injected imperatively at the moment the customer commits, not via `next/script`), passing back Razorpay's own `amount`, `currency` and `order_id`. The `handler` response is **ignored**: `razorpay_signature` is a browser-supplied claim, and the provider authorises by re-reading the order from Razorpay's API instead. A `settled` guard makes the first resolution win; `payment.failed` records the bank's description but does not resolve, because Checkout leaves the modal open for a retry, and `modal.ondismiss` then reports `declined` rather than `cancelled`.

The result union gained a fifth code:

```ts
code: "not-configured" | "unavailable" | "cancelled" | "declined" | "network";
```

`unavailable` is a refusal from `/api/checkout` — before the modal, no money in flight, something on the page may be fixable — so `CheckoutView.tsx` keeps the customer on the checkout page with the specific reason instead of routing to `/order/failed`.

**Verified end to end** against `pp_system_default`: order created at ₹1298 with `metadata.draft_ref` intact, free delivery applied (₹79 shipping method recorded, `shipping_total` 0), CGST 9% + SGST 9% split on the line, 2 units reserved, and re-posting the same `cartId` returns the **same** order rather than a second one. Every refusal path was exercised: total drift, unknown slug, unpriced SKU, quantity over stock, malformed body, malformed cart id. The Razorpay modal itself cannot be exercised without test keys (§17.4).

---

## 9. Fulfilment — custom Shiprocket provider

`AbstractFulfillmentProviderService` (`utils/dist/fulfillment/provider.d.ts`):

| Method                    | Shiprocket                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getFulfillmentOptions`   | static: Standard / Express                                                                                                                                                                                                                     |
| `validateFulfillmentData` | `GET /v1/external/courier/serviceability/` — pincode serviceable?                                                                                                                                                                              |
| `canCalculate`            | `true`                                                                                                                                                                                                                                         |
| `calculatePrice`          | `TERMS.shippingFlat` ₹79, always. Free delivery over ₹999 is the `FREESHIPPING` promotion (§7), not a branch in here — the option quotes the published flat rate and the promotion zeroes it. Serviceability is live; the _price_ never moves. |
| `createFulfillment`       | `POST /v1/external/orders/create/adhoc` → `POST /v1/external/courier/assign/awb` → AWB + courier name                                                                                                                                          |
| `cancelFulfillment`       | Shiprocket cancel                                                                                                                                                                                                                              |
| `getShipmentDocuments`    | label / manifest                                                                                                                                                                                                                               |
| `createReturnFulfillment` | return pickup                                                                                                                                                                                                                                  |

**Token handling.** Shiprocket issues a bearer token with a finite life. Cached in Redis with a TTL below its expiry and refreshed by a scheduled job; never fetched inline on a customer-facing request, where a slow auth call would stall checkout.

**Manual lane stays registered.** `fulfillment-manual` remains in the module list. If Shiprocket is down or a pincode is unserviceable, an admin can still fulfil by hand and the tracking email still goes out. Fail-open on shipping, fail-closed on payment.

**Serviceability at checkout.** The PIN field in `CheckoutView` already validates format (`/^[1-8]\d{5}$/`). It gains a debounced serviceability check so an unserviceable pincode is caught before payment, not after.

**This fills two `TBC()` holes** in `src/lib/business.ts`: `TERMS.courier` and the courier row of `PROCESSORS[]`.

---

## 10. Auth, accounts, and guest orders

### 10.1 Registration is two-step

Verified in `core/dist/api/auth/[actor_type]/[auth_provider]/register/route.js` — the comment in Medusa's own source explains it:

> "At registration time the auth identity doesn't have an actor attached to it, so we return the actorless token."

```
POST /auth/customer/emailpass/register   { email, password }  → { token }        (actorless)
POST /store/customers                     Bearer <token>       → customer created
POST /auth/customer/emailpass             { email, password }  → { token }        (actor-attached)
```

`POST /store/customers` carries `authenticate("customer", …, { allowUnregistered: true })`, which is what makes step 2 work with an actorless token.

### 10.2 Login, session, refresh

`POST /auth/customer/emailpass` → JWT. `POST /auth/token/refresh` to renew. Storefront holds the token in an **httpOnly, Secure, SameSite=Lax cookie set by a Next route handler** — never `localStorage`, which is readable by any injected script.

### 10.3 Guest → account, without losing the order

The whole point of "accounts + guest": a guest checks out, then registers, and their order must follow them. Medusa 2.19.0 has this built in — `store/orders/[id]/transfer/{request,accept,decline,cancel}`. Flow:

1. Guest order completes with `email` set, `customer_id` null.
2. Customer later registers with the same email.
3. `POST /store/orders/:id/transfer/request` (authenticated).
4. Medusa emails the order's address a confirmation token.
5. `POST /store/orders/:id/transfer/accept` binds the order to the account.

The email round-trip is the security property: registering with someone else's address does not hand you their order.

### 10.4 Deferred

`auth-google` and MFA (2.19.0 ships `/auth/mfa/*`) are out of scope. A five-SKU store does not need social login on day one, and MFA on a customer account protects an address book. Both are additive.

---

## 11. Security

### 11.1 `GET /store/orders/:id` is unauthenticated — must be closed

The most important finding in this document. From `core/dist/api/store/orders/middlewares.js`, the retrieve route has **no `authenticate` middleware** — only the _list_ route does. And the handler carries Medusa's own admission:

```js
// core/dist/api/store/orders/[id]/route.js
// TODO: Do we want to apply some sort of authentication here? My suggestion is that we do
const GET = async (req, res) => { … }   // no ownership check
```

Anyone holding an order id can read the customer's **name, email, phone, full shipping address, items and totals**. Order ids are high-entropy and not guessable — but they leak: URLs, confirmation emails, browser history, `Referer` headers, analytics, support screenshots.

**Mitigation, and it is not optional.** `medusa/src/api/middlewares.ts` overrides the matcher `/store/orders/:id` with a custom middleware that allows the request only if:

- the caller is an authenticated customer and `order.customer_id` matches; **or**
- the caller presents a short-lived signed order token issued at completion and delivered in the confirmation email.

The `/track` page uses reference + email, resolved through a **custom store route** that rate-limits by IP and email and returns only status and courier — never the address block.

### 11.2 The rest

| Surface         | Control                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publishable key | `x-publishable-api-key` on every store request; scoped to the one sales channel. Public by design — not a secret, and never used for anything privileged.                                                       |
| CORS            | `storeCors` / `adminCors` / `authCors` set to exact origins. No wildcards, no regex convenience.                                                                                                                |
| Secrets         | AWS Secrets Manager, injected as ECS task secrets. Never in the image, never in the repo, never in `NEXT_PUBLIC_*` — only `NEXT_PUBLIC_RAZORPAY_KEY_ID` is public, and it is a public key by Razorpay's design. |
| Rate limits     | Per-IP on `/auth/*` (credential stuffing), `/store/carts/*/complete`, the `/track` lookup, and the password-reset request. Redis-backed, so limits hold across tasks.                                           |
| Admin           | `@medusajs/rbac`. One owner account, per-person invites. No shared logins.                                                                                                                                      |
| Transport       | TLS everywhere; HSTS at CloudFront; RDS and ElastiCache encryption at rest and in transit.                                                                                                                      |
| Webhook         | HMAC over raw body, and the endpoint is idempotent — Razorpay retries.                                                                                                                                          |
| Input           | Medusa validates with Zod at the route boundary; custom routes use the same `validateAndTransformBody`.                                                                                                         |
| PII             | The order's address block never leaves the order. Analytics events carry slug and value, never contact details.                                                                                                 |
| Logs            | Redact `authorization`, `x-razorpay-signature`, card-shaped strings, email, phone.                                                                                                                              |

### 11.3 Data residency

The user chose ap-south-1 for data location. Stating the position accurately rather than overclaiming it:

- **RBI's April 2018 "Storage of Payment System Data" circular binds Payment System Operators** — Razorpay — not merchants. Razorpay's compliance is Razorpay's.
- **DPDP does not impose general localisation.** The Rules were notified November 2025; the Consent Manager framework goes live 13 Nov 2026 and full compliance lands 13 May 2027.
- What ap-south-1 actually buys: order data (name, phone, email, address) never crosses a border, so `src/lib/business.ts` `PROCESSORS[]` and `STORAGE[]` can say "India" plainly instead of disclosing a cross-border transfer. Simpler notice, simpler consent, no adequacy argument.

Not legal advice — the privacy policy wording is for the client's counsel. The architecture is built so the honest answer is the simple one.

---

## 12. Storefront rewiring

`@medusajs/js-sdk@2.19.0` against the Store API. The bespoke Next 16 frontend stays; only `src/lib/*` gains a server-truth path.

### 12.1 Checkout flow

As built — see §8.6 for the full sequence and the reasoning. The browser never holds the publishable key; `src/lib/checkout.ts` runs server-side behind two route handlers, and `cart.complete()` returning `type: "cart"` is handled as a real branch, not assumed away.

### 12.2 Files touched

| File                                                     | Change                                                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/payment.ts`                                     | ✅ Razorpay Standard Checkout handoff; result codes gained `unavailable`                                                    |
| `src/lib/cart.ts`                                        | keep the arithmetic as **optimistic preview**; totals shown at checkout come from the cart response                         |
| `src/lib/discounts.ts`                                   | preview only; server applies via `/store/carts/:id/promotions`                                                              |
| `src/lib/order.ts`                                       | unchanged — `newRef()` rides to Medusa as `cart.metadata.draft_ref`, which the order inherits, so no signed token is needed |
| `src/lib/products.ts`                                    | `price` and `stock` hydrate from Medusa; editorial fields unchanged                                                         |
| `src/lib/business.ts`                                    | `TERMS.courier` and one `PROCESSORS[]` row resolve; 24 `TBC()` remain (§17)                                                 |
| **new** `src/lib/medusa.ts`                              | ✅ `server-only` read path: SDK client, region id, price + stock overlay                                                    |
| **new** `src/lib/checkout.ts`                            | ✅ `server-only` write path: cart → shipping → tripwire → payment session → complete                                        |
| **new** `src/app/api/checkout/{route,complete/route}.ts` | ✅ the two doors on this origin; hand-written validation (the storefront has no zod)                                        |
| `src/components/dom/checkout/CheckoutView.tsx`           | ✅ `unavailable` joins `not-configured` on the inline-failure branch                                                        |
| **new** `src/app/account/*`                              | login, register, orders, addresses (§10)                                                                                    |
| `Confirmation.tsx`                                       | reads the completed order, not only the sessionStorage draft — so a reload survives                                         |

`Confirmation.tsx` currently has three branches (`undefined` loading / `null` no-order / receipt) and its `null` copy is honest about the limitation: "A confirmation lives in the tab that placed the order, so it does not survive a closed window." With a real backend that stops being true, and the `null` branch becomes a genuine not-found.

### 12.3 Rendering

Price and stock are read **on the server** in the root layout and handed down as a small overlay keyed by slug, with `next: { revalidate: 60, tags: ["catalogue"] }` — so a page is static between refreshes and `revalidateTag("catalogue")` beats the window when a price actually moves. No client-side fetch after paint, and no unpriced flash. An unreachable backend returns `{}`, which renders as "arriving soon" everywhere rather than quoting a price nobody confirmed; at **build** time the same failure throws instead, because baking a dead catalogue into a deploy is worse than a red build.

---

## 13. Deployment — AWS ap-south-1

```
Route 53
   ├── swasthvica.com          → CloudFront → Next 16 storefront
   ├── api.swasthvica.com      → ALB → ECS Fargate  [medusa: server]
   └── admin.swasthvica.com    → same service, admin dashboard
                                       │
        ECS Fargate  [medusa: worker] ─┤   (no ALB, no public ingress)
                                       │
                    RDS PostgreSQL 16 (Multi-AZ) ── ElastiCache Redis
                    S3 (product media, private) ── CloudFront OAC
```

| Component            | Spec                                     | Why                                                                                                                |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| ECS Fargate `server` | 1 vCPU / 2 GB, min 2 tasks               | Medusa needs ≥2 GB; two tasks for zero-downtime deploys                                                            |
| ECS Fargate `worker` | 0.5 vCPU / 2 GB, 1 task                  | `MEDUSA_WORKER_MODE=worker`, no ingress                                                                            |
| RDS Postgres 16      | `db.t4g.small`, Multi-AZ, 7-day PITR     | Multi-AZ because the order table is the business                                                                   |
| ElastiCache Redis 7  | `cache.t4g.micro`, encryption in transit | cache + events + workflows + locks + rate limits                                                                   |
| S3                   | private bucket, CloudFront OAC           | no public bucket                                                                                                   |
| Secrets Manager      | all credentials                          | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`, Razorpay key/secret/webhook-secret, Shiprocket, Resend |
| CloudWatch           | logs + alarms                            | §14                                                                                                                |

**Storefront hosting is unchanged** by this plan — Vercel or CloudFront both work. Only its `NEXT_PUBLIC_MEDUSA_BACKEND_URL` and publishable key are new. One deploy-layer item carries over from the frontend work: **Brotli at the CDN** on the 864 KB raw / 226 KB gzipped three.js chunk.

**Migrations** run as a one-off ECS task before the service update, never at container start — two tasks racing `medusa db:migrate` is how a schema gets corrupted.

---

## 14. Observability and recovery

| Alarm                            | Threshold                                       |
| -------------------------------- | ----------------------------------------------- |
| Payment webhook failures         | any in 5 min → page                             |
| Orders stuck `pending` payment   | > 15 min → page                                 |
| Razorpay signature mismatches    | > 3 in 10 min → page (attack or rotated secret) |
| 5xx rate                         | > 1% over 5 min                                 |
| Worker queue depth               | > 100                                           |
| Shiprocket token refresh failure | any                                             |
| RDS free storage / CPU           | standard                                        |

**Reconciliation job**, daily: list Razorpay payments for the window, diff against Medusa orders, report both directions — a captured payment with no order, an order with no capture. This is the safety net that catches the failure a webhook retry could not.

**Backups.** RDS automated + PITR 7 days. Weekly logical dump to S3 with lifecycle to Glacier. **A restore is rehearsed once into a scratch instance before launch** — an untested backup is a belief, not a backup.

**Runbook** (written, in `medusa/RUNBOOK.md`): payment stuck, webhook secret rotation, Shiprocket outage → manual lane, restore from PITR, rolling back a bad deploy.

---

## 15. Emails

Custom Resend provider implementing `AbstractNotificationProviderService` — a single `send(notification)` method taking `{ to, from, channel, template, data, attachments }`.

| Trigger                | Email                                           |
| ---------------------- | ----------------------------------------------- |
| `order.placed`         | confirmation + tax invoice PDF                  |
| `shipment.created`     | courier + AWB + tracking link                   |
| delivered              | delivery confirmation                           |
| `order.canceled`       | cancellation                                    |
| refund issued          | refund confirmation, quoting `TERMS.refundDays` |
| password reset         | token link                                      |
| order transfer request | the §10.3 confirmation                          |

Templates match the site: cream on olive, Didone display, the same voice. `Confirmation.tsx` already promises "A tax invoice travels in the box" — the PDF also goes by email, generated from the order with GSTIN, HSN per line, and the CGST/SGST/IGST split from §5.

---

## 16. Testing

| Layer       | What                                                                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | **paise conversion** across all five prices × every promotion combination; GST split intra vs inter-state; `newRef()` uniqueness and the 40-char receipt bound |
| Unit        | **free-shipping threshold against post-discount payable** — the §7 ordering, asserted against `cart.ts`                                                        |
| Integration | full checkout on Razorpay test keys: success, failure, cancel, network drop, **tab closed after payment**                                                      |
| Integration | webhook signature valid / invalid / replayed / stale-secret                                                                                                    |
| Integration | guest checkout → register → order transfer                                                                                                                     |
| Integration | `GET /store/orders/:id` as a stranger → **403** (the §11.1 regression test)                                                                                    |
| Integration | promotion applied server-side matches the client preview, and a tampered amount is refused                                                                     |
| Contract    | `check-catalogue.ts` in CI                                                                                                                                     |
| Load        | 50 concurrent checkouts; inventory never goes negative                                                                                                         |

The tampered-amount test is the one that matters most: `discounts.ts` says the server "must recompute the order server-side from the cart and the code, and refuse the charge if the amount it derives differs from the amount the browser sent." That sentence becomes an assertion.

---

## 17. Blocked on the client

Nothing below can be invented. Phases that need them are marked in §18.

**Hard blockers — payment cannot go live without these:**

1. **GSTIN**, legal name, legal form, CIN, registered address (`src/lib/business.ts`, currently `TBC()`).
2. **Per-SKU HSN codes and GST rates** — from the CA. Everything else in §5 is built and tested; this is
   the one missing input. Fill `medusa/src/data/gst.json` (`rates`: HSN → total GST %, `products`: slug →
   HSN) and run `npm run seed:gst`. The file ships empty and the script refuses, per SKU, until it is not.
3. **Place of supply** — `GST_ORIGIN_STATE`, the seller's registered state, spelled in full as the
   storefront's address form spells it (`"Uttar Pradesh"`, not `"UP"`). Decides CGST + SGST versus IGST on
   every invoice. The backend boots without it and refuses the first cart; a misspelling fails the boot.
4. **Razorpay account**: business sub-category, KEY_ID, KEY_SECRET, webhook secret.
5. **Shiprocket account**: credentials, pickup location, pickup address.
6. **Support email and phone**, grievance officer name and address (IT Rules requirement).

**Soft blockers — the store runs without them, but with holes:**

7. Brand spelling. `Swasthvica` / `Swasthhvica` / `swasthavic` all appear in the repo; `docs/PLAN.md` records **Swasthvica** as canonical. Needs one decision, then a sweep.
8. `NEXT_PUBLIC_SITE_URL` — the production domain.
9. Cosmetic licence (Form COS-8), manufacturer name and address, FSSAI number, AYUSH Form D-25 — the three `status: "soon"` SKUs may need the AYUSH one.
10. Opening stock counts per SKU.
11. Jurisdiction city for `TERMS.jurisdiction`.
12. Optional `SUPPORT.whatsapp`.
13. The `hairfall-defense` packshot; release dates and pricing for the three `soon` SKUs.
14. **What `FIRSTVALLEY` should actually be.** Medusa cannot cap a percentage promotion (§7.2), so the code as written is unbuildable. Three ways out, all of which change the offer or cost money: (a) drop the cap — 10% uncapped above ₹599, native and exact, exposure grows with cart size (six bottles ≈ ₹4,200 → ₹420 off); (b) make it a flat rupee amount — native and predictable, but a flat ₹150 above ₹599 makes `TWOBOTTLES` (₹150 above ₹1,200) strictly redundant, so that code needs rethinking too; (c) fund custom code wrapping the promotion module's `computeActions` to scale down the returned `ADD_ITEM_ADJUSTMENT` amounts — real work on a core module and real upgrade risk. Until this is answered the code is offered by the storefront and refused by the server, and `check:promotions` fails.

24 of the 26 `TBC()` markers in `src/lib/business.ts` are still open after this plan; §9 closes 2.

---

## 18. Phase order

Each phase ends in something demonstrable. Phases 1–5 need nothing from the client and are **done**, except for the one commercial answer §17.14 asks for and the two GST inputs §17.2 and §17.3 hold up — none of which block the code, only the going-live.

| #      | Phase                                                                                                                                          | Blocked on                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **1**  | ✅ Scaffold `medusa/`, config, module list, Postgres + Redis local, admin up                                                                   | —                                                  |
| **2**  | ✅ Catalogue: seed 5 products, prices, `check-catalogue.ts`, inventory, storefront reads price + stock                                         | —                                                  |
| **3**  | ✅ Promotions: `TWOBOTTLES` server-side + drift guard; `FIRSTVALLEY` refused by both scripts until the offer is decided                        | `FIRSTVALLEY` only (§17.14)                        |
| **4**  | ✅ **`india-gst` provider** — CGST/SGST/IGST split, `seed:gst`, `check:catalogue` assertions, 19 unit tests, verified against a running server | done; **going live needs** §17.2, §17.3            |
| **5**  | ✅ **`razorpay` provider** — provider, webhook, `payment.ts` seam, storefront write path, verified end to end against `pp_system_default`      | code done; **the modal and live money need §17.4** |
| **6**  | Accounts: register, login, `/account/*`, guest order transfer                                                                                  | —                                                  |
| **7**  | **Security pass** — close `/store/orders/:id`, `/track` route, rate limits, CORS, secrets                                                      | —                                                  |
| **8**  | **`shiprocket` provider** + serviceability at checkout                                                                                         | §17.5                                              |
| **9**  | **`resend` provider**, all seven emails, invoice PDF                                                                                           | §17.1 for the invoice                              |
| **10** | AWS ap-south-1: Terraform, ECS server + worker, RDS, Redis, S3, secrets, alarms                                                                | AWS account                                        |
| **11** | Observability, reconciliation job, backup restore rehearsal, runbook                                                                           | —                                                  |
| **12** | Load test, full checkout matrix, launch checklist                                                                                              | all of §17                                         |

Phase 7 is deliberately not last. `/store/orders/:id` is open the moment phase 2 creates a real order, and every phase after it makes the exposure bigger.

---

## 19. What this plan does not do

Stated so scope is visible, not silently assumed away.

- **No COD.** `TERMS.codAvailable = false`. Adding it later is a payment provider and a fulfilment rule, not a rewrite.
- **No multi-currency, no international.** One region, INR.
- **No subscriptions**, no loyalty, no gift cards, no B2B pricing.
- **No search engine.** Five SKUs.
- **No CMS.** The hybrid choice puts editorial in code, reviewed like code.
- **No social login, no MFA.** §10.4.
- **No product reviews.** The frontend has no review surface, and inventing reviews is out of the question — real ones need a real collection mechanism, which is a separate decision.
- **No headless analytics backend.** `analytics-posthog` exists if the client wants it later.
