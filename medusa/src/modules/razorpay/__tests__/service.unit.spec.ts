import crypto from "node:crypto";
import { MedusaError, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils";
import type { RazorpayOrder, RazorpayPayment, RazorpayRefund } from "../client";
import RazorpayProvider, {
  pickPayment,
  sessionStatus,
  toPaise,
  toRupees,
  verifySignature,
  type RazorpayOptions,
} from "../service";

/**
 * Everything this provider decides on its own, checked without a network.
 *
 * The class holds its REST client as one field, so every test below swaps in a stub and then reads
 * the arguments it was handed. That is the whole point: the risk in a payment provider is not that
 * `fetch` misbehaves, it is that the wrong number, the wrong currency or the wrong session id is
 * handed to a company that will move money on it.
 *
 * The amounts are the five real shelf prices and the totals the storefront's own discount rules
 * produce from them, not round test numbers -- `1148.5 * 100` is `114849.99999999999` in binary
 * floating point, and a truncation there is a paisa short on every half-rupee cart.
 */

const KEYS = { keyId: "rzp_test_0000000000", keySecret: "secret_0000000000" };
const WEBHOOK_SECRET = "whsec_swasthvica";
const SESSION = "payses_01K0000000000000000000000";
const ORDER_ID = "order_R0000000000001";
const PAYMENT_ID = "pay_R0000000000001";

/** The shelf, in rupees. src/lib/products.ts. */
const SHELF = [649, 749, 899, 599, 699];

type Stub = ReturnType<typeof stubClient>;

const stubClient = () => ({
  createOrder: jest.fn<Promise<RazorpayOrder>, [never]>(),
  retrieveOrder: jest.fn<Promise<RazorpayOrder>, [string]>(),
  orderPayments: jest.fn<Promise<RazorpayPayment[]>, [string]>(),
  retrievePayment: jest.fn<Promise<RazorpayPayment>, [string]>(),
  capturePayment: jest.fn<Promise<RazorpayPayment>, [string, number, string]>(),
  refundPayment: jest.fn<Promise<RazorpayRefund>, [string, never]>(),
});

/**
 * A provider with its client replaced. `client` is `protected readonly`, which is a compile-time
 * promise and not a runtime one; the cast is the honest way to say so.
 */
const provider = (options: Partial<RazorpayOptions> = {}, stub: Stub = stubClient()) => {
  const p = new RazorpayProvider({}, { ...KEYS, ...options });
  (p as unknown as { client: Stub }).client = stub;
  return { p, stub };
};

const order = (over: Partial<RazorpayOrder> = {}): RazorpayOrder =>
  ({
    id: ORDER_ID,
    entity: "order",
    amount: 64900,
    amount_paid: 0,
    amount_due: 64900,
    currency: "INR",
    receipt: SESSION,
    status: "created",
    attempts: 0,
    notes: { session_id: SESSION },
    created_at: 1756684800,
    ...over,
  }) as RazorpayOrder;

const payment = (over: Partial<RazorpayPayment> = {}): RazorpayPayment =>
  ({
    id: PAYMENT_ID,
    entity: "payment",
    amount: 64900,
    currency: "INR",
    status: "captured",
    order_id: ORDER_ID,
    captured: true,
    amount_refunded: 0,
    notes: { session_id: SESSION },
    created_at: 1756684800,
    ...over,
  }) as RazorpayPayment;

const refund = (over: Partial<RazorpayRefund> = {}): RazorpayRefund =>
  ({
    id: "rfnd_R0000000000001",
    entity: "refund",
    amount: 64900,
    currency: "INR",
    payment_id: PAYMENT_ID,
    status: "processed",
    receipt: null,
    created_at: 1756684800,
    ...over,
  }) as RazorpayRefund;

/** The session data this provider writes at `initiatePayment` and reads back on every later call. */
const started = (over: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  session_id: SESSION,
  amount_paise: 64900,
  currency: "INR",
  ...over,
});

const sign = (raw: Buffer, secret = WEBHOOK_SECRET) =>
  crypto.createHmac("sha256", secret).update(raw).digest("hex");

/** A webhook as the framework hands it over: parsed body, preserved raw body, headers. */
const hook = (
  body: unknown,
  over: { signature?: string; header?: string; secret?: string } = {},
) => {
  const rawData = Buffer.from(JSON.stringify(body));
  return {
    data: JSON.parse(rawData.toString()) as Record<string, unknown>,
    rawData,
    headers: {
      [over.header ?? "x-razorpay-signature"]: over.signature ?? sign(rawData, over.secret),
    },
  };
};

