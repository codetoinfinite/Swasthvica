import { loadEnv, defineConfig, Modules } from "@medusajs/framework/utils";
import { GST_PROVIDER_ID } from "./src/modules/india-gst";
import { RZP_PROVIDER_ID } from "./src/modules/razorpay";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

/**
 * Swasthvica commerce backend.
 *
 * WHY EVERY MODULE SPECIFIER IS `@medusajs/medusa/x` AND NOT `@medusajs/x`:
 * both resolve, but only the former exports `discoveryPath`, and
 * modules-sdk/dist/medusa-app.js:155 branches on exactly that key to find a module's real entry
 * point for migration discovery. `@medusajs/medusa/cache-redis` is a three-line re-export of
 * `@medusajs/cache-redis` that adds it. Using the bare package name loses migrations silently, so
 * these strings are not interchangeable and must not be "simplified".
 *
 * For the same reason none of these packages appear in package.json: `@medusajs/medusa` already
 * depends on every one of them at an exact 2.19.0 pin, so a second declaration here could only
 * ever drift away from the version the re-export actually loads.
 */

/**
 * A required secret, read once at boot.
 *
 * Medusa will happily start with an undefined jwtSecret and sign tokens with a generated one, which
 * means every restart invalidates every session and -- far worse -- two instances behind a load
 * balancer sign with different keys. That is a silent production failure, so it is a loud boot
 * failure here instead.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Copy .env.template to .env and fill it in (openssl rand -base64 32).`,
    );
  }
  return v;
}

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * "worker" runs jobs and subscribers with no HTTP server; "server" is the reverse; "shared" is one
 * process doing both, which is what a single box in development wants. The admin dashboard is only
 * built and served by a process that has an HTTP server, so it is switched off in worker mode --
 * otherwise the worker spends a minute of every deploy building a UI nobody can reach.
 */
const WORKER_MODE = (process.env.MEDUSA_WORKER_MODE || "shared") as "shared" | "worker" | "server";

/**
 * S3 is where admin-uploaded assets go. The storefront ships its own product photography out of
 * `public/`, so nothing customer-facing depends on this -- which is why the absence of a bucket is
 * not an error. Without one, Medusa falls back to writing into `medusa/static` on local disk, which
 * is correct for a laptop and wrong for anything with more than one instance.
 */
const S3_BUCKET = process.env.S3_BUCKET;

const fileProvider = S3_BUCKET
  ? {
      resolve: "@medusajs/medusa/file-s3",
      id: "s3",
      options: {
        file_url: process.env.S3_FILE_URL,
        access_key_id: process.env.S3_ACCESS_KEY_ID,
        secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
        region: process.env.S3_REGION,
        bucket: S3_BUCKET,
        endpoint: process.env.S3_ENDPOINT,
      },
    }
  : {
      resolve: "@medusajs/medusa/file-local",
      id: "local",
      options: {},
    };

/**
 * Razorpay is the only way this store can take money, and its keys are a client fact (see
 * docs/BACKEND-PLAN.md 17.4). Registering the provider without them would be worse than not
 * registering it: it would appear at checkout and fail on every customer.
 *
 * So with no key the provider is simply absent, and the payment module falls back to the
 * `pp_system_default` provider it always registers -- which authorises anything it is handed. That
 * is exactly right for a laptop, where the whole cart-to-order path needs exercising and no money
 * should move, and it is why the storefront asks the backend which providers a region has rather
 * than assuming one.
 */
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;

