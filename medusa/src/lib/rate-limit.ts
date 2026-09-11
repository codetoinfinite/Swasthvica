import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createHash } from "crypto";
import { limiterRedis } from "./redis";

/* ------------------------------------------------------------------------------------------------
 * Request limits.
 *
 * Medusa 2.19 ships none, and the endpoints that need them are the ones that answer a guess:
 * a password, an order reference, a transfer token. Without a limit those are not secrets, they
 * are puzzles with a known answer and unlimited attempts.
 *
 * Every rule is keyed on *the thing being guessed at* -- the email, the reference, the order id --
 * rather than only on the caller's address. That is not a stylistic preference, it follows from
 * how this storefront is deployed. `src/lib/medusa.ts` keeps MEDUSA_PUBLISHABLE_KEY off the
 * NEXT_PUBLIC_ prefix on purpose, so the browser never speaks to Medusa; every legitimate request
 * arrives from the Next.js server and therefore from one small set of addresses. An address-only
 * limit would be simultaneously useless (one attacker rotating IPs walks straight past it) and
 * dangerous (one busy afternoon locks out the entire storefront). An identity-keyed limit costs an
 * attacker the one thing they cannot rotate: the account they are trying to get into.
 *
 * The address rule is kept as a second, deliberately loose bucket. It exists for traffic that did
 * not come through the storefront -- somebody who found the API hostname and is hammering it
 * directly -- and its ceiling is set high enough that the storefront's own aggregate never reaches
 * it. See LIMITS in src/api/middlewares.ts for the numbers and the reasoning behind each.
 * ---------------------------------------------------------------------------------------------- */

export type RateRule = {
  /** Namespace for the counter. Two rules with the same bucket share a budget. */
  bucket: string;
  /** How many requests the window allows before the route starts answering 429. */
  limit: number;
  /** How long the window is. The counter is created on the first hit and expires with it. */
  windowSeconds: number;
  /**
   * What is being counted. Returning `null` skips the rule for this request, which is the right
   * answer when the field the rule counts on is absent -- a login with no email in the body is
   * about to be rejected by the validator anyway, and inventing a key for it would let an attacker
   * exhaust somebody else's budget by sending nonsense.
   */
  identify: (req: MedusaRequest) => string | null;
};

/**
 * Identities are hashed before they become keys.
 *
 * A rate-limit key lives in Redis, turns up in `MONITOR` output, in a `KEYS rl:*` during an
 * incident, and in whatever the Redis host's own logging does. None of those are places an
 * email address or an order reference belongs. Sixteen hex characters is 64 bits, which is far
 * past collision range for the number of distinct identities this store will ever see in a
 * fifteen-minute window, and short enough to keep the keyspace readable.
 */
function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/** A string field off the parsed body, trimmed, or `null` when it is missing or not a string. */
export function bodyString(req: MedusaRequest, field: string): string | null {
  const body = req.body as Record<string, unknown> | undefined;
  const value = body?.[field];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * An email as a counter key.
 *
 * Lower-cased so that `A@b.com` and `a@b.com` draw on one budget. That is not an opinion about
 * whether the local part is case sensitive -- by the RFC it may be -- it is the only safe reading
 * for a limiter, because treating them as separate identities would hand an attacker a fresh
 * budget for every capitalisation of the same address.
 */
export function emailKey(req: MedusaRequest, field: string): string | null {
  const value = bodyString(req, field);
  return value ? value.toLowerCase() : null;
}

/** The caller's address. Express resolves this through `trust proxy = 1`, set in express-loader. */
export function ipKey(req: MedusaRequest): string | null {
  return req.ip ?? null;
}

/** A route parameter as a counter key -- cart id, order id, whatever the matcher captured. */
export function paramKey(req: MedusaRequest, name: string): string | null {
  const value = req.params?.[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Turn a set of rules into a middleware.
 *
 * Every rule is evaluated, not just the first: the counters have to advance together or a request
 * refused by the identity rule would be free of charge against the address rule, which is how you
 * end up with an attacker enumerating one email per address at no cost. The first rule that is
 * over its limit decides the response, and the `Retry-After` it sends is that rule's remaining
 * window rather than a fixed guess, so a client that honours the header comes back exactly when
 * there is budget again.
 *
 * If Redis cannot answer, the request is allowed. A limiter is a control, not a dependency: the
 * alternative is a Redis blip taking checkout down, and Medusa's event bus and workflow engine are
 * already pointed at the same instance, so a Redis that is truly gone is not a situation this
 * middleware can improve.
 */
export function rateLimit(rules: RateRule[]) {
  return async function rateLimitMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction,
  ): Promise<void> {
    const redis = limiterRedis(req.scope);
    if (!redis) return next();

    let blockedRetryAfterMs = 0;

    try {
      for (const rule of rules) {
        const identity = rule.identify(req);
        if (identity === null) continue;

        const key = `${rule.bucket}:${digest(identity)}`;
        const [hits, ttlMs] = await redis.svRateHit(key, String(rule.windowSeconds * 1000));
        if (hits <= rule.limit) continue;

        // PTTL answers -1 for a key with no expiry and -2 for one that is gone. Neither should be
        // reachable through the script, but a limiter that trusted the number and sent
        // `Retry-After: -1` would be telling the client to retry immediately.
        const remaining = ttlMs > 0 ? ttlMs : rule.windowSeconds * 1000;
        blockedRetryAfterMs = Math.max(blockedRetryAfterMs, remaining);
      }
    } catch {
      // The client logs the connection failure once; a per-request line here would bury it.
      return next();
    }

    if (blockedRetryAfterMs === 0) return next();

    const retryAfter = Math.max(1, Math.ceil(blockedRetryAfterMs / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      type: "too_many_requests",
      message: `Too many requests. Try again in ${retryAfter} seconds.`,
    });
  };
}