const paymentEvent = (event: string, entity: Partial<RazorpayPayment> = {}) => ({
  entity: "event",
  account_id: "acc_R000000000000",
  event,
  contains: ["payment"],
  payload: { payment: { entity: payment(entity) } },
  created_at: 1756684800,
});

// --- money -----------------------------------------------------------------------------------

describe("razorpay: rupees to paise", () => {
  it("converts every shelf price without drift", () => {
    expect(SHELF.map(toPaise)).toEqual([64900, 74900, 89900, 59900, 69900]);
  });

  it("rounds rather than truncates, so a paisa is never lost to binary floating point", () => {
    // Today's shelf is whole rupees and multiplies cleanly, but a partial refund or a priced
    // delivery need not be: `19.99 * 100` is 1998.9999999999998 and `4.35 * 100` is
    // 434.99999999999994, and truncating either is a paisa short.
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(4.35)).toBe(435);
    expect(toPaise(19.99)).not.toBe(Math.trunc(19.99 * 100));
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(1148.5)).toBe(114850);
  });

  it("converts the totals the storefront's own discounts produce", () => {
    const twoBottles = 649 + 749; // TWOBOTTLES: flat 150 off, min subtotal 1200
    expect(toPaise(twoBottles)).toBe(139800);
    expect(toPaise(twoBottles - 150)).toBe(124800);
  });

  it("takes the decimal strings and BigNumber-shaped values Medusa stores amounts as", () => {
    expect(toPaise("1148.5")).toBe(114850);
    expect(toPaise({ value: "649" })).toBe(64900);
  });

  it("passes zero through, for a fully discounted cart", () => {
    expect(toPaise(0)).toBe(0);
  });

  it.each([["not a number"], [Infinity], [undefined], [null], [NaN]])(
    "refuses %p rather than sending Razorpay a nonsense amount",
    (bad) => {
      expect(() => toPaise(bad)).toThrow(MedusaError);
    },
  );

  it("refuses a negative amount", () => {
    expect(() => toPaise(-649)).toThrow(/negative/);
  });
});

describe("razorpay: paise to rupees", () => {
  it("round-trips every shelf price", () => {
    expect(SHELF.map((r) => toRupees(toPaise(r)))).toEqual(SHELF);
  });

  it("keeps the half rupee", () => {
    expect(toRupees(114850)).toBe(1148.5);
    expect(toRupees(0)).toBe(0);
  });
});

// --- webhook signatures ----------------------------------------------------------------------

describe("razorpay: signature verification", () => {
  const raw = Buffer.from('{"event":"order.paid"}');

  it("accepts a digest made with the same secret over the same bytes", () => {
    expect(verifySignature(raw, sign(raw), WEBHOOK_SECRET)).toBe(true);
  });

  it("rejects a digest made with a different secret", () => {
    expect(verifySignature(raw, sign(raw, "whsec_other"), WEBHOOK_SECRET)).toBe(false);
  });

  it("rejects a digest over different bytes", () => {
    // Re-serialising the body changes the bytes even when the object is identical. This is why the
    // provider hashes rawData and not a re-stringified `data`.
    const respaced = Buffer.from('{"event": "order.paid"}');
    expect(verifySignature(respaced, sign(raw), WEBHOOK_SECRET)).toBe(false);
  });

  it.each([
    ["", "empty"],
    ["deadbeef", "too short"],
    ["a".repeat(65), "wrong length"],
  ])("rejects %p (%s) without throwing", (signature, _why) => {
    expect(verifySignature(raw, signature, WEBHOOK_SECRET)).toBe(false);
  });
});

// --- choosing between attempts ----------------------------------------------------------------

