import type { ConfigModule, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { Redis } from "ioredis";

/* ------------------------------------------------------------------------------------------------
 * The counter store behind the rate limiter.
 *
 * Deliberately its own connection rather than the cache module's. `@medusajs/cache-redis` does
 * register an `ioredis` instance -- loaders/index.js:25 -- but into the *module's* container, not
 * the application's, so nothing outside that module can resolve it. Reaching for it would mean
 * depending on an internal that is free to move in a patch release, and a rate limiter that stops
 * working silently after an upgrade is worse than no rate limiter at all.
 *
 * One connection per process, shared by every request. `medusa-config.ts` already points four
 * modules at the same Redis; a fifth client is a rounding error next to them, and it is what lets
 * the limit be a property of the *deployment* rather than of a single container. Two ECS tasks
 * behind one load balancer share these counters, which is the whole point: scaling out adds
 * capacity without quietly multiplying the number of login attempts an attacker is allowed.
 * ---------------------------------------------------------------------------------------------- */

/**
 * Increment a counter and report how long the window it belongs to still has to run.
 *
 * The `if hits == 1` is why this is a script and not two commands. `INCR` followed by `PEXPIRE`
 * from the client leaves a window -- a crash, a network drop, a failover -- in which the key exists
 * with no expiry, and a rate-limit key with no expiry is a permanent lockout of whoever owns it.
 * Redis runs a script to completion with nothing interleaved, so either both happen or neither
 * does. `PTTL` is read inside the same script for the same reason: a separate round trip could
 * observe the key after it expired and report -2.
 */
const HIT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { hits, redis.call('PTTL', KEYS[1]) }
`;

/**
 * The client with the script attached.
 *
 * `defineCommand` registers it as a method that speaks EVALSHA and falls back to EVAL on NOSCRIPT,
 * so the script body crosses the wire once per Redis process rather than once per request. ioredis
 * generates that method at runtime and TypeScript cannot see it, hence the declared shape.
 */
export type LimiterRedis = Redis & {
  svRateHit(key: string, windowMs: string): Promise<[number, number]>;
};

let client: LimiterRedis | null = null;
let unavailableLogged = false;

/**
 * The Redis the limiter counts in, or `null` when there is none configured.
 *
 * Reads the URL out of the loaded config rather than the environment so that the limiter always
 * lands in the same Redis as the session store and the event bus -- one place to look, one place
 * to flush. `redisOptions` is spread first so a deployment that needs TLS material or a username
 * gets it, and the four options after it are not negotiable: the limiter must fail fast. A hung
 * Redis command in front of `/auth` would turn a cache blip into a site-wide login outage, which
 * is a far worse failure than briefly not counting.
 */
export function limiterRedis(scope: MedusaContainer): LimiterRedis | null {
  if (client) return client;

  const config = scope.resolve<ConfigModule>(ContainerRegistrationKeys.CONFIG_MODULE);
  const url = config.projectConfig.redisUrl;
  if (!url) {
    if (!unavailableLogged) {
      unavailableLogged = true;
      scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn("[rate-limit] no redisUrl configured; request limits are not being enforced.");
    }
    return null;
  }

  const redis = new Redis(url, {
    ...(config.projectConfig.redisOptions ?? {}),
    keyPrefix: `${config.projectConfig.redisPrefix ?? ""}rl:`,
    // Two retries and a quarter-second ceiling: long enough to ride out a reconnect, short enough
    // that a dead Redis costs every request 500ms rather than the default twenty attempts.
    maxRetriesPerRequest: 2,
    commandTimeout: 250,
    connectTimeout: 2000,
    // Nothing is written here that is worth replaying after an outage -- a counter that missed its
    // increment is already wrong -- so queued commands would only delay the fail-open decision.
    enableOfflineQueue: false,
  }) as LimiterRedis;

  // ioredis reconnects on its own; without a listener the error event is unhandled and takes the
  // process down, which is exactly the outage this module is meant not to cause.
  redis.on("error", (error: Error) => {
    if (unavailableLogged) return;
    unavailableLogged = true;
    scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(`[rate-limit] redis unavailable, failing open: ${error.message}`);
  });
  redis.on("ready", () => {
    unavailableLogged = false;
  });

  redis.defineCommand("svRateHit", { numberOfKeys: 1, lua: HIT_SCRIPT });
  client = redis;
  return client;
}

/** Test seam: drops the memoised client so a suite can point the limiter at a different Redis. */
export function resetLimiterRedis(): void {
  client?.disconnect();
  client = null;
  unavailableLogged = false;
}
