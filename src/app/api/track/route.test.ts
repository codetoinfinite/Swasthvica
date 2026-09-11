import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackResult } from "@/lib/track-shape";

/* ------------------------------------------------------------------------------------------------
 * The boundary between the browser and the tracking lookup.
 *
 * `lookupOrder` is mocked, so what is under test is only the part this route is responsible for:
 * what it refuses before spending a network round trip, what it never forwards, and whether the
 * answer it builds is one a browser, a proxy and a monitor can all act on.
 *
 * The refusals matter more than the successes. This route is reachable by anyone, takes a JSON body,
 * and sits in front of a database query -- so a body that is not JSON, a field that is not a string,
 * a megabyte of "reference" and a reference shaped like an injection all have to die here rather
 * than downstream.
 * ---------------------------------------------------------------------------------------------- */

const lookupOrder = vi.hoisted(() => vi.fn());
vi.mock("@/lib/track", () => ({ lookupOrder }));

const { POST } = await import("./route");

const FOUND: TrackResult = {
  ok: true,
  order: {
    reference: "SV260828-K4M2P",
    placedAt: "2026-08-28T09:15:00.000Z",
    status: "pending",
    paymentStatus: "captured",
    fulfillmentStatus: "not_fulfilled",
    itemCount: 2,
    shipments: [],
  },
};

/** A request as the browser's `fetch` would build it. */
function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://swasthvica.test/api/track", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function send(body: unknown, headers?: Record<string, string>) {
  const response = await POST(post(body, headers));
  return { response, body: (await response.json()) as TrackResult };
}

beforeEach(() => {
  lookupOrder.mockReset();
  lookupOrder.mockResolvedValue(FOUND);
});