describe("razorpay: which payment decides the session", () => {
  it("has no answer for an order nobody paid against", () => {
    expect(pickPayment([])).toBeUndefined();
  });

  it("keeps the captured payment when a later attempt failed", () => {
    // The collection comes back newest first, so the failed retry is the one a naive [0] would take.
    const best = pickPayment([
      payment({ id: "pay_failed", status: "failed" }),
      payment({ id: "pay_ok", status: "captured" }),
    ]);
    expect(best?.id).toBe("pay_ok");
  });

  it("prefers authorized to created, and captured to authorized", () => {
    expect(
      pickPayment([
        payment({ id: "a", status: "created" }),
        payment({ id: "b", status: "authorized" }),
      ])?.id,
    ).toBe("b");
    expect(
      pickPayment([
        payment({ id: "a", status: "authorized" }),
        payment({ id: "b", status: "captured" }),
      ])?.id,
    ).toBe("b");
  });

  it("reports a refund rather than the capture underneath it", () => {
    expect(
      pickPayment([
        payment({ id: "a", status: "authorized" }),
        payment({ id: "b", status: "refunded" }),
      ])?.id,
    ).toBe("b");
  });
});

describe("razorpay: status mapping", () => {
  it.each([
    ["captured", PaymentSessionStatus.CAPTURED],
    ["authorized", PaymentSessionStatus.AUTHORIZED],
    ["created", PaymentSessionStatus.PENDING],
    ["failed", PaymentSessionStatus.ERROR],
  ] as const)("maps %s", (status, expected) => {
    expect(sessionStatus(payment({ status }))).toBe(expected);
  });

  it("does not report a refunded payment as captured", () => {
    // CAPTURED here would let a cart whose money has already gone back be completed as paid.
    expect(sessionStatus(payment({ status: "refunded" }))).toBe(PaymentSessionStatus.CANCELED);
  });
});

// --- options ----------------------------------------------------------------------------------

describe("razorpay: option validation", () => {
  const validate = (o: unknown) => () => RazorpayProvider.validateOptions(o);

  it("accepts a full set", () => {
    expect(
      validate({ ...KEYS, webhookSecret: WEBHOOK_SECRET, autoCaptureExpiryMinutes: 12 }),
    ).not.toThrow();
  });

  it.each([
    [{}, "neither key"],
    [{ keyId: KEYS.keyId }, "no secret"],
    [{ keySecret: KEYS.keySecret }, "no key id"],
  ])("refuses %p (%s)", (options, _why) => {
    expect(validate(options)).toThrow(/RAZORPAY_KEY_ID/);
  });

  it("refuses an auto-capture window Razorpay would reject", () => {
    expect(validate({ ...KEYS, autoCaptureExpiryMinutes: 11 })).toThrow(/under 12/);
  });

  it("refuses a fractional auto-capture window", () => {
    expect(validate({ ...KEYS, autoCaptureExpiryMinutes: 12.5 })).toThrow(/whole number/);
  });

  it("refuses a refund speed that is not one of the two Razorpay has", () => {
    expect(validate({ ...KEYS, refundSpeed: "instant" })).toThrow(/normal.*optimum/);
  });
});

// --- initiate ---------------------------------------------------------------------------------

describe("razorpay: starting a payment", () => {
  it("refuses to open an order that a webhook could not be matched back to", () => {
    const { p } = provider();
    return expect(
      p.initiatePayment({ amount: 649, currency_code: "inr", data: {} }),
    ).rejects.toThrow(/payment session id/);
  });

  it("opens an order for the cart total in paise, with the session id on it", async () => {
    const { p, stub } = provider();
    stub.createOrder.mockResolvedValue(order({ amount: 139800 }));

    const out = await p.initiatePayment({
      amount: 1398,
      currency_code: "inr",
      data: { session_id: SESSION },
      context: { customer: { id: "cus_1", email: "buyer@example.com" } },
    });

    expect(stub.createOrder).toHaveBeenCalledWith({
      amount: 139800,
      currency: "INR",
      receipt: SESSION,
      notes: { session_id: SESSION, email: "buyer@example.com", customer_id: "cus_1" },
      payment: {
        capture: "automatic",
        capture_options: { automatic_expiry_period: 12, refund_speed: "normal" },
      },
    });
    // PENDING: an order exists, nobody has paid against it.
    expect(out.status).toBe(PaymentSessionStatus.PENDING);
    expect(out.id).toBe(ORDER_ID);
    expect(out.data).toMatchObject({ id: ORDER_ID, session_id: SESSION, amount_paise: 139800 });
  });

  it("leaves a guest's absent details out of notes rather than sending the word undefined", async () => {
    const { p, stub } = provider();
    stub.createOrder.mockResolvedValue(order());

    await p.initiatePayment({ amount: 649, currency_code: "inr", data: { session_id: SESSION } });

    expect(stub.createOrder.mock.calls[0][0]).toMatchObject({ notes: { session_id: SESSION } });
    expect(Object.keys((stub.createOrder.mock.calls[0][0] as { notes: object }).notes)).toEqual([
      "session_id",
    ]);
  });

  it("asks for manual capture, with its own expiry, when auto-capture is off", async () => {
    const { p, stub } = provider({ autoCapture: false, refundSpeed: "optimum" });
    stub.createOrder.mockResolvedValue(order());

    await p.initiatePayment({ amount: 649, currency_code: "inr", data: { session_id: SESSION } });

    expect(stub.createOrder.mock.calls[0][0]).toMatchObject({
      payment: {
        capture: "manual",
        capture_options: { manual_expiry_period: 7200, refund_speed: "optimum" },
      },
    });
  });
});