const paymentProviders = RAZORPAY_KEY_ID
  ? [
      {
        resolve: "./src/modules/razorpay",
        // Named once, in the module, because the storefront names `pp_razorpay_in` when it opens a
        // session and Razorpay's Dashboard is given `/hooks/payment/razorpay_in` -- three places
        // that have to agree on one string.
        id: RZP_PROVIDER_ID,
        options: {
          keyId: RAZORPAY_KEY_ID,
          keySecret: process.env.RAZORPAY_KEY_SECRET,
          webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
        },
      },
    ]
  : [];

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: required("DATABASE_URL"),
    redisUrl: REDIS_URL,
    workerMode: WORKER_MODE,
    http: {
      storeCors: required("STORE_CORS"),
      adminCors: required("ADMIN_CORS"),
      authCors: required("AUTH_CORS"),
      jwtSecret: required("JWT_SECRET"),
      cookieSecret: required("COOKIE_SECRET"),
    },
  },

  admin: {
    disable: WORKER_MODE === "worker",
  },

  modules: [
    // --- infrastructure -------------------------------------------------------------------
    // The in-memory defaults for these four are single-process only: a second instance gets its
    // own cache, misses every event the first one emits, and can run the same workflow step twice.
    {
      key: Modules.CACHE,
      resolve: "@medusajs/medusa/cache-redis",
      options: { redisUrl: REDIS_URL },
    },
    {
      key: Modules.EVENT_BUS,
      resolve: "@medusajs/medusa/event-bus-redis",
      options: { redisUrl: REDIS_URL },
    },
    {
      key: Modules.WORKFLOW_ENGINE,
      resolve: "@medusajs/medusa/workflow-engine-redis",
      // Note the extra `redis` nesting, which none of the other three use. It is not a mistake:
      // workflow-engine-redis/dist/loaders/redis.js:13 destructures `options.redis`, so a flat
      // `{ redisUrl }` here throws "Cannot destructure property 'url' of undefined" at boot. The
      // exported RedisWorkflowsOptions type describes the *inner* object only.
      options: { redis: { redisUrl: REDIS_URL } },
    },
    {
      key: Modules.LOCKING,
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/locking-redis",
            id: "locking-redis",
            is_default: true,
            options: { redisUrl: REDIS_URL },
          },
        ],
      },
    },

    // --- providers ------------------------------------------------------------------------
    { key: Modules.FILE, resolve: "@medusajs/medusa/file", options: { providers: [fileProvider] } },
    {
      key: Modules.AUTH,
      resolve: "@medusajs/medusa/auth",
      options: {
        providers: [{ resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass", options: {} }],
      },
    },
    {
      // Registered explicitly, and with an "email" channel, for a reason that is not obvious:
      // notification/dist/loaders/providers.js:30 checks whether any provider claims the email
      // channel, and if none does it tries to register Medusa Cloud's hosted email provider. This
      // project does not use Medusa Cloud. In development the local provider logs the notification
      // instead of sending it, which is the correct behaviour for a laptop.
      key: Modules.NOTIFICATION,
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/notification-local",
            id: "local",
            options: { channels: ["email"] },
          },
        ],
      },
    },
    {
      // Payments are captured, not merely authorised: this store ships physical goods within days
      // and never part-ships, so there is nothing to decide between the two, and every hour a
      // payment spends authorised is an hour Razorpay can auto-refund it out from under a packed
      // parcel. That is the provider's own default; see src/modules/razorpay/service.ts.
      key: Modules.PAYMENT,
      resolve: "@medusajs/medusa/payment",
      options: { providers: paymentProviders },
    },
    {
      // Indian GST has to arrive on the invoice under named heads -- CGST and SGST inside the
      // seller's state, IGST outside it -- and the built-in `system` provider cannot produce two
      // sibling lines for one rate. `india-gst` does only that split; the rates themselves are
      // tax_rate rows the seed creates from src/data/gst.json and the client edits in the admin.
      //
      // GST_ORIGIN_STATE is the place of supply. It is not wrapped in required(): it is a client
      // fact nobody here can invent, and taking the whole backend down over it would block every
      // other feature from being worked on. A *wrong* one is the dangerous case -- it matches no
      // destination, so every order in the country is taxed as inter-state and the invoices are
      // wrong in a way nobody notices -- so the provider checks it against the storefront's own
      // list of 36 at boot and refuses to start on a typo. An absent one is refused at checkout.
      key: Modules.TAX,
      resolve: "@medusajs/medusa/tax",
      options: {
        providers: [
          {
            resolve: "./src/modules/india-gst",
            // Named once, in the module, because the seed writes `tp_india-gst_${id}` onto the tax
            // region and the check asserts it -- three files that have to agree on one string.
            id: GST_PROVIDER_ID,
            options: { originState: process.env.GST_ORIGIN_STATE },
          },
        ],
      },
    },
    {
      // Shiprocket is the chosen carrier, but its integration is blocked on a client account.
      // Until then `manual` is what lets a shipping option exist at all -- without at least one
      // fulfilment provider a region has no shipping options and no cart can be completed.
      key: Modules.FULFILLMENT,
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [{ resolve: "@medusajs/medusa/fulfillment-manual", id: "manual", options: {} }],
      },
    },
  ],
});
