import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { bodyString, emailKey, ipKey, paramKey, rateLimit, type RateRule } from "../rate-limit";
import { limiterRedis } from "../redis";

jest.mock("../redis", () => ({ limiterRedis: jest.fn() }));

const limiterRedisMock = limiterRedis as jest.MockedFunction<typeof limiterRedis>;

/* ------------------------------------------------------------------------------------------------
 * The limiter, exercised against a Redis whose clock this file owns.
 *
 * The fake below is not a stub that returns canned numbers -- it is a reimplementation of the Lua
 * in src/lib/redis.ts, INCR plus PEXPIRE-on-first-hit plus PTTL, with time as a variable instead of
 * something to wait for. That is what makes window expiry and the shared-counter property testable
 * in milliseconds rather than minutes, and it keeps the assertions about real behaviour rather than
 * about how many times a mock was called.
 * ---------------------------------------------------------------------------------------------- */

/** The same three commands the Lua script runs, against a map and a number. */
class FakeRedis {
  readonly store = new Map<string, { hits: number; expiresAt: number }>();
  readonly keysSeen: string[] = [];
  now = 0;

  async svRateHit(key: string, windowMs: string): Promise<[number, number]> {
    this.keysSeen.push(key);
    const entry = this.store.get(key);
    if (entry && entry.expiresAt > this.now) {
      entry.hits += 1;
      return [entry.hits, entry.expiresAt - this.now];
    }
    const fresh = { hits: 1, expiresAt: this.now + Number(windowMs) };
    this.store.set(key, fresh);
    return [1, Number(windowMs)];
  }

  /** Move the clock. Keys whose window has run out behave as if Redis had evicted them. */
  advance(ms: number): void {
    this.now += ms;
  }
}

type Captured = {
  next: jest.Mock;
  status: jest.Mock;
  json: jest.Mock;
  setHeader: jest.Mock;
  res: MedusaResponse;
};

function fakeResponse(): Captured {
  const status = jest.fn();
  const json = jest.fn();
  const setHeader = jest.fn();
  const res = { status, json, setHeader } as unknown as MedusaResponse;
  status.mockReturnValue(res);
  return { next: jest.fn(), status, json, setHeader, res };
}

function fakeRequest(init: Partial<MedusaRequest> = {}): MedusaRequest {
  return {
    ip: "203.0.113.9",
    body: {},
    params: {},
    scope: {} as MedusaRequest["scope"],
    ...init,
  } as MedusaRequest;
}

/** Run the middleware once and report what it did. */
async function run(
  middleware: ReturnType<typeof rateLimit>,
  req: MedusaRequest,
): Promise<Captured & { allowed: boolean }> {
  const captured = fakeResponse();
  await middleware(req, captured.res, captured.next as unknown as MedusaNextFunction);
  return { ...captured, allowed: captured.next.mock.calls.length > 0 };
}

const byIp = (bucket: string, limit: number, windowSeconds: number): RateRule => ({
  bucket,
  limit,
  windowSeconds,
  identify: ipKey,
});

