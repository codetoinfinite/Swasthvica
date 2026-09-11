/* ------------------------------------------------------------------------------------------------
 * What a tracking answer looks like, on both sides of the wire.
 *
 * Separate from src/lib/track.ts because that file is `import "server-only"` -- it holds the
 * publishable key and the call to Medusa -- while the form that renders the answer runs in the
 * browser. Types alone would be erased at build time and could have stayed there, but `stageOf`
 * is real code the client executes, and a shared module is the honest place for it.
 *
 * Nothing here reaches the network or reads an environment variable. It is the vocabulary, the
 * status-to-HTTP map, and the one function that turns three machine statuses into a sentence.
 * ---------------------------------------------------------------------------------------------- */

/** One despatch. An order ships in a single parcel here, but the backend does not promise that. */
export type Shipment = {
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
};

/** Everything the tracking page is allowed to know. Deliberately small. */
export type TrackedOrder = {
  reference: string;
  placedAt: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  itemCount: number;
  shipments: Shipment[];
};

export type TrackFailure = {
  ok: false;
  /** What the caller should do about it, not what went wrong inside. */
  code: "not-found" | "invalid" | "throttled" | "unavailable";
  reason: string;
  /** Seconds. Present on `throttled` only, and only when the backend said how long. */
  retryAfter?: number;
};

export type TrackResult = { ok: true; order: TrackedOrder } | TrackFailure;

/** The HTTP status the API route should answer with for each outcome. */
export const TRACK_STATUS: Record<TrackFailure["code"], number> = {
  invalid: 400,
  "not-found": 404,
  throttled: 429,
  unavailable: 503,
};

/**
 * `SV` + YYMMDD + five characters of Crockford base32 -- the digits and letters less I, L, O and U,
 * which are the four that get misread when a reference is copied off a screen or read down a phone.
 * Same expression as the backend's ORDER_REFERENCE (medusa/src/lib/track.ts).
 */
export const REFERENCE_SHAPE = /^SV\d{6}-[0-9A-HJKMNP-TV-Z]{5}$/;

/** Deliberately permissive. The address is matched against the one on the order, not parsed. */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The RFC 5321 ceiling on an address. Anything longer is a payload, not a typo. */
export const EMAIL_MAX = 254;

export type Stage = { headline: string; detail: string };

/**
 * The three status fields, as one sentence.
 *
 * Medusa reports payment and fulfilment separately and either can be mid-way, so what follows is a
 * precedence list rather than a lookup: cancelled beats everything, then money that has come back,
 * then where the parcel is, then where the money is. Every string matched below is one the backend
 * can actually produce -- `OrderStatus` from @medusajs/utils/dist/order/status.js, and the returns
 * of `getLastPaymentStatus` / `getLastFulfillmentStatus` in
 * @medusajs/core-flows/dist/order/utils/aggregate-status.js. None of them is invented, and the
 * fallback at the bottom is for a Medusa that adds one.
 *
 * Refunds are read before fulfilment on purpose. A parcel that shipped and then came back is a
 * refund as far as the customer is concerned; telling them it is "on its way" would be false.
 */
export function stageOf(order: TrackedOrder): Stage {
  const { status, paymentStatus: paid, fulfillmentStatus: sent } = order;

  if (status === "canceled" || sent === "canceled") {
    return {
      headline: "Cancelled",
      detail:
        paid === "refunded" || paid === "partially_refunded"
          ? "This order was cancelled and the money has been sent back. It reaches your account in a few working days."
          : "This order was cancelled. If you were charged for it, write to us and we will settle it the same day.",
    };
  }

  if (paid === "refunded") {
    return {
      headline: "Refunded",
      detail: "The money has gone back the way it came. Banks take a few working days to show it.",
    };
  }
  if (paid === "partially_refunded") {
    return {
      headline: "Partly refunded",
      detail: "Part of this order has been refunded. The rest of it is unaffected.",
    };
  }

  if (sent === "delivered") {
    return { headline: "Delivered", detail: "The courier has recorded this as handed over." };
  }
  if (sent === "partially_delivered") {
    return {
      headline: "Part delivered",
      detail: "One parcel has arrived and the rest is still with the courier.",
    };
  }
  if (sent === "shipped" || sent === "partially_shipped") {
    return {
      headline: "On its way",
      detail:
        "It is with the courier. Any tracking number below is theirs, and it can be a few hours after despatch before their site shows anything against it.",
    };
  }
  if (sent === "fulfilled" || sent === "partially_fulfilled") {
    return {
      headline: "Packed",
      detail: "It is boxed and waiting for the courier's next collection.",
    };
  }

  if (paid === "requires_action") {
    return {
      headline: "Waiting on your payment",
      detail:
        "Your bank is waiting for a step from you, usually a confirmation in their app. Nothing is packed until that clears.",
    };
  }
  if (paid === "not_paid" || paid === "awaiting" || paid === "canceled") {
    return {
      headline: "Payment not confirmed",
      detail:
        "We have not seen a completed payment against this order. If your bank shows the money gone, write to us with the reference and we will match it up.",
    };
  }
  // Order-level `requires_action` is not the same fact as payment-level `requires_action`: Medusa
  // sets it whenever an order needs a hand, an edit awaiting confirmation included. So it is read
  // after the payment states, which are concrete enough to act on, and before "being packed",
  // which would be a promise this order is not yet in a position to keep.
  if (status === "requires_action") {
    return {
      headline: "Needs a step before it moves",
      detail:
        "This order is waiting on a confirmation before it can be packed. If nothing has reached you about it, write to us with the reference and we will tell you what it is waiting for.",
    };
  }

  if (
    paid === "captured" ||
    paid === "partially_captured" ||
    paid === "authorized" ||
    paid === "partially_authorized"
  ) {
    return {
      headline: "Paid, being packed",
      detail: "Payment is confirmed. The bottles are being packed and a tracking number follows.",
    };
  }

  return {
    headline: "Being prepared",
    detail: "This order is with us. Write to us with the reference if you need it sooner.",
  };
}

/**
 * A courier link, if it is one.
 *
 * The URL is whatever the fulfilment provider wrote on the label, so it is checked before it
 * becomes an `href`: only http and https, which is what keeps `javascript:` and `data:` out of the
 * DOM if that field is ever wrong or hostile.
 */
export function courierLink(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** "45s", "3m 20s" -- short enough to sit inside a button. */
export function countdown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}
