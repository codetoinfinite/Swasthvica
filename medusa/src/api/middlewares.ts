import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { scrubbingErrorHandler } from "../lib/error-handler";
import { requireOrderOwner } from "../lib/order-access";
import { emailKey, ipKey, paramKey, rateLimit, type RateRule } from "../lib/rate-limit";

/* ------------------------------------------------------------------------------------------------
 * Where the security middleware is wired on.
 *
 * Two jobs live here. One is an ownership check on `GET /store/orders/:id`, which Medusa 2.19 ships
 * without authentication -- see src/lib/order-access.ts for the proof and the reasoning. The other
 * is a set of request limits on every route that answers a guess.
 *
 * On ordering: the framework registers this file's middleware before the route handlers it shares a
 * matcher with (router.js concatenates middlewares ahead of routes before sorting, and the sorter is
 * insertion-stable within a bucket), and it registers the body parser at "/" before any of it. So
 * `req.body` is populated for the limiter, and `req.auth_context` is already resolved by the store
 * auth middleware -- which runs with `allowUnauthenticated: true`, meaning it fills the context for
 * a valid token and waves everyone else through rather than rejecting them. That is exactly the
 * seam `requireOrderOwner` needs.
 *
 * Matchers are written out in full rather than as `/auth/:actor_type/:auth_provider`. The parameter
 * form also matches `POST /auth/token/refresh`, and putting a login-shaped limit on token refresh
 * would throttle the storefront's own session maintenance.
 * ---------------------------------------------------------------------------------------------- */

/**
 * The numbers, and why each one is what it is.
 *
 * Read these as a budget for an attacker, not as a cap on a customer. A person who mistypes their
 * password four times in a row still gets in; a script working through a password list does not
 * get enough attempts for the list to matter.
 *
 * The address rules are separate and deliberately loose. Because the storefront talks to Medusa
 * from the server (MEDUSA_PUBLISHABLE_KEY is not NEXT_PUBLIC_-prefixed), every customer request
 * shares one source address, so a tight address limit would throttle the shop rather than the
 * attacker. Their ceilings sit far above anything the storefront's own aggregate reaches; they are
 * there to blunt someone who found the API hostname and is hitting it directly.
 *
 * The exception is admin login. The admin dashboard runs in a browser and talks to Medusa directly,
 * so addresses there are real client addresses and the limit can be tight.
 */
const LIMITS = {
  /** A human retrying a password. Ten in a quarter hour is generous; a password list is not. */
  loginByEmail: { limit: 10, windowSeconds: 15 * 60 },
  /** Storefront aggregate. Reached only by traffic that is not the storefront. */
  loginByIp: { limit: 600, windowSeconds: 60 },
  /** Admin login comes from a real browser, so this address limit is a real defence. */
  adminLoginByIp: { limit: 20, windowSeconds: 15 * 60 },
  /** Sign-up is a once-ever act. Five an hour leaves room for a fumbled form, not for a bot. */
  registerByEmail: { limit: 5, windowSeconds: 60 * 60 },
  /** Each reset attempt sends mail to the address. Unlimited means the address gets flooded. */
  resetByIdentifier: { limit: 5, windowSeconds: 60 * 60 },
  /** A cart is completed once. The allowance is for a payment that had to be retried. */
  completeByCart: { limit: 10, windowSeconds: 10 * 60 },
  /** Order-transfer accept/decline take a token in the body; this is the brute-force ceiling. */
  transferByOrder: { limit: 10, windowSeconds: 60 * 60 },
  /** Tracking: the reference is the secret, so the reference carries the tighter budget. */
  trackByReference: { limit: 10, windowSeconds: 15 * 60 },
  /** A customer checking several orders from one address is normal; a sweep of one inbox is not. */
  trackByEmail: { limit: 30, windowSeconds: 15 * 60 },
  /** Unauthenticated and backed by a database query, so the flood ceiling is lower here. */
  trackByIp: { limit: 120, windowSeconds: 60 },
} as const;

/** Address rule builder. Every caller wants the same shape, only the bucket and numbers differ. */
function byIp(bucket: string, config: { limit: number; windowSeconds: number }): RateRule {
  return { bucket, ...config, identify: ipKey };
}

/** Body-field rule builder, lower-casing the value so capitalisation is not a fresh budget. */
function byEmail(
  bucket: string,
  field: string,
  config: { limit: number; windowSeconds: number },
): RateRule {
  return { bucket, ...config, identify: (req) => emailKey(req, field) };
}

/** Route-parameter rule builder -- cart id, order id. */
function byParam(
  bucket: string,
  name: string,
  config: { limit: number; windowSeconds: number },
): RateRule {
  return { bucket, ...config, identify: (req) => paramKey(req, name) };
}

