import { describe, expect, it } from "vitest";
import {
  countdown,
  courierLink,
  EMAIL_MAX,
  EMAIL_SHAPE,
  REFERENCE_SHAPE,
  stageOf,
  TRACK_STATUS,
  type TrackedOrder,
} from "./track-shape";

/* ------------------------------------------------------------------------------------------------
 * The wording, the shapes, and the URL guard.
 *
 * The three status enumerations below are copied from the installed Medusa, not invented:
 *   OrderStatus        @medusajs/utils/dist/order/status.js
 *   PaymentStatus      @medusajs/core-flows/dist/order/utils/aggregate-status.js
 *   FulfillmentStatus  same file
 * Every combination of them is put through `stageOf` so that no reachable state of an order can
 * render a blank headline or fall off the end of the precedence list. That matters more than it
 * sounds: the one place a customer reads this is the page they open when they are already worried.
 * ---------------------------------------------------------------------------------------------- */

const ORDER_STATUSES = [
  "pending",
  "completed",
  "draft",
  "archived",
  "canceled",
  "requires_action",
] as const;

const PAYMENT_STATUSES = [
  "not_paid",
  "awaiting",
  "captured",
  "partially_captured",
  "partially_refunded",
  "refunded",
  "canceled",
  "requires_action",
  "authorized",
  "partially_authorized",
] as const;

const FULFILMENT_STATUSES = [
  "not_fulfilled",
  "partially_fulfilled",
  "fulfilled",
  "partially_shipped",
  "shipped",
  "delivered",
  "partially_delivered",
  "canceled",
] as const;

function order(over: Partial<TrackedOrder> = {}): TrackedOrder {
  return {
    reference: "SV260828-K4M2P",
    placedAt: "2026-08-28T09:15:00.000Z",
    status: "pending",
    paymentStatus: "captured",
    fulfillmentStatus: "not_fulfilled",
    itemCount: 2,
    shipments: [],
    ...over,
  };
}

describe("stageOf — every state Medusa can report", () => {
  it("answers with a sentence for all 480 combinations", () => {
    for (const status of ORDER_STATUSES) {
      for (const paymentStatus of PAYMENT_STATUSES) {
        for (const fulfillmentStatus of FULFILMENT_STATUSES) {
          const stage = stageOf(order({ status, paymentStatus, fulfillmentStatus }));
          const where = `${status}/${paymentStatus}/${fulfillmentStatus}`;
          expect(stage.headline.length, where).toBeGreaterThan(0);
          expect(stage.detail.length, where).toBeGreaterThan(20);
          // No machine word ever reaches the page. A customer reading "partially_fulfilled" has
          // been shown the database, not an answer.
          expect(stage.headline, where).not.toMatch(/_/);
          expect(stage.detail, where).not.toMatch(/_/);
        }
      }
    }
  });

  it("never leaves an unknown state without an answer", () => {
    const stage = stageOf(
      order({ status: "something_new", paymentStatus: "invented", fulfillmentStatus: "invented" }),
    );
    expect(stage.headline).toBe("Being prepared");
  });
});

describe("stageOf — precedence", () => {
  it("puts cancellation above everything, however far the parcel got", () => {
    for (const fulfillmentStatus of FULFILMENT_STATUSES) {
      expect(stageOf(order({ status: "canceled", fulfillmentStatus })).headline).toBe("Cancelled");
    }
  });

  it("says the money came back when a cancelled order was refunded", () => {
    const stage = stageOf(order({ status: "canceled", paymentStatus: "refunded" }));
    expect(stage.detail).toMatch(/sent back/);
  });

  it("offers to settle it when a cancelled order was not refunded", () => {
    const stage = stageOf(order({ status: "canceled", paymentStatus: "captured" }));
    expect(stage.detail).toMatch(/write to us/);
  });

  it("treats a cancelled fulfilment as a cancelled order", () => {
    expect(stageOf(order({ fulfillmentStatus: "canceled" })).headline).toBe("Cancelled");
  });

  it("reports a refund ahead of a despatch that already happened", () => {
    // A parcel that shipped and then came back is a refund to the customer. Saying "on its way"
    // about money they have already been given back is the wrong answer, not a stale one.
    expect(
      stageOf(order({ paymentStatus: "refunded", fulfillmentStatus: "shipped" })).headline,
    ).toBe("Refunded");
    expect(
      stageOf(order({ paymentStatus: "partially_refunded", fulfillmentStatus: "delivered" }))
        .headline,
    ).toBe("Partly refunded");
  });

  it("reports where the parcel is ahead of where the money is", () => {
    expect(
      stageOf(order({ paymentStatus: "not_paid", fulfillmentStatus: "shipped" })).headline,
    ).toBe("On its way");
  });

  it("maps each fulfilment state to its own words", () => {
    const headline = (fulfillmentStatus: string) => stageOf(order({ fulfillmentStatus })).headline;
    expect(headline("delivered")).toBe("Delivered");
    expect(headline("partially_delivered")).toBe("Part delivered");
    expect(headline("shipped")).toBe("On its way");
    expect(headline("partially_shipped")).toBe("On its way");
    expect(headline("fulfilled")).toBe("Packed");
    expect(headline("partially_fulfilled")).toBe("Packed");
  });

  it("tells a customer whose bank is waiting that the ball is with them", () => {
    const stage = stageOf(order({ paymentStatus: "requires_action" }));
    expect(stage.headline).toBe("Waiting on your payment");
    expect(stage.detail).toMatch(/your bank/i);
  });

  it("keeps an order that needs a hand apart from a payment that needs one", () => {
    // Medusa sets OrderStatus.REQUIRES_ACTION for anything needing manual intervention, not only
    // for payment, so it must not borrow the payment sentence and send somebody to their bank app
    // for an order edit. A concrete payment state still wins over it.
    expect(stageOf(order({ status: "requires_action", paymentStatus: "not_paid" })).headline).toBe(
      "Payment not confirmed",
    );
    expect(stageOf(order({ status: "requires_action", paymentStatus: "captured" })).headline).toBe(
      "Needs a step before it moves",
    );
    expect(
      stageOf(order({ status: "requires_action", paymentStatus: "unknown_state" })).headline,
    ).toBe("Needs a step before it moves");
  });

  it("does not claim payment for an order that has not been paid", () => {
    for (const paymentStatus of ["not_paid", "awaiting", "canceled"]) {
      expect(stageOf(order({ paymentStatus })).headline).toBe("Payment not confirmed");
    }
  });

  it("says packing has started once any form of payment landed", () => {
    for (const paymentStatus of [
      "captured",
      "partially_captured",
      "authorized",
      "partially_authorized",
    ]) {
      expect(stageOf(order({ paymentStatus })).headline).toBe("Paid, being packed");
    }
  });
});

