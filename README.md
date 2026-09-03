# Swasthvica

The storefront and commerce backend for Swasthvica, a five-SKU Ayurvedic hair-care line.

Two projects live in this one repository and they do not share a package manager:

|               |                      |                                                           |
| ------------- | -------------------- | --------------------------------------------------------- |
| **`/`**       | the storefront       | Next.js 16 · React 19 · Tailwind v4 · three.js · **pnpm** |
| **`/medusa`** | the commerce backend | Medusa v2 · Postgres · Redis · **npm**                    |

`npm install` at the repository root fails. Use `pnpm` here and `npm` inside `medusa/`.

## What the split is

The catalogue is deliberately halved. Everything editorial — copy, provenance, ritual, the
photography, the ordering of the shelf — lives in `src/lib/products.ts` and ships with the
frontend. Everything transactional — price, stock, orders, promotions, tax, fulfilment — lives in
Medusa. The two are joined by `slug`, which is the Medusa product `handle`.

That is why the storefront builds and serves with no backend at all: `src/lib/medusa.ts` returns an
empty overlay when `MEDUSA_URL` is unset, and every bottle reads "arriving soon". A backend that is
configured and _unreachable_ is an outage, and fails the build loudly instead.

## Running it

```bash
pnpm install
cp .env.example .env.local     # fill in as much as you have
pnpm dev                       # http://localhost:3000
```

The backend, in a second terminal:

```bash
cd medusa
npm install
cp .env.template .env          # DATABASE_URL, REDIS_URL, JWT_SECRET, COOKIE_SECRET, GST_ORIGIN_STATE
npx medusa db:migrate
npm run seed                   # products, region, shipping, stock location
npm run seed:gst               # per-SKU HSN + GST rate, from src/data/gst.json
npm run seed:promotions
npm run dev                    # http://localhost:9000, admin at /app
```

Postgres and Redis are expected on their default ports.

### Checks

```bash
pnpm lint            # storefront
npx tsc --noEmit     # storefront types
cd medusa && npm run check:catalogue    # every storefront slug has a Medusa handle, price and stock
cd medusa && npm run check:promotions
```

## Deploying the storefront to Vercel

Import the repository, leave the framework preset on Next.js, and set the four variables from
`.env.example` under Settings → Environment Variables. Build command and output directory are the
defaults; Vercel detects pnpm from `pnpm-lock.yaml`. `medusa/` is not a workspace member and is not
built.

`MEDUSA_URL` must be reachable from Vercel's build and runtime — a `localhost` value works on a
laptop and nowhere else. Until the backend is hosted, leave both Medusa variables empty: the site
deploys, reads correctly, and refuses to take money.

The backend is not a Vercel workload. It is a long-running server with Postgres, Redis, a worker
mode and a webhook endpoint; `docs/BACKEND-PLAN.md` §12 covers the intended AWS ap-south-1 target.

## Documents

- `docs/PLAN.md` — the frontend plan, page by page.
- `docs/BACKEND-PLAN.md` — the commerce plan in twelve phases, including §17, the list of things
  only the client can supply: GSTIN, per-SKU HSN codes and rates, place of supply, the Razorpay
  account, the Shiprocket account, and the support contacts printed in the policies.
- `AGENTS.md` — read before writing Next.js code. This is Next 16; `middleware.js` is now
  `proxy.js`, and the installed docs under `node_modules/next/dist/docs/` are the authority.

## What is not switched on yet

Payments run against Medusa's built-in `pp_system_default` until `RAZORPAY_KEY_ID` is set — it
authorises without moving money, which exercises the whole cart-to-order path on a laptop and is
refused outright in production. GST pricing refuses rather than defaulting: a product with no rate
in `medusa/src/data/gst.json` fails to price, on purpose, because a silently untaxed invoice is
worse than a checkout that stops.