// --- authorize --------------------------------------------------------------------------------

describe("razorpay: authorizing", () => {
  it("refuses a session this provider did not start", () => {
    const { p } = provider();
    return expect(p.authorizePayment({ data: { session_id: SESSION } })).rejects.toThrow(
      /no Razorpay order/,
    );
  });

  it("stays pending when checkout was opened and closed again", async () => {
    const { p, stub } = provider();
    stub.orderPayments.mockResolvedValue([]);

    const out = await p.authorizePayment({ data: started() });

    expect(stub.orderPayments).toHaveBeenCalledWith(ORDER_ID);
    expect(out.status).toBe(PaymentSessionStatus.PENDING);
  });

  it("reads the outcome from Razorpay and ignores anything the browser sent", async () => {
    const { p, stub } = provider();
    stub.orderPayments.mockResolvedValue([payment({ status: "captured" })]);

    const out = await p.authorizePayment({
      // A hostile client could put anything here; none of it is looked at.
      data: { ...started(), razorpay_payment_id: "pay_forged", razorpay_signature: "0".repeat(64) },
    });

    expect(out.status).toBe(PaymentSessionStatus.CAPTURED);
    expect(out.data).toMatchObject({ payment_id: PAYMENT_ID, razorpay_status: "captured" });
  });

  it("reports a declined card as an error, not as pending", async () => {
    const { p, stub } = provider();
    stub.orderPayments.mockResolvedValue([payment({ status: "failed" })]);

    expect((await p.authorizePayment({ data: started() })).status).toBe(PaymentSessionStatus.ERROR);
  });
});

// --- capture, refund, cancel --------------------------------------------------------------------

describe("razorpay: capturing", () => {
  it("does nothing when Razorpay has already auto-captured", async () => {
    const { p, stub } = provider();
    stub.retrievePayment.mockResolvedValue(payment({ status: "captured" }));

    const out = await p.capturePayment({ data: started({ payment_id: PAYMENT_ID }) });

    // Capturing twice is an error at Razorpay, and one a customer would see as a failed order for
    // money that was in fact taken.
    expect(stub.capturePayment).not.toHaveBeenCalled();
    expect(out.data).toMatchObject({ razorpay_status: "captured" });
  });

  it("captures the full authorised amount, taken from Razorpay", async () => {
    const { p, stub } = provider();
    stub.retrievePayment.mockResolvedValue(payment({ status: "authorized", amount: 139800 }));
    stub.capturePayment.mockResolvedValue(payment({ status: "captured", amount: 139800 }));

    const out = await p.capturePayment({ data: started({ payment_id: PAYMENT_ID }) });

    expect(stub.capturePayment).toHaveBeenCalledWith(PAYMENT_ID, 139800, "INR");
    expect(out.data).toMatchObject({ razorpay_status: "captured", amount_paise: 139800 });
  });

  it("refuses to capture a payment the bank has not answered on", async () => {
    const { p, stub } = provider();
    stub.retrievePayment.mockResolvedValue(payment({ status: "created" }));

    await expect(p.capturePayment({ data: started({ payment_id: PAYMENT_ID }) })).rejects.toThrow(
      /only an "authorized" payment/,
    );
    expect(stub.capturePayment).not.toHaveBeenCalled();
  });

  it("refuses when nothing has been paid against the order", () => {
    const { p } = provider();
    return expect(p.capturePayment({ data: started() })).rejects.toThrow(/no Razorpay payment/);
  });
});

