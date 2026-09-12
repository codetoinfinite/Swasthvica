import type { MiddlewareRoute } from "@medusajs/framework/http";
import config from "../middlewares";

/* ------------------------------------------------------------------------------------------------
 * The middleware table itself, read as data.
 *
 * Every other test in this suite proves that a control behaves correctly once it runs. This one
 * proves the control is wired to the route it was written for, which is the failure that leaves no
 * trace: a matcher typed one character wrong, or a verb left off, and the endpoint is open again
 * while every unit test still passes. The list below is therefore written out in full rather than
 * derived -- adding a sensitive route without a limit has to fail here.
 * ---------------------------------------------------------------------------------------------- */

const routes = config.routes as MiddlewareRoute[];

/** The entry guarding a matcher, or undefined. Matchers are unique per verb in this file. */
function entry(matcher: string, method = "POST"): MiddlewareRoute | undefined {
  return routes.find(
    (route) => route.matcher === matcher && route.methods?.includes(method as never),
  );
}

/** Every endpoint that answers a guess, and therefore must carry a limit. */
const GUESSABLE = [
  "/auth/customer/emailpass",
  "/auth/customer/emailpass/register",
  "/auth/customer/emailpass/reset-password",
  // Not guessable -- the token is a signed JWT -- but limited all the same: the route hashes an
  // unvalidated password with scrypt, so an unlimited one is a CPU tap rather than a way in.
  "/auth/customer/emailpass/update",
  "/auth/user/emailpass",
  "/auth/user/emailpass/reset-password",
  "/auth/user/emailpass/update",
  "/store/carts/:id/complete",
  "/store/orders/:id/transfer/accept",
  "/store/orders/:id/transfer/decline",
  "/store/track",
];

describe("middleware table", () => {
  it("guards every endpoint that answers a guess", () => {
    for (const matcher of GUESSABLE) {
      const route = entry(matcher);
      expect(route).toBeDefined();
      expect(route?.middlewares?.some((fn) => fn.name === "rateLimitMiddleware")).toBe(true);
    }
  });

  it("scopes every entry to explicit verbs", () => {
    // router.js #registerExpressHandler branches on this: an entry with no `methods` is registered
    // with `app.use`, which applies it to every verb on the matcher including OPTIONS preflight.
    // A limiter on OPTIONS would count a browser's own preflight against the customer's budget.
    for (const route of routes) {
      expect(Array.isArray(route.methods)).toBe(true);
      expect(route.methods?.length).toBeGreaterThan(0);
    }
  });

  it("uses `methods` rather than the deprecated `method`", () => {
    for (const route of routes) {
      expect(route).not.toHaveProperty("method");
    }
  });

  it("spells auth matchers out in full so session refresh is never throttled", () => {
    // `/auth/:actor_type/:auth_provider` -- the shape core uses -- also matches
    // POST /auth/token/refresh. Throttling that would log customers out mid-checkout while the
    // storefront was doing nothing more than maintaining its own session.
    const authMatchers = routes
      .map((route) => route.matcher)
      .filter((matcher): matcher is string => typeof matcher === "string")
      .filter((matcher) => matcher.startsWith("/auth/"));

    expect(authMatchers.length).toBeGreaterThan(0);
    for (const matcher of authMatchers) {
      expect(matcher).not.toContain(":");
      expect(matcher).not.toContain("*");
      expect(matcher).not.toBe("/auth/token/refresh");
    }
  });

  it("keeps the password out of every rate-limit key", () => {
    // A limiter keyed on a body field stores that field's value in Redis under a predictable key.
    // On the two routes that carry a password, the only admissible identity is the address.
    for (const matcher of ["/auth/customer/emailpass/update", "/auth/user/emailpass/update"]) {
      const route = entry(matcher);
      expect(route?.middlewares).toHaveLength(1);
      expect(route?.middlewares?.[0]?.name).toBe("rateLimitMiddleware");
    }
  });

  it("puts ownership in front of GET /store/orders/:id", () => {
    const route = entry("/store/orders/:id", "GET");
    expect(route).toBeDefined();
    expect(route?.middlewares?.map((fn) => fn.name)).toContain("requireOrderOwner");
  });

  it("charges the tracking limit before the body is validated", () => {
    // Deliberate ordering: a malformed body still costs budget. Reversed, an attacker gets
    // unlimited attempts by sending nonsense and reading the difference between 400 and 404.
    const route = entry("/store/track");
    const names = route?.middlewares?.map((fn) => fn.name) ?? [];
    expect(names[0]).toBe("rateLimitMiddleware");
    expect(names.length).toBeGreaterThan(1);
  });

  it("gives the tracking route a limiter and a validator and nothing else", () => {
    // The rules a limiter closes over are not reachable from the outside, so the count of keys is
    // asserted against the running route in integration-tests/http/track.spec.ts. What is checkable
    // here is the shape of the entry: two middlewares, in that order, no third one added by
    // accident.
    const route = entry("/store/track");
    expect(route?.middlewares).toHaveLength(2);
  });

  it("leaves no entry without a middleware to run", () => {
    for (const route of routes) {
      expect(route.middlewares?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("declares no duplicate verb-and-matcher pairs", () => {
    // Two entries on the same pair both register, and the second one's limits silently double the
    // first one's budget.
    const seen = new Set<string>();
    for (const route of routes) {
      for (const method of route.methods ?? []) {
        const key = `${method} ${String(route.matcher)}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });
});