describe("POST /api/track — what never reaches the lookup", () => {
  it("refuses a body that is not JSON", async () => {
    const { response, body } = await send("this is not json");
    expect(response.status).toBe(400);
    expect(body).toMatchObject({ ok: false, code: "invalid" });
    expect(lookupOrder).not.toHaveBeenCalled();
  });

  it("refuses an empty body", async () => {
    const { response } = await send("");
    expect(response.status).toBe(400);
    expect(lookupOrder).not.toHaveBeenCalled();
  });

  it("refuses a body that parses to something that is not an object", async () => {
    for (const raw of ["null", "42", '"SV260828-K4M2P"', "[]", "true"]) {
      lookupOrder.mockClear();
      const { response } = await send(raw);
      expect(response.status, raw).toBe(400);
      expect(lookupOrder, raw).not.toHaveBeenCalled();
    }
  });

  it("refuses a missing field", async () => {
    for (const body of [{}, { reference: "SV260828-K4M2P" }, { email: "a@b.co" }]) {
      lookupOrder.mockClear();
      const { response } = await send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(lookupOrder).not.toHaveBeenCalled();
    }
  });

  it("refuses a field that is whitespace, which is how an empty form arrives", async () => {
    const { response } = await send({ reference: "   ", email: "\t\n " });
    expect(response.status).toBe(400);
    expect(lookupOrder).not.toHaveBeenCalled();
  });

  it("refuses a field that is the right name but the wrong type", async () => {
    // JSON can carry anything. `reference.toUpperCase()` on a number would be a 500.
    for (const value of [42, true, null, ["SV260828-K4M2P"], { toUpperCase: "no" }]) {
      lookupOrder.mockClear();
      const { response } = await send({ reference: value, email: "a@b.co" });
      expect(response.status, JSON.stringify(value)).toBe(400);
      const second = await send({ reference: "SV260828-K4M2P", email: value });
      expect(second.response.status, JSON.stringify(value)).toBe(400);
      expect(lookupOrder).not.toHaveBeenCalled();
    }
  });

  it("refuses a reference longer than any reference can be", async () => {
    const { response } = await send({ reference: "S".repeat(65), email: "a@b.co" });
    expect(response.status).toBe(400);
    expect(lookupOrder).not.toHaveBeenCalled();
  });

  it("refuses an address past the RFC 5321 ceiling", async () => {
    const email = `${"a".repeat(250)}@b.co`;
    expect(email.length).toBeGreaterThan(254);
    const { response } = await send({ reference: "SV260828-K4M2P", email });
    expect(response.status).toBe(400);
    expect(lookupOrder).not.toHaveBeenCalled();
  });

  it("refuses a body that declares itself larger than a two-field form", async () => {
    const { response } = await send(
      { reference: "SV260828-K4M2P", email: "a@b.co" },
      { "content-length": "1048576" },
    );
    expect(response.status).toBe(400);
    expect(lookupOrder).not.toHaveBeenCalled();
  });

  it("does not trip over a content-length that is absent or nonsense", async () => {
    for (const header of ["", "  ", "not-a-number", "-1"]) {
      lookupOrder.mockClear();
      const { response } = await send(
        { reference: "SV260828-K4M2P", email: "a@b.co" },
        { "content-length": header },
      );
      expect(response.status, header).toBe(200);
      expect(lookupOrder, header).toHaveBeenCalledOnce();
    }
  });

  it("refuses a reference that cannot be one, without asking the backend", async () => {
    const wrong = [
      "SV260828K4M2P", // no separator
      "SV26082-K4M2P", // five date digits
      "SV260828-K4M2", // four characters
      "SV260828-K4M2PP", // six
      "SV260828-K4I2P", // I, L, O and U are not in the alphabet
      "SV260828-K4L2P",
      "SV260828-K4O2P",
      "SV260828-K4U2P",
      "SV260828–K4M2P", // en-dash, which is what a word processor does to a hyphen
      "XX260828-K4M2P",
      "SV260828-K4M2P extra",
      "SV260828-K4M2P\nDROP TABLE orders",
      "%@%",
      "SV260828-K4M2P'; --",
    ];
    for (const reference of wrong) {
      lookupOrder.mockClear();
      const { response, body } = await send({ reference, email: "a@b.co" });
      expect(response.status, reference).toBe(400);
      expect(body, reference).toMatchObject({ code: "invalid" });
      expect(lookupOrder, reference).not.toHaveBeenCalled();
    }
  });

  it("refuses an address that cannot be one", async () => {
    for (const email of ["a@b", "a b@c.co", "@b.co", "a@.co", "a.co", "a@b.c", "a@b c.co"]) {
      lookupOrder.mockClear();
      const { response, body } = await send({ reference: "SV260828-K4M2P", email });
      expect(response.status, email).toBe(400);
      expect(body, email).toMatchObject({ code: "invalid" });
      expect(lookupOrder, email).not.toHaveBeenCalled();
    }
  });

  it("never puts the address the caller sent into the refusal it sends back", async () => {
    const { body } = await send({ reference: "SV260828-K4M2P", email: "victim@example.com" });
    expect(JSON.stringify(body)).not.toContain("victim@example.com");
  });

  it("does not tell a caller which of the two fields was the known one", async () => {
    // Both of these are shape failures decided here. The two answers that would be an oracle --
    // unknown reference, and known reference with the wrong address -- are one identical 404 from
    // the backend and are never decided in this file.
    const bad = await send({ reference: "NOPE", email: "a@b.co" });
    expect(bad.body).toMatchObject({ code: "invalid" });
    expect(JSON.stringify(bad.body)).not.toMatch(/exist|unknown|no such|found/i);
  });
});