describe("REFERENCE_SHAPE", () => {
  it("accepts a reference of the shape the checkout mints", () => {
    expect(REFERENCE_SHAPE.test("SV260828-K4M2P")).toBe(true);
    expect(REFERENCE_SHAPE.test("SV000000-00000")).toBe(true);
    expect(REFERENCE_SHAPE.test("SV991231-ZZZZZ")).toBe(true);
  });

  it("rejects the four characters Crockford leaves out", () => {
    // I, L, O and U are excluded because they are the ones misread off a screen or down a phone.
    for (const letter of ["I", "L", "O", "U"]) {
      expect(REFERENCE_SHAPE.test(`SV260828-${letter}4M2P`)).toBe(false);
    }
  });

  it("rejects everything that is nearly a reference", () => {
    const near = [
      "",
      "SV260828",
      "SV260828-",
      "SV26082-K4M2P", // five digits
      "SV2608281-K4M2P", // seven digits
      "SV260828-K4M2", // four characters
      "SV260828-K4M2PQ", // six characters
      "sv260828-k4m2p", // the route upper-cases before it tests; raw lower case must not pass
      "XX260828-K4M2P",
      " SV260828-K4M2P",
      "SV260828-K4M2P ",
      "SV260828–K4M2P", // en dash, which is what a phone keyboard offers
      "SV260828-K4M2P\n",
    ];
    for (const value of near) expect(REFERENCE_SHAPE.test(value), value).toBe(false);
  });

  it("is not anchored in a way a newline can walk past", () => {
    // `$` alone would match before a trailing newline, which is the classic way an injected second
    // line slips through a regex that looks correct.
    expect(REFERENCE_SHAPE.test("SV260828-K4M2P\nDROP TABLE orders")).toBe(false);
  });
});

describe("EMAIL_SHAPE", () => {
  it("accepts the addresses real customers have", () => {
    for (const value of [
      "a@b.co",
      "first.last+tag@sub.domain.example",
      "ORDERS@SWASTHVICA.IN",
      "user@xn--80ak6aa92e.com",
    ]) {
      expect(EMAIL_SHAPE.test(value), value).toBe(true);
    }
  });

  it("rejects what is plainly not one", () => {
    for (const value of [
      "",
      "a",
      "a@",
      "@b.co",
      "a@b",
      "a b@c.co",
      "a@b.c",
      "a@b .co",
      "a@@b.co",
    ]) {
      expect(EMAIL_SHAPE.test(value), value).toBe(false);
    }
  });

  it("caps the address at the length SMTP permits", () => {
    expect(EMAIL_MAX).toBe(254);
  });
});

describe("courierLink", () => {
  it("passes an ordinary courier URL through", () => {
    expect(courierLink("https://shiprocket.co/tracking/ABC123")).toBe(
      "https://shiprocket.co/tracking/ABC123",
    );
    expect(courierLink("http://track.example/x")).toBe("http://track.example/x");
  });

  it("refuses a scheme that would execute", () => {
    // This field is whatever the fulfilment provider wrote on the label. It becomes an href, so a
    // scheme check is the difference between a link and a script.
    for (const value of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(courierLink(value), value).toBeNull();
    }
  });

  it("returns null for nothing, and for a string that is not a URL", () => {
    expect(courierLink(null)).toBeNull();
    expect(courierLink(undefined)).toBeNull();
    expect(courierLink("")).toBeNull();
    expect(courierLink("   ")).toBeNull();
    expect(courierLink("not a url")).toBeNull();
    expect(courierLink("/relative/path")).toBeNull();
  });
});

describe("countdown", () => {
  it("counts seconds below a minute", () => {
    expect(countdown(1)).toBe("1s");
    expect(countdown(59)).toBe("59s");
  });

  it("pads the seconds so the width does not jump every tick", () => {
    expect(countdown(60)).toBe("1m 00s");
    expect(countdown(65)).toBe("1m 05s");
    expect(countdown(200)).toBe("3m 20s");
    expect(countdown(900)).toBe("15m 00s");
  });
});

describe("TRACK_STATUS", () => {
  it("maps each refusal to the status a client can act on", () => {
    expect(TRACK_STATUS).toEqual({
      invalid: 400,
      "not-found": 404,
      throttled: 429,
      unavailable: 503,
    });
  });
});