describe("rateLimit", () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
    limiterRedisMock.mockReset();
    limiterRedisMock.mockReturnValue(redis as unknown as ReturnType<typeof limiterRedis>);
  });

  it("allows every request up to and including the limit", async () => {
    const middleware = rateLimit([byIp("test", 3, 60)]);
    for (let i = 0; i < 3; i++) {
      const result = await run(middleware, fakeRequest());
      expect(result.allowed).toBe(true);
      expect(result.status).not.toHaveBeenCalled();
    }
  });

  it("refuses the request after the limit, with the shape the storefront reads", async () => {
    const middleware = rateLimit([byIp("test", 2, 60)]);
    await run(middleware, fakeRequest());
    await run(middleware, fakeRequest());

    const result = await run(middleware, fakeRequest());
    expect(result.allowed).toBe(false);
    expect(result.status).toHaveBeenCalledWith(429);
    expect(result.json).toHaveBeenCalledWith({
      type: "too_many_requests",
      message: expect.stringContaining("Too many requests"),
    });
  });

  it("sends a Retry-After that shrinks as the window runs down", async () => {
    const middleware = rateLimit([byIp("test", 1, 60)]);
    await run(middleware, fakeRequest());

    const immediately = await run(middleware, fakeRequest());
    expect(immediately.setHeader).toHaveBeenCalledWith("Retry-After", "60");

    redis.advance(45_000);
    const later = await run(middleware, fakeRequest());
    expect(later.setHeader).toHaveBeenCalledWith("Retry-After", "15");
  });

  it("never sends Retry-After: 0, which would mean retry immediately", async () => {
    const middleware = rateLimit([byIp("test", 1, 60)]);
    await run(middleware, fakeRequest());
    // 1ms of window left rounds up to one second, not down to zero.
    redis.advance(59_999);
    const result = await run(middleware, fakeRequest());
    expect(result.setHeader).toHaveBeenCalledWith("Retry-After", "1");
  });

  it("falls back to the full window when PTTL answers -1 or -2", async () => {
    // Neither value should be reachable through the script -- the key is always created with an
    // expiry in the same atomic call -- but a limiter that trusted the number would emit
    // `Retry-After: -1`, so the clamp is asserted directly.
    for (const ttl of [-1, -2]) {
      const hostile = {
        svRateHit: jest.fn().mockResolvedValue([99, ttl]),
      } as unknown as ReturnType<typeof limiterRedis>;
      limiterRedisMock.mockReturnValue(hostile);

      const result = await run(rateLimit([byIp("test", 1, 90)]), fakeRequest());
      expect(result.allowed).toBe(false);
      expect(result.setHeader).toHaveBeenCalledWith("Retry-After", "90");
    }
  });

  it("lets the caller back in once the window expires", async () => {
    const middleware = rateLimit([byIp("test", 1, 60)]);
    expect((await run(middleware, fakeRequest())).allowed).toBe(true);
    expect((await run(middleware, fakeRequest())).allowed).toBe(false);

    redis.advance(60_001);
    const afterExpiry = await run(middleware, fakeRequest());
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.status).not.toHaveBeenCalled();
  });

  it("counts each identity separately", async () => {
    const middleware = rateLimit([byIp("test", 1, 60)]);
    await run(middleware, fakeRequest({ ip: "198.51.100.1" }));
    expect((await run(middleware, fakeRequest({ ip: "198.51.100.1" }))).allowed).toBe(false);
    expect((await run(middleware, fakeRequest({ ip: "198.51.100.2" }))).allowed).toBe(true);
  });

  it("skips a rule whose identity is absent instead of inventing one", async () => {
    // A shared key for "requests with no email" would let one attacker exhaust the budget of every
    // honest request that happens to be missing the field.
    const middleware = rateLimit([
      { bucket: "email", limit: 1, windowSeconds: 60, identify: (req) => emailKey(req, "email") },
    ]);
    for (let i = 0; i < 5; i++) {
      expect((await run(middleware, fakeRequest({ body: {} }))).allowed).toBe(true);
    }
    expect(redis.keysSeen).toHaveLength(0);
  });

  it("charges every rule even when an earlier one has already refused", async () => {
    // Otherwise a request refused by the identity rule is free against the address rule, and an
    // attacker enumerating one email per address never pays.
    const middleware = rateLimit([byIp("first", 1, 60), byIp("second", 100, 60)]);
    await run(middleware, fakeRequest());
    await run(middleware, fakeRequest());

    const second = [...redis.store.entries()].find(([key]) => key.startsWith("second:"));
    expect(second?.[1].hits).toBe(2);
  });

  it("reports the longest remaining window when more than one rule is over", async () => {
    const middleware = rateLimit([byIp("short", 1, 30), byIp("long", 1, 600)]);
    await run(middleware, fakeRequest());
    const result = await run(middleware, fakeRequest());
    expect(result.setHeader).toHaveBeenCalledWith("Retry-After", "600");
  });

  it("shares counters across middleware instances, which is what makes the limit a deployment property", async () => {
    // Two `rateLimit()` calls stand in for two ECS tasks behind one load balancer: adding capacity
    // must not multiply an attacker's budget.
    const taskA = rateLimit([byIp("test", 2, 60)]);
    const taskB = rateLimit([byIp("test", 2, 60)]);
    expect((await run(taskA, fakeRequest())).allowed).toBe(true);
    expect((await run(taskB, fakeRequest())).allowed).toBe(true);
    expect((await run(taskA, fakeRequest())).allowed).toBe(false);
    expect((await run(taskB, fakeRequest())).allowed).toBe(false);
  });

  it("keeps the identity out of the key", async () => {
    // Keys turn up in MONITOR, in `KEYS rl:*` during an incident, and in the Redis host's logs.
    const email = "customer@example.com";
    const middleware = rateLimit([
      { bucket: "login", limit: 5, windowSeconds: 60, identify: (req) => emailKey(req, "email") },
    ]);
    await run(middleware, fakeRequest({ body: { email } }));

    expect(redis.keysSeen).toHaveLength(1);
    expect(redis.keysSeen[0]).not.toContain(email);
    expect(redis.keysSeen[0]).not.toContain("customer");
    expect(redis.keysSeen[0]).toMatch(/^login:[0-9a-f]{16}$/);
  });

  it("allows the request when Redis is not configured", async () => {
    limiterRedisMock.mockReturnValue(null);
    const result = await run(rateLimit([byIp("test", 0, 60)]), fakeRequest());
    expect(result.allowed).toBe(true);
    expect(result.status).not.toHaveBeenCalled();
  });

  it("fails open when Redis throws", async () => {
    // A limiter is a control, not a dependency. A Redis blip must not take checkout down.
    limiterRedisMock.mockReturnValue({
      svRateHit: jest.fn().mockRejectedValue(new Error("Command timed out")),
    } as unknown as ReturnType<typeof limiterRedis>);

    const result = await run(rateLimit([byIp("test", 1, 60)]), fakeRequest());
    expect(result.allowed).toBe(true);
    expect(result.status).not.toHaveBeenCalled();
  });

  it("fails open mid-way through a rule set without answering twice", async () => {
    // The dangerous shape: rule one refuses, rule two throws. If the catch did not return, the
    // middleware would call next() *and* write a 429 onto the same response.
    let call = 0;
    limiterRedisMock.mockReturnValue({
      svRateHit: jest.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) return [99, 30_000];
        throw new Error("Connection is closed.");
      }),
    } as unknown as ReturnType<typeof limiterRedis>);

    const result = await run(rateLimit([byIp("a", 1, 60), byIp("b", 1, 60)]), fakeRequest());
    expect(result.allowed).toBe(true);
    expect(result.status).not.toHaveBeenCalled();
    expect(result.next).toHaveBeenCalledTimes(1);
  });

  it("does not let a request with no address consume the address budget", async () => {
    const middleware = rateLimit([byIp("test", 1, 60)]);
    for (let i = 0; i < 3; i++) {
      expect((await run(middleware, fakeRequest({ ip: undefined }))).allowed).toBe(true);
    }
    expect(redis.keysSeen).toHaveLength(0);
  });
});

