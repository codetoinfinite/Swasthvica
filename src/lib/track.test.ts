import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------------------------------------------
 * What the storefront does with each answer the backend can give.
 *
 * `storePost` is the only thing mocked. Everything below it -- the status mapping, the Retry-After
 * parsing, the wording -- is the real code, because that is where the bugs would be. The cases are
 * drawn from what medusa/src/api/store/track/route.ts and the rate limiter can actually return:
 * 200, 400 from the body validator, 404 for both "no such reference" and "wrong address", 429 with
 * a Retry-After, and the network failing outright.
 * ---------------------------------------------------------------------------------------------- */

const storePost = vi.hoisted(() => vi.fn());
vi.mock("@/lib/medusa", () => ({ storePost }));

const { lookupOrder } = await import("./track");

const ORDER = {
  reference: "SV260828-K4M2P",
  placedAt: "2026-08-28T09:15:00.000Z",
  status: "pending",
  paymentStatus: "captured",
  fulfillmentStatus: "not_fulfilled",
  itemCount: 2,
  shipments: [],
};

/** A Response with a body and whatever headers the case is about. */
function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  storePost.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("lookupOrder — the order was found", () => {
  it("hands the order back untouched", async () => {
    storePost.mockResolvedValue(reply(200, { order: ORDER }));
    const result = await lookupOrder("SV260828-K4M2P", "a@b.co");
    expect(result).toEqual({ ok: true, order: ORDER });
  });

  it("asks the backend on the tracking path, with both fields", async () => {
    storePost.mockResolvedValue(reply(200, { order: ORDER }));
    await lookupOrder("SV260828-K4M2P", "a@b.co");
    expect(storePost).toHaveBeenCalledWith("/store/track", {
      reference: "SV260828-K4M2P",
      email: "a@b.co",
    });
  });

  it("treats a 200 with no order in it as the backend being broken, not as a miss", async () => {
    // A 404 would tell the customer their reference is wrong. It is not -- something upstream is.
    storePost.mockResolvedValue(reply(200, { order: null }));
    const result = await lookupOrder("SV260828-K4M2P", "a@b.co");
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("survives a 200 whose body is not JSON at all", async () => {
    storePost.mockResolvedValue(new Response("<html>gateway</html>", { status: 200 }));
    const result = await lookupOrder("SV260828-K4M2P", "a@b.co");
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
  });
});

describe("lookupOrder — the order was not found", () => {
  it("gives the same answer to a wrong reference and a wrong address", async () => {
    storePost.mockResolvedValue(reply(404, { message: "No order matches that reference." }));
    const first = await lookupOrder("SV260828-K4M2P", "a@b.co");
    const second = await lookupOrder("SV260828-K4M2P", "someone-else@b.co");
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: false, code: "not-found" });
  });

  it("says what to check rather than what went wrong", async () => {
    storePost.mockResolvedValue(reply(404, {}));
    const result = await lookupOrder("SV260828-K4M2P", "a@b.co");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/confirmation e-mail/);
    expect(result.reason).toMatch(/SV260828-K4M2P/);
  });

  it("never echoes the address back", async () => {
    storePost.mockResolvedValue(reply(404, {}));
    const result = await lookupOrder("SV260828-K4M2P", "private@example.com");
    expect(JSON.stringify(result)).not.toContain("private@example.com");
  });
});

describe("lookupOrder — throttled", () => {
  it("passes the wait through in seconds when it is short", async () => {
    storePost.mockResolvedValue(reply(429, {}, { "retry-after": "90" }));
    const result = await lookupOrder("SV260828-K4M2P", "a@b.co");
    expect(result).toMatchObject({ ok: false, code: "throttled", retryAfter: 90 });
    if (result.ok) return;
    expect(result.reason).toMatch(/90 seconds/);
  });

  it("rounds a long wait into minutes a person can sit through", async () => {
    storePost.mockResolvedValue(reply(429, {}, { "retry-after": "900" }));
    const result = await lookupOrder("SV260828-K4M2P", "a@b.co");
    expect(result).toMatchObject({ retryAfter: 900 });
    if (result.ok) return;
    expect(result.reason).toMatch(/15 minutes/);
  });

  it("rounds a fractional delay up rather than down", async () => {
    // Coming back a second early is coming back to another 429.
    storePost.mockResolvedValue(reply(429, {}, { "retry-after": "90.2" }));
    const result = await lookupOrder("SV260828-K4M2P", "a@b.co");
    expect(result).toMatchObject({ retryAfter: 91 });
  });

  it("says 'a few minutes' rather than NaN when the header is missing or rubbish", async () => {
    for (const header of [undefined, "", "soon", "Wed, 21 Oct 2026 07:28:00 GMT", "-5", "0"]) {
      storePost.mockResolvedValue(
        reply(429, {}, header === undefined ? {} : { "retry-after": header }),
      );
      const result = await lookupOrder("SV260828-K4M2P", "a@b.co");
      expect(result, String(header)).toMatchObject({ code: "throttled" });
      if (result.ok) return;
      expect(result.reason, String(header)).toMatch(/a few minutes/);
      expect(result.retryAfter, String(header)).toBeUndefined();
    }
  });

  it("ignores a delay longer than a day, which is a misconfiguration rather than a wait", async () => {
    storePost.mockResolvedValue(reply(429, {}, { "retry-after": "999999" }));
    const result = await lookupOrder("SV260828-K4M2P", "a@b.co");
    expect(result).toMatchObject({ code: "throttled" });
    if (result.ok) return;
    expect(result.retryAfter).toBeUndefined();
  });

  it("accepts a delay padded with whitespace", async () => {
    storePost.mockResolvedValue(reply(429, {}, { "retry-after": "  120  " }));
    expect(await lookupOrder("SV260828-K4M2P", "a@b.co")).toMatchObject({ retryAfter: 120 });
  });
});

describe("lookupOrder — refused or unreachable", () => {
  it("reports a 400 as a malformed request rather than a missing order", async () => {
    storePost.mockResolvedValue(reply(400, { message: "Invalid request body" }));
    expect(await lookupOrder("SV260828-K4M2P", "a@b.co")).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("treats every other status as the order system being down", async () => {
    for (const status of [401, 403, 500, 502, 503, 504]) {
      storePost.mockResolvedValue(reply(status, {}));
      expect(await lookupOrder("SV260828-K4M2P", "a@b.co"), String(status)).toMatchObject({
        code: "unavailable",
      });
    }
  });

  it("does not throw when the connection is refused", async () => {
    storePost.mockRejectedValue(new TypeError("fetch failed"));
    expect(await lookupOrder("SV260828-K4M2P", "a@b.co")).toMatchObject({ code: "unavailable" });
  });

  it("does not throw when the request times out", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    storePost.mockRejectedValue(timeout);
    expect(await lookupOrder("SV260828-K4M2P", "a@b.co")).toMatchObject({ code: "unavailable" });
  });

  it("does not throw when MEDUSA_URL is unset, which is what storePost does then", async () => {
    storePost.mockImplementation(() => {
      throw new Error("MEDUSA_URL and MEDUSA_PUBLISHABLE_KEY must both be set.");
    });
    expect(await lookupOrder("SV260828-K4M2P", "a@b.co")).toMatchObject({ code: "unavailable" });
  });

  it("never puts the internal failure in front of the customer", async () => {
    storePost.mockRejectedValue(new Error("ECONNREFUSED 10.0.3.14:9000"));
    const result = await lookupOrder("SV260828-K4M2P", "a@b.co");
    if (result.ok) return;
    expect(result.reason).not.toMatch(/ECONNREFUSED|10\.0\.3\.14/);
  });
});