describe("POST /api/track — what reaches the lookup", () => {
  it("upper-cases the reference before it is judged or forwarded", async () => {
    const { response } = await send({ reference: "sv260828-k4m2p", email: "a@b.co" });
    expect(response.status).toBe(200);
    expect(lookupOrder).toHaveBeenCalledWith("SV260828-K4M2P", "a@b.co");
  });

  it("trims both fields, which is what a paste from an e-mail leaves behind", async () => {
    await send({ reference: "  SV260828-K4M2P  ", email: "  a@b.co  " });
    expect(lookupOrder).toHaveBeenCalledWith("SV260828-K4M2P", "a@b.co");
  });

  it("forwards the address as typed rather than lower-cased", async () => {
    // The backend matches it with $ilike; folding case here would be a second opinion about an
    // address whose local part the RFC says may be case sensitive.
    await send({ reference: "SV260828-K4M2P", email: "A.Person@B.co" });
    expect(lookupOrder).toHaveBeenCalledWith("SV260828-K4M2P", "A.Person@B.co");
  });

  it("forwards nothing else off the body", async () => {
    await send({
      reference: "SV260828-K4M2P",
      email: "a@b.co",
      fields: ["*"],
      limit: 1000,
      customer_id: "cus_1",
    });
    expect(lookupOrder).toHaveBeenCalledWith("SV260828-K4M2P", "a@b.co");
    expect(lookupOrder).toHaveBeenCalledOnce();
  });

  it("asks once per request", async () => {
    await send({ reference: "SV260828-K4M2P", email: "a@b.co" });
    expect(lookupOrder).toHaveBeenCalledOnce();
  });
});

describe("POST /api/track — the answer", () => {
  it("passes a found order straight through", async () => {
    const { response, body } = await send({ reference: "SV260828-K4M2P", email: "a@b.co" });
    expect(response.status).toBe(200);
    expect(body).toEqual(FOUND);
  });

  it("gives each outcome the status that goes with it", async () => {
    const cases = [
      ["not-found", 404],
      ["invalid", 400],
      ["throttled", 429],
      ["unavailable", 503],
    ] as const;
    for (const [code, status] of cases) {
      lookupOrder.mockResolvedValue({ ok: false, code, reason: "..." });
      const { response } = await send({ reference: "SV260828-K4M2P", email: "a@b.co" });
      expect(response.status, code).toBe(status);
    }
  });

  it("re-sends Retry-After, which is the one part of a refusal a client can automate against", async () => {
    lookupOrder.mockResolvedValue({ ok: false, code: "throttled", reason: "...", retryAfter: 900 });
    const { response } = await send({ reference: "SV260828-K4M2P", email: "a@b.co" });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("900");
  });

  it("omits Retry-After when the backend did not say how long", async () => {
    lookupOrder.mockResolvedValue({ ok: false, code: "throttled", reason: "..." });
    const { response } = await send({ reference: "SV260828-K4M2P", email: "a@b.co" });
    expect(response.headers.get("retry-after")).toBeNull();
  });

  it("never sends Retry-After on an outcome that is not a wait", async () => {
    lookupOrder.mockResolvedValue({ ok: false, code: "not-found", reason: "..." });
    const { response } = await send({ reference: "SV260828-K4M2P", email: "a@b.co" });
    expect(response.headers.get("retry-after")).toBeNull();
  });

  it("marks every answer no-store, including the refusals decided here", async () => {
    const bodies = [
      { reference: "SV260828-K4M2P", email: "a@b.co" },
      { reference: "NOPE", email: "a@b.co" },
      {},
    ];
    for (const body of bodies) {
      const { response } = await send(body);
      expect(response.headers.get("cache-control"), JSON.stringify(body)).toBe("no-store");
    }
  });

  it("answers JSON even when it is refusing", async () => {
    const { response } = await send("not json");
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("answers a sentence rather than a stack trace when the lookup itself throws", async () => {
    // lookupOrder is written never to throw, so this is the bug case. It still has to come back as
    // JSON: an uncaught throw is a framework 500 with an HTML body, and the caller parses JSON.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    lookupOrder.mockRejectedValue(new Error("boom at 10.0.3.14:9000"));
    const { response, oneBody } = await (async () => {
      const r = await POST(post({ reference: "SV260828-K4M2P", email: "a@b.co" }));
      return { response: r, oneBody: (await r.json()) as TrackResult };
    })();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(oneBody).toMatchObject({ ok: false, code: "unavailable" });
    expect(JSON.stringify(oneBody)).not.toMatch(/boom|10\.0\.3\.14/);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it("does not swallow a synchronous throw either", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    lookupOrder.mockImplementation(() => {
      throw new Error("sync boom");
    });
    const response = await POST(post({ reference: "SV260828-K4M2P", email: "a@b.co" }));
    expect(response.status).toBe(503);
    logged.mockRestore();
  });
});