describe("identity helpers", () => {
  it("reads a trimmed string off the body", () => {
    expect(bodyString(fakeRequest({ body: { email: "  a@b.com  " } }), "email")).toBe("a@b.com");
  });

  it("returns null for anything that is not a non-empty string", () => {
    // JSON bodies are attacker-controlled: a number, an object or an array must not become a key,
    // and `"   "` must not become the identity every whitespace-only request shares.
    for (const value of [undefined, null, 42, true, {}, [], "", "   "]) {
      expect(bodyString(fakeRequest({ body: { email: value } }), "email")).toBeNull();
    }
  });

  it("survives a request with no body at all", () => {
    expect(bodyString(fakeRequest({ body: undefined }), "email")).toBeNull();
  });

  it("lower-cases an email so capitalisation is not a fresh budget", () => {
    expect(emailKey(fakeRequest({ body: { email: " Customer@Example.COM " } }), "email")).toBe(
      "customer@example.com",
    );
  });

  it("reads the address Express resolved through trust proxy", () => {
    expect(ipKey(fakeRequest({ ip: "198.51.100.7" }))).toBe("198.51.100.7");
    expect(ipKey(fakeRequest({ ip: undefined }))).toBeNull();
  });

  it("reads a route parameter, and refuses an empty one", () => {
    expect(paramKey(fakeRequest({ params: { id: "cart_01" } }), "id")).toBe("cart_01");
    expect(paramKey(fakeRequest({ params: { id: "" } }), "id")).toBeNull();
    expect(paramKey(fakeRequest({ params: {} }), "id")).toBeNull();
  });
});
