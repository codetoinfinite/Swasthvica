import "server-only";
import { storePost } from "@/lib/medusa";
import { TRACK_STATUS, type TrackedOrder, type TrackResult } from "@/lib/track-shape";

/* ------------------------------------------------------------------------------------------------
 * Asking the backend where a parcel is.
 *
 * The guest lane. A customer who checked out without an account holds two things -- the reference on
 * the confirmation screen and the address they typed -- and `POST /store/track` answers the one
 * question those two are enough to ask. It answers with a status and a courier and nothing else: no
 * address, no total, no email echoed back. See medusa/src/api/store/track/route.ts for why.
 *
 * Server-only for the same reason as every other file here: MEDUSA_PUBLISHABLE_KEY is deliberately
 * not NEXT_PUBLIC_-prefixed, so the browser has no way to reach Medusa and asks this origin instead.
 * The shapes and the wording live next door in src/lib/track-shape.ts, which the form imports; this
 * file is the half that may not cross into the browser.
 *
 * Every failure is translated into a sentence a customer can act on, and nothing throws: a page that
 * answers a worried customer with a stack trace has failed at the only job it has. Two of those
 * sentences are the same on purpose -- a wrong reference and a right reference with the wrong
 * address both come back "not found", because telling them apart would let somebody holding one
 * leaked reference walk a list of addresses until one of them stopped being a 404.
 * ---------------------------------------------------------------------------------------------- */

export { TRACK_STATUS };
export type { Shipment, TrackedOrder, TrackFailure, TrackResult } from "@/lib/track-shape";

const NOT_FOUND =
  "We could not find an order with that reference and e-mail address. Check both against your confirmation e-mail — the reference looks like SV260828-K4M2P.";

const UNAVAILABLE =
  "We could not reach the order system just now. Please try again in a moment, or write to us and we will look it up for you.";

/**
 * Look up one order.
 *
 * @param reference as printed on the confirmation screen; case is normalised by the backend.
 * @param email the address the order was placed with.
 */
export async function lookupOrder(reference: string, email: string): Promise<TrackResult> {
  let response: Response;
  try {
    response = await storePost("/store/track", { reference, email });
  } catch (error) {
    // An unset MEDUSA_URL, a refused connection, a DNS failure, or the eight-second timeout. All
    // four are the same thing to the person reading the page: no answer, come back shortly.
    console.error("[track] the order system could not be reached:", error);
    return { ok: false, code: "unavailable", reason: UNAVAILABLE };
  }

  if (response.ok) {
    const body = (await response.json().catch(() => null)) as { order?: TrackedOrder } | null;
    if (!body?.order) {
      console.error("[track] a 200 arrived without an order in it.");
      return { ok: false, code: "unavailable", reason: UNAVAILABLE };
    }
    return { ok: true, order: body.order };
  }

  if (response.status === 404) return { ok: false, code: "not-found", reason: NOT_FOUND };

  if (response.status === 429) {
    // Keyed on the reference, so this is nearly always somebody guessing at a reference rather than
    // the customer whose order it is. They are told the truth, and told when to come back.
    const seconds = retryAfterOf(response);
    const wait = seconds === null ? "a few minutes" : humanWait(seconds);
    return {
      ok: false,
      code: "throttled",
      reason: `That reference has been looked up too many times. Try again in ${wait}, or write to us and we will find it for you.`,
      ...(seconds === null ? {} : { retryAfter: seconds }),
    };
  }

  // 400 is the backend validator refusing the shape of the body. The form checks the same two
  // fields before it posts, so arriving here means the request did not come from the form.
  if (response.status === 400) {
    return {
      ok: false,
      code: "invalid",
      reason: "That does not look like an order reference and an e-mail address.",
    };
  }

  console.error(`[track] unexpected status ${response.status} from /store/track.`);
  return { ok: false, code: "unavailable", reason: UNAVAILABLE };
}

/**
 * `Retry-After` as a number of seconds, or `null`.
 *
 * RFC 9110 permits a date here as well as a delay, and this is the storefront's own backend sending
 * a delay -- but a header is still a header, so a value that is not a positive integer is treated as
 * absent rather than rendered as "try again in NaN minutes". The cap is a day: anything longer is a
 * misconfiguration, and quoting it back would be worse than saying nothing.
 */
function retryAfterOf(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw.trim());
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86_400) return null;
  return Math.ceil(seconds);
}

/** "90 seconds", "3 minutes" -- a wait a person can sit through, not a raw second count. */
function humanWait(seconds: number): string {
  if (seconds < 120) return `${seconds} seconds`;
  return `${Math.ceil(seconds / 60)} minutes`;
}