describe("razorpay: refunding", () => {
  it("sends paise, the configured speed, and a receipt that makes a double-click an error", async () => {
    const { p, stub } = provider();
    stub.refundPayment.mockResolvedValue(refund());

    const out = await p.refundPayment({ data: started({ payment_id: PAYMENT_ID }), amount: 649 });

    expect(stub.refundPayment).toHaveBeenCalledWith(PAYMENT_ID, {
      amount: 64900,
      speed: "normal",
      receipt: `${PAYMENT_ID}-64900`,
      notes: { session_id: SESSION },
    });
    expect(out.data).toMatchObject({
      refund_id: "rfnd_R0000000000001",
      razorpay_status: "refunded",
    });
  });

  it("records a refund Razorpay could not make", async () => {
    const { p, stub } = provider();
    stub.refundPayment.mockResolvedValue(refund({ status: "failed" }));

    const out = await p.refundPayment({ data: started({ payment_id: PAYMENT_ID }), amount: 649 });

    expect(out.data).toMatchObject({ razorpay_status: "refund_failed" });
  });

  it("honours an optimum refund speed", async () => {
    const { p, stub } = provider({ refundSpeed: "optimum" });
    stub.refundPayment.mockResolvedValue(refund());

    await p.refundPayment({ data: started({ payment_id: PAYMENT_ID }), amount: 1148.5 });

    expect(stub.refundPayment.mock.calls[0][1]).toMatchObject({ amount: 114850, speed: "optimum" });
  });
});