/**
 * The tracking form's body.
 *
 * Length caps, not format checks. 254 is the maximum length of an email address the SMTP RFCs
 * permit, and anything longer is not an address that failed to validate, it is a payload. The
 * reference is checked against its real shape inside the route, where a bad one gets the same 404
 * as an unknown one -- a 400 here would tell a caller which of the two they had sent.
 */
const TrackRequest = z.object({
  reference: z.string().min(1).max(64),
  email: z.string().min(3).max(254),
});

export default defineMiddlewares({
  /**
   * Replaces the framework's error handler with one that scrubs the error first, then delegates to
   * it. Without this, a database error on a checkout INSERT writes the customer's address into the
   * log and quotes their e-mail back in the response body -- see src/lib/error-handler.ts.
   */
  errorHandler: scrubbingErrorHandler,

  routes: [
    /* ---- Ownership ------------------------------------------------------------------------- */
    {
      methods: ["GET"],
      matcher: "/store/orders/:id",
      middlewares: [requireOrderOwner],
    },

    /* ---- Customer authentication ----------------------------------------------------------- */
    {
      methods: ["POST"],
      matcher: "/auth/customer/emailpass",
      middlewares: [
        rateLimit([
          byEmail("login:email", "email", LIMITS.loginByEmail),
          byIp("login:ip", LIMITS.loginByIp),
        ]),
      ],
    },
    {
      methods: ["POST"],
      matcher: "/auth/customer/emailpass/register",
      middlewares: [
        rateLimit([
          byEmail("register:email", "email", LIMITS.registerByEmail),
          byIp("login:ip", LIMITS.loginByIp),
        ]),
      ],
    },
    {
      methods: ["POST"],
      matcher: "/auth/customer/emailpass/reset-password",
      middlewares: [
        rateLimit([
          byEmail("reset:identifier", "identifier", LIMITS.resetByIdentifier),
          byIp("login:ip", LIMITS.loginByIp),
        ]),
      ],
    },

    /* ---- Admin authentication -------------------------------------------------------------- */
    {
      methods: ["POST"],
      matcher: "/auth/user/emailpass",
      middlewares: [
        rateLimit([
          byEmail("admin-login:email", "email", LIMITS.loginByEmail),
          byIp("admin-login:ip", LIMITS.adminLoginByIp),
        ]),
      ],
    },
    {
      methods: ["POST"],
      matcher: "/auth/user/emailpass/reset-password",
      middlewares: [
        rateLimit([
          byEmail("admin-reset:identifier", "identifier", LIMITS.resetByIdentifier),
          byIp("admin-login:ip", LIMITS.adminLoginByIp),
        ]),
      ],
    },

    /* ---- Checkout -------------------------------------------------------------------------- */
    {
      methods: ["POST"],
      matcher: "/store/carts/:id/complete",
      middlewares: [rateLimit([byParam("complete:cart", "id", LIMITS.completeByCart)])],
    },

    /* ---- Order transfer -------------------------------------------------------------------- *
     * These two carry no authenticate middleware, but they are not open: the workflows behind them
     * compare the body's token against the one on the transfer request and throw "Invalid token."
     * when it does not match (core-flows accept-order-transfer.js). The token is the control; this
     * limit is what stops it being guessed at leisure. */
    {
      methods: ["POST"],
      matcher: "/store/orders/:id/transfer/accept",
      middlewares: [rateLimit([byParam("transfer:order", "id", LIMITS.transferByOrder)])],
    },
    {
      methods: ["POST"],
      matcher: "/store/orders/:id/transfer/decline",
      middlewares: [rateLimit([byParam("transfer:order", "id", LIMITS.transferByOrder)])],
    },

    /* ---- Guest order tracking -------------------------------------------------------------- *
     * The limiter runs before the validator on purpose: a malformed body still costs budget, so a
     * script cannot probe for free by sending rubbish. */
    {
      methods: ["POST"],
      matcher: "/store/track",
      middlewares: [
        rateLimit([
          {
            bucket: "track:reference",
            ...LIMITS.trackByReference,
            identify: (req) => {
              const body = req.body as { reference?: unknown } | undefined;
              return typeof body?.reference === "string" && body.reference.trim().length > 0
                ? body.reference.trim().toUpperCase()
                : null;
            },
          },
          byEmail("track:email", "email", LIMITS.trackByEmail),
          byIp("track:ip", LIMITS.trackByIp),
        ]),
        validateAndTransformBody(TrackRequest),
      ],
    },
  ],
});
