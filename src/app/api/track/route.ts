import { lookupOrder } from "@/lib/track";
import {
  EMAIL_MAX,
  EMAIL_SHAPE,
  REFERENCE_SHAPE,
  TRACK_STATUS,
  type TrackResult,
} from "@/lib/track-shape";

/**
 * POST /api/track -- where is my order.
 *
 * The browser's only door to the tracking lookup: MEDUSA_PUBLISHABLE_KEY never reaches the browser,
 * so the request is made from this side of the wire. The body it forwards is two short strings and
 * the answer it returns is a status and a courier -- see src/lib/track.ts.
 *
 * POST rather than GET because the body carries an e-mail address, and a query string ends up in
 * access logs, CDN logs, browser history and `Referer` headers.
 *
 * The shape checks below are the boundary, not the authority. The backend re-checks everything and
 * is the one that decides whether an order exists; what happens here is that rubbish is refused
 * before it costs a network round trip, and the lengths are capped so a megabyte of "reference"
 * cannot be forwarded anywhere.
 */

/** Longer than any reference; short enough that nothing worth forwarding is this size. */
const REFERENCE_MAX = 64;

/** A body larger than this is not a two-field form. Read before parse, so it costs nothing. */
const BODY_MAX = 2048;

const MALFORMED: TrackResult = {
  ok: false,
  code: "invalid",
  reason: "Enter the order reference and the e-mail address the order was placed with.",
};

export async function POST(request: Request) {
  // `content-length` is a claim, not a promise -- but a request that admits to being large can be
  // refused before it is read, and one that lies about it is still bounded by the platform's own
  // body limit. This is the cheap half of that pair.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > BODY_MAX) {
    return answer(MALFORMED);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return answer(MALFORMED);
  }

  const reference = field(body, "reference")?.toUpperCase();
  const email = field(body, "email");

  if (!reference || !email) return answer(MALFORMED);
  if (reference.length > REFERENCE_MAX || email.length > EMAIL_MAX) return answer(MALFORMED);

  if (!REFERENCE_SHAPE.test(reference)) {
    return answer({
      ok: false,
      code: "invalid",
      // Safe to say out loud: it depends on the shape of the string in front of them and on nothing
      // this shop knows. The two answers that *would* be an oracle -- no such reference, and right
      // reference wrong address -- are one identical "not found" and are decided by the backend.
      reason: "That is not an order reference. They look like SV260828-K4M2P.",
    });
  }
  if (!EMAIL_SHAPE.test(email)) {
    return answer({
      ok: false,
      code: "invalid",
      reason: "That does not look like an e-mail address.",
    });
  }

  try {
    return answer(await lookupOrder(reference, email));
  } catch (error) {
    // `lookupOrder` is written never to throw, so reaching here means a bug rather than a backend
    // that is down. It is still caught: an uncaught throw becomes a framework 500 with an HTML body,
    // and the browser on the other end of this is parsing JSON. A worried customer gets a sentence
    // either way, and the real cause goes to the server log where it can be acted on.
    console.error("[track] lookup threw", error);
    return answer({
      ok: false,
      code: "unavailable",
      reason:
        "We could not reach the order system just now. Try again in a few minutes, or write to us with your reference and we will look it up by hand.",
    });
  }
}

/**
 * One JSON body, and the status that goes with it.
 *
 * The statuses are passed through faithfully rather than flattened into 200s: a 429 that arrives as
 * a 200 is a 429 that no proxy, no browser and no monitor can act on. `Retry-After` is re-sent for
 * the same reason -- it is the one part of a refusal a client can automate against. `no-store`
 * because an order's status is per-customer and changes hourly; a CDN holding this for even a
 * minute would show one customer another's answer.
 */
function answer(result: TrackResult): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (!result.ok && result.retryAfter) headers["Retry-After"] = String(result.retryAfter);
  return Response.json(result, {
    status: result.ok ? 200 : TRACK_STATUS[result.code],
    headers,
  });
}

/** A trimmed non-empty string off the parsed body, or `null`. */
function field(body: unknown, name: string): string | null {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as Record<string, unknown>)[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