describe("razorpay: cancelling and deleting", () => {
  it("touches nothing, because Razorpay has no such call", async () => {
    const { p, stub } = provider();
    const data = started();

    expect(await p.cancelPayment({ data })).toEqual({ data });
    expect(await p.deletePayment({ data })).toEqual({ data });
    // Both sit in a compensation path: a throw here would replace one failure with two.
    expect(Object.values(stub).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });
});

// --- reading state ------------------------------------------------------------------------------

describe("razorpay: reading a session's status", () => {
  it("asks about the payment once there is one", async () => {
    const { p, stub } = provider();
    stub.retrievePayment.mockResolvedValue(payment({ status: "authorized" }));

    const out = await p.getPaymentStatus({ data: started({ payment_id: PAYMENT_ID }) });

    expect(stub.retrievePayment).toHaveBeenCalledWith(PAYMENT_ID);
    expect(stub.orderPayments).not.toHaveBeenCalled();
    expect(out.status).toBe(PaymentSessionStatus.AUTHORIZED);
  });

  it("falls back to the order's attempts before one is known", async () => {
    const { p, stub } = provider();
    stub.orderPayments.mockResolvedValue([payment({ status: "captured" })]);

    const out = await p.getPaymentStatus({ data: started() });

    expect(out.status).toBe(PaymentSessionStatus.CAPTURED);
    expect(out.data).toMatchObject({ payment_id: PAYMENT_ID });
  });

  it("is pending when the order has no attempts at all", async () => {
    const { p, stub } = provider();
    stub.orderPayments.mockResolvedValue([]);

    expect((await p.getPaymentStatus({ data: started() })).status).toBe(
      PaymentSessionStatus.PENDING,
    );
  });
});

describe("razorpay: retrieving", () => {
  it("returns the payment when there is one", async () => {
    const { p, stub } = provider();
    stub.retrievePayment.mockResolvedValue(payment());

    expect(
      (await p.retrievePayment({ data: started({ payment_id: PAYMENT_ID }) })).data,
    ).toMatchObject({ id: PAYMENT_ID, entity: "payment" });
  });

  it("returns the order when there is not", async () => {
    const { p, stub } = provider();
    stub.retrieveOrder.mockResolvedValue(order());

    expect((await p.retrievePayment({ data: started() })).data).toMatchObject({
      id: ORDER_ID,
      entity: "order",
    });
  });
});

describe("razorpay: updating an amount", () => {
  it("leaves the order alone when nothing about the money changed", async () => {
    const { p, stub } = provider();

    const out = await p.updatePayment({ amount: 649, currency_code: "inr", data: started() });

    expect(stub.createOrder).not.toHaveBeenCalled();
    expect(out.status).toBe(PaymentSessionStatus.PENDING);
  });

  it("opens a new order when the cart total moved, since Razorpay's is immutable", async () => {
    const { p, stub } = provider();
    stub.createOrder.mockResolvedValue(order({ id: "order_R0000000000002", amount: 139800 }));

    const out = await p.updatePayment({ amount: 1398, currency_code: "inr", data: started() });

    expect(stub.createOrder.mock.calls[0][0]).toMatchObject({ amount: 139800, receipt: SESSION });
    expect(out.data).toMatchObject({ id: "order_R0000000000002", session_id: SESSION });
  });
});

// --- webhooks -----------------------------------------------------------------------------------

describe("razorpay: webhooks", () => {
  const hooked = (options: Partial<RazorpayOptions> = {}) =>
    provider({ webhookSecret: WEBHOOK_SECRET, ...options }).p;

  it("refuses to act on one at all when there is no secret to check it against", () => {
    // An unverifiable webhook is indistinguishable from a forged one.
    return expect(
      hooked({ webhookSecret: undefined }).getWebhookActionAndData(
        hook(paymentEvent("order.paid")),
      ),
    ).rejects.toThrow(/RAZORPAY_WEBHOOK_SECRET/);
  });

  it("refuses one with no signature header", () => {
    return expect(
      hooked().getWebhookActionAndData(hook(paymentEvent("order.paid"), { header: "x-other" })),
    ).rejects.toThrow(/no x-razorpay-signature/);
  });

  it("refuses one signed with the wrong secret", () => {
    return expect(
      hooked().getWebhookActionAndData(hook(paymentEvent("order.paid"), { secret: "whsec_wrong" })),
    ).rejects.toThrow(/does not match/);
  });

  it("refuses a body that was edited after signing", () => {
    const forged = hook(paymentEvent("order.paid"));
    forged.rawData = Buffer.from(
      JSON.stringify(paymentEvent("order.paid", { amount: 100, id: "pay_forged" })),
    );
    return expect(hooked().getWebhookActionAndData(forged)).rejects.toThrow(/does not match/);
  });

  it.each([
    ["order.paid", PaymentActions.SUCCESSFUL],
    ["payment.captured", PaymentActions.SUCCESSFUL],
    ["payment.authorized", PaymentActions.AUTHORIZED],
    ["payment.failed", PaymentActions.FAILED],
    ["payment.downtime.started", PaymentActions.NOT_SUPPORTED],
  ] as const)("maps %s", async (event, action) => {
    expect((await hooked().getWebhookActionAndData(hook(paymentEvent(event)))).action).toBe(action);
  });

  it("carries the session id and the amount back in rupees", async () => {
    const out = await hooked().getWebhookActionAndData(
      hook(paymentEvent("order.paid", { amount: 114850 })),
    );

    expect(out.data?.session_id).toBe(SESSION);
    // The subscriber compares this against the session's own amount, which is in rupees.
    expect(Number(out.data?.amount)).toBe(1148.5);
  });

  it("reads the session id off an order-shaped payload too", async () => {
    const body = {
      entity: "event",
      event: "order.paid",
      contains: ["order"],
      payload: { order: { entity: order({ amount: 64900, status: "paid" }) } },
    };

    const out = await hooked().getWebhookActionAndData(hook(body));

    expect(out.action).toBe(PaymentActions.SUCCESSFUL);
    expect(out.data?.session_id).toBe(SESSION);
  });

  it("reports an event with no session id as unsupported rather than failing", async () => {
    // medusa's own subscriber drops these silently; saying NOT_SUPPORTED stops Razorpay retrying.
    const out = await hooked().getWebhookActionAndData(
      hook({ entity: "event", event: "payment.captured", payload: {} }),
    );

    expect(out.action).toBe(PaymentActions.NOT_SUPPORTED);
  });

  it("finds the signature whatever case or shape the header arrived in", async () => {
    const signed = hook(paymentEvent("order.paid"));
    const signature = signed.headers["x-razorpay-signature"];

    for (const headers of [
      { "X-Razorpay-Signature": signature },
      { "x-razorpay-signature": [signature] },
    ]) {
      const out = await hooked().getWebhookActionAndData({ ...signed, headers });
      expect(out.action).toBe(PaymentActions.SUCCESSFUL);
    }
  });

  it("verifies a raw body handed over as a string", async () => {
    const signed = hook(paymentEvent("order.paid"));
    const out = await hooked().getWebhookActionAndData({
      ...signed,
      rawData: signed.rawData.toString(),
    });

    expect(out.action).toBe(PaymentActions.SUCCESSFUL);
  });
});
