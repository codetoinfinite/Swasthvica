import { createHash } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import type { SubscriberArgs } from "@medusajs/framework/subscribers";
import {
  AuthWorkflowEvents,
  ChangeActionType,
  ContainerRegistrationKeys,
  FulfillmentWorkflowEvents,
  Modules,
  OrderWorkflowEvents,
  PaymentEvents,
} from "@medusajs/framework/utils";
import { TERMS } from "../../lib/brand";
import { TEMPLATE } from "../../modules/resend/templates";
import { notify } from "../_notify";
import sendOrderCanceled, { config as canceledConfig } from "../order-canceled";
import sendOrderDelivered, { config as deliveredConfig } from "../order-delivered";
import sendOrderPlaced, { config as placedConfig } from "../order-placed";
import sendOrderRefunded, { config as refundedConfig } from "../order-refunded";
import sendOrderShipped, { config as shippedConfig } from "../order-shipped";
import sendOrderTransferRequested, { config as transferConfig } from "../order-transfer-requested";
import sendPasswordReset, { config as resetConfig } from "../password-reset";

/* ------------------------------------------------------------------------------------------------
 * The seven subscribers, driven against a fake container.
 *
 * Two properties matter more than the content of any one e-mail, and neither is visible from
 * reading a template.
 *
 * THE SKIP BRANCHES. The event bus is Redis-backed and retries anything that throws, so a handler
 * that throws on an order with no e-mail address would retry that job until the queue gives up.
 * Every one of those cases has to warn and return, and each is asserted here by its reason string
 * -- the string is what somebody reads at three in the morning.
 *
 * THE IDEMPOTENCY KEYS. `createNotifications_` de-duplicates on the key, which is the only thing
 * standing between "the bus delivered this event twice" and "the customer got two confirmations".
 * Every key is asserted literally, because a key that drifts still compiles, still sends, and is
 * only wrong on the day a job is replayed.
 * ---------------------------------------------------------------------------------------------- */

type Graph = { entity: string; fields: string[]; filters?: Record<string, unknown> };

type Rig = {
  container: MedusaContainer;
  createNotifications: jest.Mock;
  listNotifications: jest.Mock;
  softDeleteNotifications: jest.Mock;
  /** The resolved module object, so a test can take a method away from it. */
  notificationModule: Record<string, unknown>;
  warn: jest.Mock;
  graph: jest.Mock;
};

/**
 * A container answering `query.graph` from `rows`, and recording every notification and warning.
 *
 * `listNotifications` answers "no previous attempt" by default, which is the state every
 * subscriber test below is written against; the sweep cases in the last describe block override
 * it. `notificationModule` is built once per rig so that a test can drop
 * `softDeleteNotifications` off it and exercise the degradation path.
 */
function rig(rows: (args: Graph) => unknown[]): Rig {
  const graph = jest.fn(async (args: Graph) => ({ data: rows(args) }));
  const createNotifications = jest.fn(async () => []);
  const listNotifications = jest.fn(async () => [] as unknown[]);
  const softDeleteNotifications = jest.fn(async () => undefined);
  const warn = jest.fn();
  const notificationModule: Record<string, unknown> = {
    createNotifications,
    listNotifications,
    softDeleteNotifications,
  };
  const container = {
    resolve(key: string) {
      if (key === ContainerRegistrationKeys.QUERY) return { graph };
      if (key === Modules.NOTIFICATION) return notificationModule;
      if (key === ContainerRegistrationKeys.LOGGER) return { warn, info: jest.fn() };
      throw new Error(`unexpected resolve(${key})`);
    },
  } as unknown as MedusaContainer;
  return {
    container,
    createNotifications,
    listNotifications,
    softDeleteNotifications,
    notificationModule,
    warn,
    graph,
  };
}

/** Only `event` and `container` are read; `pluginOptions` exists to satisfy the declared shape. */
function args<T>(container: MedusaContainer, name: string, data: T): SubscriberArgs<T> {
  return { event: { name, data }, container, pluginOptions: {} };
}

const sent = (r: Rig) => r.createNotifications.mock.calls[0]?.[0];
const reason = (r: Rig) => r.warn.mock.calls[0]?.[0] as string | undefined;

const ORDER = {
  id: "order_1",
  display_id: 12,
  email: "meera@example.com",
  customer_id: "cus_1",
  currency_code: "inr",
  created_at: "2026-09-01T17:20:10.000Z",
  metadata: { draft_ref: "SV260901-K3M7Q" },
  items: [{ title: "Hairfall Defense", variant_title: "200 ml", quantity: 2, total: 1298 }],
  shipping_address: { first_name: "Meera", last_name: "Rao", city: "Lucknow", country_code: "in" },
  total: 1298,
  original_item_total: 1298,
  item_discount_total: 0,
  shipping_total: 0,
  tax_total: 198,
};

/** The common case: every entity resolves to exactly one row. */
const table =
  (rows: Record<string, unknown[]>) =>
  (args: Graph): unknown[] =>
    rows[args.entity] ?? [];

describe("configuration", () => {
  // A subscriber registered on the wrong event name is a file that loads, boots, and never runs.
  it("binds each handler to the event it reads", () => {
    expect(placedConfig.event).toBe(OrderWorkflowEvents.PLACED);
    expect(shippedConfig.event).toBe(FulfillmentWorkflowEvents.SHIPMENT_CREATED);
    expect(deliveredConfig.event).toBe(FulfillmentWorkflowEvents.DELIVERY_CREATED);
    expect(canceledConfig.event).toBe(OrderWorkflowEvents.CANCELED);
    expect(refundedConfig.event).toBe(PaymentEvents.REFUNDED);
    expect(resetConfig.event).toBe(AuthWorkflowEvents.PASSWORD_RESET);
    expect(transferConfig.event).toBe(OrderWorkflowEvents.TRANSFER_REQUESTED);
  });

  // The identifier is what the framework keys the subscriber on, so two handlers sharing one would
  // mean the second silently replaces the first.
  it("gives every subscriber its own identifier", () => {
    const ids = [
      placedConfig,
      shippedConfig,
      deliveredConfig,
      canceledConfig,
      refundedConfig,
      resetConfig,
      transferConfig,
    ].map((config) => config.context?.subscriberId);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("order-placed", () => {
  it("sends the receipt, keyed on the order", async () => {
    const r = rig(table({ order: [ORDER] }));
    await sendOrderPlaced(args(r.container, OrderWorkflowEvents.PLACED, { id: "order_1" }));

    expect(sent(r)).toMatchObject({
      to: "meera@example.com",
      channel: "email",
      template: TEMPLATE.orderPlaced,
      idempotency_key: "order-placed:order_1",
      trigger_type: OrderWorkflowEvents.PLACED,
      resource_id: "order_1",
      resource_type: "order",
      receiver_id: "cus_1",
    });
    expect(sent(r).data).toMatchObject({
      reference: "SV260901-K3M7Q",
      customerName: "Meera Rao",
      total: 1298,
      lines: [{ title: "Hairfall Defense", variant: "200 ml", quantity: 2, total: 1298 }],
    });
  });

  it("sends a guest order with no customer attached", async () => {
    const r = rig(table({ order: [{ ...ORDER, customer_id: null }] }));
    await sendOrderPlaced(args(r.container, OrderWorkflowEvents.PLACED, { id: "order_1" }));
    expect(sent(r).receiver_id).toBeNull();
  });

  it("skips an event with no order id", async () => {
    const r = rig(table({}));
    await sendOrderPlaced(
      args(r.container, OrderWorkflowEvents.PLACED, { id: "" } as { id: string }),
    );
    expect(r.createNotifications).not.toHaveBeenCalled();
    expect(reason(r)).toBe("[order-placed] skipped: the event carried no order id");
  });

  it("skips an order that no longer exists", async () => {
    const r = rig(table({}));
    await sendOrderPlaced(args(r.container, OrderWorkflowEvents.PLACED, { id: "order_gone" }));
    expect(r.createNotifications).not.toHaveBeenCalled();
    expect(reason(r)).toBe("[order-placed] skipped: order order_gone no longer exists");
  });

  it("skips an order with no e-mail address rather than sending to nobody", async () => {
    const r = rig(table({ order: [{ ...ORDER, email: null }] }));
    await sendOrderPlaced(args(r.container, OrderWorkflowEvents.PLACED, { id: "order_1" }));
    expect(r.createNotifications).not.toHaveBeenCalled();
    expect(reason(r)).toBe("[order-placed] skipped: order order_1 has no e-mail address");
  });
});

describe("order-shipped", () => {
  const FULFILLMENT = {
    id: "ful_1",
    order: { id: "order_1" },
    items: [{ title: "Hairfall Defense", quantity: 2 }],
    labels: [{ tracking_number: "AWB1", tracking_url: "https://track/AWB1" }],
  };

  it("sends the dispatch note, keyed on the fulfilment", async () => {
    const r = rig(table({ fulfillment: [FULFILLMENT], order: [ORDER] }));
    await sendOrderShipped(
      args(r.container, FulfillmentWorkflowEvents.SHIPMENT_CREATED, { id: "ful_1" }),
    );

    expect(sent(r)).toMatchObject({
      to: "meera@example.com",
      template: TEMPLATE.orderShipped,
      idempotency_key: "order-shipped:ful_1",
      trigger_type: FulfillmentWorkflowEvents.SHIPMENT_CREATED,
      resource_id: "order_1",
    });
    expect(sent(r).data).toMatchObject({
      courier: TERMS.courier,
      trackingNumbers: ["AWB1"],
      trackingUrl: "https://track/AWB1",
      lines: [{ title: "Hairfall Defense", variant: null, quantity: 2, total: 0 }],
    });
  });

  // Two parcels are two events and two e-mails; the keys must differ or the second is swallowed.
  it("keys a second parcel separately from the first", async () => {
    const r = rig(table({ fulfillment: [{ ...FULFILLMENT, id: "ful_2" }], order: [ORDER] }));
    await sendOrderShipped(
      args(r.container, FulfillmentWorkflowEvents.SHIPMENT_CREATED, { id: "ful_2" }),
    );
    expect(sent(r).idempotency_key).toBe("order-shipped:ful_2");
  });

  it("honours an admin asking for no notification", async () => {
    const r = rig(table({ fulfillment: [FULFILLMENT], order: [ORDER] }));
    await sendOrderShipped(
      args(r.container, FulfillmentWorkflowEvents.SHIPMENT_CREATED, {
        id: "ful_1",
        no_notification: true,
      }),
    );
    expect(r.createNotifications).not.toHaveBeenCalled();
    expect(r.graph).not.toHaveBeenCalled();
    expect(reason(r)).toBe("[order-shipped] skipped: fulfilment ful_1 asked for no notification");
  });

  it("sends when the flag is present and false", async () => {
    const r = rig(table({ fulfillment: [FULFILLMENT], order: [ORDER] }));
    await sendOrderShipped(
      args(r.container, FulfillmentWorkflowEvents.SHIPMENT_CREATED, {
        id: "ful_1",
        no_notification: false,
      }),
    );
    expect(r.createNotifications).toHaveBeenCalledTimes(1);
  });

  it("skips an event with no fulfilment id", async () => {
    const r = rig(table({}));
    await sendOrderShipped(
      args(r.container, FulfillmentWorkflowEvents.SHIPMENT_CREATED, {} as { id: string }),
    );
    expect(reason(r)).toBe("[order-shipped] skipped: the event carried no fulfilment id");
  });

  it("skips a fulfilment that no longer exists", async () => {
    const r = rig(table({}));
    await sendOrderShipped(
      args(r.container, FulfillmentWorkflowEvents.SHIPMENT_CREATED, { id: "ful_gone" }),
    );
    expect(reason(r)).toBe("[order-shipped] skipped: fulfilment ful_gone no longer exists");
  });

  // The link module is what carries the order onto the fulfilment. A missing link is not an error
  // worth retrying -- nothing about it will be different on the second attempt.
  it("skips a fulfilment whose order link is missing", async () => {
    const r = rig(table({ fulfillment: [{ id: "ful_1", order: null }] }));
    await sendOrderShipped(
      args(r.container, FulfillmentWorkflowEvents.SHIPMENT_CREATED, { id: "ful_1" }),
    );
    expect(reason(r)).toBe("[order-shipped] skipped: fulfilment ful_1 belongs to no order");
  });

  it("skips when the order behind the fulfilment is gone", async () => {
    const r = rig(table({ fulfillment: [FULFILLMENT] }));
    await sendOrderShipped(
      args(r.container, FulfillmentWorkflowEvents.SHIPMENT_CREATED, { id: "ful_1" }),
    );
    expect(reason(r)).toBe("[order-shipped] skipped: order order_1 no longer exists");
  });

  it("skips when the order has no e-mail address", async () => {
    const r = rig(table({ fulfillment: [FULFILLMENT], order: [{ ...ORDER, email: "  " }] }));
    await sendOrderShipped(
      args(r.container, FulfillmentWorkflowEvents.SHIPMENT_CREATED, { id: "ful_1" }),
    );
    expect(reason(r)).toBe("[order-shipped] skipped: order order_1 has no e-mail address");
  });

  it("sends with an empty tracking list when the courier gave no label", async () => {
    const r = rig(
      table({ fulfillment: [{ id: "ful_1", order: { id: "order_1" } }], order: [ORDER] }),
    );
    await sendOrderShipped(
      args(r.container, FulfillmentWorkflowEvents.SHIPMENT_CREATED, { id: "ful_1" }),
    );
    expect(sent(r).data).toMatchObject({ trackingNumbers: [], trackingUrl: null, lines: [] });
  });
});

describe("order-delivered", () => {
  it("reports the recorded delivery time, not the time the e-mail was built", async () => {
    const r = rig(
      table({
        fulfillment: [
          { id: "ful_1", order: { id: "order_1" }, delivered_at: "2026-09-05T06:30:00.000Z" },
        ],
        order: [ORDER],
      }),
    );
    await sendOrderDelivered(
      args(r.container, FulfillmentWorkflowEvents.DELIVERY_CREATED, { id: "ful_1" }),
    );
    expect(sent(r)).toMatchObject({
      template: TEMPLATE.orderDelivered,
      idempotency_key: "order-delivered:ful_1",
      trigger_type: FulfillmentWorkflowEvents.DELIVERY_CREATED,
    });
    expect(sent(r).data.deliveredAt).toBe("2026-09-05T06:30:00.000Z");
  });

  it("normalises a Date to ISO", async () => {
    const r = rig(
      table({
        fulfillment: [
          {
            id: "ful_1",
            order: { id: "order_1" },
            delivered_at: new Date("2026-09-05T06:30:00.000Z"),
          },
        ],
        order: [ORDER],
      }),
    );
    await sendOrderDelivered(
      args(r.container, FulfillmentWorkflowEvents.DELIVERY_CREATED, { id: "ful_1" }),
    );
    expect(sent(r).data.deliveredAt).toBe("2026-09-05T06:30:00.000Z");
  });

  it("says no day at all rather than the wrong one", async () => {
    const r = rig(
      table({
        fulfillment: [{ id: "ful_1", order: { id: "order_1" }, delivered_at: "  " }],
        order: [ORDER],
      }),
    );
    await sendOrderDelivered(
      args(r.container, FulfillmentWorkflowEvents.DELIVERY_CREATED, { id: "ful_1" }),
    );
    expect(sent(r).data.deliveredAt).toBeNull();
  });

  it("skips the same four ways the dispatch note does", async () => {
    const noId = rig(table({}));
    await sendOrderDelivered(
      args(noId.container, FulfillmentWorkflowEvents.DELIVERY_CREATED, {} as { id: string }),
    );
    expect(reason(noId)).toBe("[order-delivered] skipped: the event carried no fulfilment id");

    const noFulfillment = rig(table({}));
    await sendOrderDelivered(
      args(noFulfillment.container, FulfillmentWorkflowEvents.DELIVERY_CREATED, { id: "ful_x" }),
    );
    expect(reason(noFulfillment)).toBe(
      "[order-delivered] skipped: fulfilment ful_x no longer exists",
    );

    const noLink = rig(table({ fulfillment: [{ id: "ful_1" }] }));
    await sendOrderDelivered(
      args(noLink.container, FulfillmentWorkflowEvents.DELIVERY_CREATED, { id: "ful_1" }),
    );
    expect(reason(noLink)).toBe("[order-delivered] skipped: fulfilment ful_1 belongs to no order");

    const noEmail = rig(
      table({
        fulfillment: [{ id: "ful_1", order: { id: "order_1" } }],
        order: [{ ...ORDER, email: null }],
      }),
    );
    await sendOrderDelivered(
      args(noEmail.container, FulfillmentWorkflowEvents.DELIVERY_CREATED, { id: "ful_1" }),
    );
    expect(reason(noEmail)).toBe("[order-delivered] skipped: order order_1 has no e-mail address");
  });
});

describe("order-canceled", () => {
  /** `loadOrder` and `capturedTotal` both query "order"; the field list tells them apart. */
  const cancelTable = (order: unknown[], collections: unknown[]) => (query: Graph) => {
    if (query.fields.includes("payment_collections.captured_amount")) {
      return order.length ? [{ id: "order_1", payment_collections: collections }] : [];
    }
    return order;
  };

  it("states what is actually coming back, not the order total", async () => {
    const r = rig(cancelTable([ORDER], [{ captured_amount: 1298, refunded_amount: 0 }]));
    await sendOrderCanceled(args(r.container, OrderWorkflowEvents.CANCELED, { id: "order_1" }));
    expect(sent(r)).toMatchObject({
      template: TEMPLATE.orderCanceled,
      idempotency_key: "order-canceled:order_1",
      trigger_type: OrderWorkflowEvents.CANCELED,
    });
    expect(sent(r).data).toMatchObject({ currency: "inr", paid: 1298 });
  });

  it("nets an earlier partial refund out of the amount coming back", async () => {
    const r = rig(cancelTable([ORDER], [{ captured_amount: 1298, refunded_amount: 300 }]));
    await sendOrderCanceled(args(r.container, OrderWorkflowEvents.CANCELED, { id: "order_1" }));
    expect(sent(r).data.paid).toBe(998);
  });

  // An order cancelled before capture was never charged. `null` is the case the template words
  // differently; a zero would print "₹0.00 will be returned to you", which is nonsense.
  it("reports nothing charged as null, not zero", async () => {
    const r = rig(cancelTable([ORDER], [{ captured_amount: 0, refunded_amount: 0 }]));
    await sendOrderCanceled(args(r.container, OrderWorkflowEvents.CANCELED, { id: "order_1" }));
    expect(sent(r).data.paid).toBeNull();
  });

  it("skips the three ways the receipt does", async () => {
    const noId = rig(cancelTable([], []));
    await sendOrderCanceled(
      args(noId.container, OrderWorkflowEvents.CANCELED, {} as { id: string }),
    );
    expect(reason(noId)).toBe("[order-canceled] skipped: the event carried no order id");

    const gone = rig(cancelTable([], []));
    await sendOrderCanceled(args(gone.container, OrderWorkflowEvents.CANCELED, { id: "order_x" }));
    expect(reason(gone)).toBe("[order-canceled] skipped: order order_x no longer exists");

    const noEmail = rig(cancelTable([{ ...ORDER, email: null }], []));
    await sendOrderCanceled(
      args(noEmail.container, OrderWorkflowEvents.CANCELED, { id: "order_1" }),
    );
    expect(reason(noEmail)).toBe("[order-canceled] skipped: order order_1 has no e-mail address");
  });
});

describe("order-refunded", () => {
  const payment = (refunds: unknown[], refundedSoFar: number) => ({
    id: "pay_1",
    currency_code: "inr",
    refunds,
    payment_collection: { refunded_amount: refundedSoFar, order: { id: "order_1" } },
  });

  it("keys on the refund, not the payment, so a second partial still sends", async () => {
    const first = rig(
      table({
        payment: [
          payment([{ id: "ref_1", amount: 300, created_at: "2026-09-04T10:00:00.000Z" }], 300),
        ],
        order: [ORDER],
      }),
    );
    await sendOrderRefunded(args(first.container, PaymentEvents.REFUNDED, { id: "pay_1" }));
    expect(sent(first).idempotency_key).toBe("order-refunded:ref_1");
    expect(sent(first).data).toMatchObject({ amount: 300, full: false, currency: "inr" });

    const second = rig(
      table({
        payment: [
          payment(
            [
              { id: "ref_1", amount: 300, created_at: "2026-09-04T10:00:00.000Z" },
              { id: "ref_2", amount: 998, created_at: "2026-09-05T10:00:00.000Z" },
            ],
            1298,
          ),
        ],
        order: [ORDER],
      }),
    );
    await sendOrderRefunded(args(second.container, PaymentEvents.REFUNDED, { id: "pay_1" }));
    expect(sent(second).idempotency_key).toBe("order-refunded:ref_2");
    // "Full" is decided against everything refunded so far, so the closing half reads as the whole.
    expect(sent(second).data).toMatchObject({ amount: 998, full: true });
  });

  it("skips an event with no payment id", async () => {
    const r = rig(table({}));
    await sendOrderRefunded(args(r.container, PaymentEvents.REFUNDED, {} as { id: string }));
    expect(reason(r)).toBe("[order-refunded] skipped: the event carried no payment id");
  });

  it("skips a payment that no longer exists", async () => {
    const r = rig(table({}));
    await sendOrderRefunded(args(r.container, PaymentEvents.REFUNDED, { id: "pay_x" }));
    expect(reason(r)).toBe("[order-refunded] skipped: payment pay_x no longer exists");
  });

  it("skips a payment with no order behind its collection", async () => {
    const r = rig(table({ payment: [{ id: "pay_1", payment_collection: { order: null } }] }));
    await sendOrderRefunded(args(r.container, PaymentEvents.REFUNDED, { id: "pay_1" }));
    expect(reason(r)).toBe("[order-refunded] skipped: payment pay_1 belongs to no order");
  });

  it("skips a payment with no refund rows, and one whose refund is zero", async () => {
    const none = rig(table({ payment: [payment([], 0)], order: [ORDER] }));
    await sendOrderRefunded(args(none.container, PaymentEvents.REFUNDED, { id: "pay_1" }));
    expect(reason(none)).toBe("[order-refunded] skipped: payment pay_1 has no refund to report");

    const zero = rig(
      table({ payment: [payment([{ id: "ref_1", amount: 0 }], 0)], order: [ORDER] }),
    );
    await sendOrderRefunded(args(zero.container, PaymentEvents.REFUNDED, { id: "pay_1" }));
    expect(reason(zero)).toBe("[order-refunded] skipped: payment pay_1 has no refund to report");
  });

  it("skips when the order is gone or has no e-mail address", async () => {
    const gone = rig(table({ payment: [payment([{ id: "ref_1", amount: 300 }], 300)] }));
    await sendOrderRefunded(args(gone.container, PaymentEvents.REFUNDED, { id: "pay_1" }));
    expect(reason(gone)).toBe("[order-refunded] skipped: order order_1 no longer exists");

    const noEmail = rig(
      table({
        payment: [payment([{ id: "ref_1", amount: 300 }], 300)],
        order: [{ ...ORDER, email: null }],
      }),
    );
    await sendOrderRefunded(args(noEmail.container, PaymentEvents.REFUNDED, { id: "pay_1" }));
    expect(reason(noEmail)).toBe("[order-refunded] skipped: order order_1 has no e-mail address");
  });

  it("does not call a refund full on an order whose total is unknown", async () => {
    const r = rig(
      table({
        payment: [payment([{ id: "ref_1", amount: 300 }], 300)],
        order: [{ ...ORDER, total: 0 }],
      }),
    );
    await sendOrderRefunded(args(r.container, PaymentEvents.REFUNDED, { id: "pay_1" }));
    expect(sent(r).data.full).toBe(false);
  });
});

describe("password-reset", () => {
  const TOKEN = "eyJhbGciOiJIUzI1NiJ9.reset-token-payload.signature";
  const KEY = `password-reset:${createHash("sha256").update(TOKEN).digest("hex").slice(0, 32)}`;

  const event = (data: Record<string, unknown>) =>
    data as { entity_id: string; actor_type: string; token: string };

  it("links to the storefront reset page with the token and the address", async () => {
    const r = rig(table({}));
    await sendPasswordReset(
      args(
        r.container,
        AuthWorkflowEvents.PASSWORD_RESET,
        event({ entity_id: "meera@example.com", actor_type: "customer", token: TOKEN }),
      ),
    );
    expect(sent(r)).toMatchObject({
      to: "meera@example.com",
      template: TEMPLATE.passwordReset,
      idempotency_key: KEY,
      trigger_type: AuthWorkflowEvents.PASSWORD_RESET,
      resource_id: null,
    });
    expect(sent(r).data.url).toBe(
      `http://localhost:3000/account/reset?token=${encodeURIComponent(TOKEN)}` +
        `&email=${encodeURIComponent("meera@example.com")}`,
    );
  });

  it("percent-encodes an address that would otherwise break the query string", async () => {
    const r = rig(table({}));
    await sendPasswordReset(
      args(
        r.container,
        AuthWorkflowEvents.PASSWORD_RESET,
        event({ entity_id: "a+b@example.com", actor_type: "customer", token: TOKEN }),
      ),
    );
    expect(sent(r).data.url).toContain("email=a%2Bb%40example.com");
  });

  // The same workflow serves /auth/user/... An admin reset routed to the storefront page would
  // land somewhere that cannot accept it, and mailing an admin token to a customer page is worse
  // than sending nothing.
  it("refuses to mail an admin reset to the storefront page", async () => {
    const r = rig(table({}));
    await sendPasswordReset(
      args(
        r.container,
        AuthWorkflowEvents.PASSWORD_RESET,
        event({ entity_id: "admin@example.com", actor_type: "user", token: TOKEN }),
      ),
    );
    expect(r.createNotifications).not.toHaveBeenCalled();
    expect(reason(r)).toBe(
      '[password-reset] skipped: reset for actor type "user" is not a customer',
    );
  });

  it("skips an event with no identifier and one with no token", async () => {
    const noEmail = rig(table({}));
    await sendPasswordReset(
      args(
        noEmail.container,
        AuthWorkflowEvents.PASSWORD_RESET,
        event({ entity_id: "", actor_type: "customer", token: TOKEN }),
      ),
    );
    expect(reason(noEmail)).toBe("[password-reset] skipped: the event carried no identifier");

    const noToken = rig(table({}));
    await sendPasswordReset(
      args(
        noToken.container,
        AuthWorkflowEvents.PASSWORD_RESET,
        event({ entity_id: "meera@example.com", actor_type: "customer", token: "" }),
      ),
    );
    expect(reason(noToken)).toBe(
      "[password-reset] skipped: reset for meera@example.com carried no token",
    );
  });

  // THE TOKEN IS THE CREDENTIAL. It belongs in the URL and nowhere else -- not in a log line, and
  // not in the idempotency key, which is why the key is a hash of it.
  it("never writes the token into a log line or the idempotency key", async () => {
    const r = rig(table({}));
    await sendPasswordReset(
      args(
        r.container,
        AuthWorkflowEvents.PASSWORD_RESET,
        event({ entity_id: "", actor_type: "customer", token: TOKEN }),
      ),
    );
    expect(r.warn.mock.calls.flat().join(" ")).not.toContain(TOKEN);

    const ok = rig(table({}));
    await sendPasswordReset(
      args(
        ok.container,
        AuthWorkflowEvents.PASSWORD_RESET,
        event({ entity_id: "meera@example.com", actor_type: "customer", token: TOKEN }),
      ),
    );
    expect(sent(ok).idempotency_key).not.toContain(TOKEN);
    expect(sent(ok).idempotency_key).toBe(KEY);
  });

  // Asking twice must produce two working links; keying on the address would suppress the second.
  it("gives a second request its own key", async () => {
    const a = rig(table({}));
    await sendPasswordReset(
      args(
        a.container,
        AuthWorkflowEvents.PASSWORD_RESET,
        event({ entity_id: "meera@example.com", actor_type: "customer", token: TOKEN }),
      ),
    );
    const b = rig(table({}));
    await sendPasswordReset(
      args(
        b.container,
        AuthWorkflowEvents.PASSWORD_RESET,
        event({ entity_id: "meera@example.com", actor_type: "customer", token: `${TOKEN}2` }),
      ),
    );
    expect(sent(a).idempotency_key).not.toBe(sent(b).idempotency_key);
  });
});

describe("order-transfer-requested", () => {
  const CODE = "9f2c1a4e-77b1-4a0e-9f6d-2b3c4d5e6f70";

  const transferTable =
    (actions: unknown[], order: unknown[] = [ORDER]) =>
    (query: Graph): unknown[] => {
      if (query.entity === "order_change") return [{ id: "oc_1", actions }];
      if (query.entity === "order") return order;
      return [];
    };

  const action = (details: Record<string, unknown>) => ({
    action: ChangeActionType.TRANSFER_CUSTOMER,
    details,
  });

  it("sends the code to the address on the order, keyed on the order change", async () => {
    const r = rig(transferTable([action({ token: CODE, original_email: "guest@example.com" })]));
    await sendOrderTransferRequested(
      args(r.container, OrderWorkflowEvents.TRANSFER_REQUESTED, {
        id: "order_1",
        order_change_id: "oc_1",
      }),
    );
    expect(sent(r)).toMatchObject({
      to: "guest@example.com",
      template: TEMPLATE.orderTransferRequested,
      idempotency_key: "order-transfer-requested:oc_1",
      trigger_type: OrderWorkflowEvents.TRANSFER_REQUESTED,
      resource_id: "order_1",
    });
    expect(sent(r).data).toMatchObject({ code: CODE, orderId: "order_1" });
  });

  // A transfer that also changes the e-mail writes the new address onto the order. The
  // confirmation is the authorisation for the transfer, so it must reach whoever placed the order,
  // not whoever asked for it.
  it("prefers the original address over the one now on the order", async () => {
    const r = rig(
      transferTable(
        [
          action({
            token: CODE,
            original_email: "guest@example.com",
            new_email: "new@example.com",
          }),
        ],
        [{ ...ORDER, email: "new@example.com" }],
      ),
    );
    await sendOrderTransferRequested(
      args(r.container, OrderWorkflowEvents.TRANSFER_REQUESTED, {
        id: "order_1",
        order_change_id: "oc_1",
      }),
    );
    expect(sent(r).to).toBe("guest@example.com");
  });

  it("falls back to the order's address when the action carries no original", async () => {
    const r = rig(transferTable([action({ token: CODE })]));
    await sendOrderTransferRequested(
      args(r.container, OrderWorkflowEvents.TRANSFER_REQUESTED, {
        id: "order_1",
        order_change_id: "oc_1",
      }),
    );
    expect(sent(r).to).toBe("meera@example.com");
  });

  it("skips an event missing either id", async () => {
    const r = rig(transferTable([]));
    await sendOrderTransferRequested(
      args(r.container, OrderWorkflowEvents.TRANSFER_REQUESTED, { id: "order_1" } as {
        id: string;
        order_change_id: string;
      }),
    );
    expect(reason(r)).toBe(
      "[order-transfer-requested] skipped: the event carried no order or change id",
    );
  });

  // An order change with a different change type is somebody else's event; there is no token on it
  // and nothing to send.
  it("skips an order change with no transfer action", async () => {
    const r = rig(transferTable([{ action: "ITEM_ADD", details: {} }]));
    await sendOrderTransferRequested(
      args(r.container, OrderWorkflowEvents.TRANSFER_REQUESTED, {
        id: "order_1",
        order_change_id: "oc_1",
      }),
    );
    expect(reason(r)).toBe(
      "[order-transfer-requested] skipped: order change oc_1 has no transfer action",
    );
  });

  it("skips a transfer action carrying no token", async () => {
    const r = rig(transferTable([action({ original_email: "guest@example.com" })]));
    await sendOrderTransferRequested(
      args(r.container, OrderWorkflowEvents.TRANSFER_REQUESTED, {
        id: "order_1",
        order_change_id: "oc_1",
      }),
    );
    expect(reason(r)).toBe(
      "[order-transfer-requested] skipped: order change oc_1 carries no transfer token",
    );
  });

  it("skips when the order is gone, and when neither address exists", async () => {
    const gone = rig(transferTable([action({ token: CODE })], []));
    await sendOrderTransferRequested(
      args(gone.container, OrderWorkflowEvents.TRANSFER_REQUESTED, {
        id: "order_1",
        order_change_id: "oc_1",
      }),
    );
    expect(reason(gone)).toBe("[order-transfer-requested] skipped: order order_1 no longer exists");

    const noEmail = rig(transferTable([action({ token: CODE })], [{ ...ORDER, email: null }]));
    await sendOrderTransferRequested(
      args(noEmail.container, OrderWorkflowEvents.TRANSFER_REQUESTED, {
        id: "order_1",
        order_change_id: "oc_1",
      }),
    );
    expect(reason(noEmail)).toBe(
      "[order-transfer-requested] skipped: order order_1 has no e-mail address",
    );
  });
});

/* ------------------------------------------------------------------------------------------------
 * notify() and the dead-attempt sweep.
 *
 * The notification module de-duplicates on the idempotency key, and two of its states are traps.
 * A row left at FAILURE is reprocessed, but the retry's row id is filtered out of the insert, so
 * the provider sends and the call then throws on a row that does not exist -- with retries
 * configured, a duplicate e-mail per attempt. A row left at PENDING by a worker that died mid-send
 * is neither absent nor FAILURE, so the entry is dropped before the provider is reached and the
 * call succeeds having sent nothing.
 *
 * These six cases pin the whole decision table, because every one of them is invisible until the
 * day something actually crashes.
 * ---------------------------------------------------------------------------------------------- */

const RESET: Parameters<typeof notify<typeof TEMPLATE.passwordReset>>[1] = {
  template: TEMPLATE.passwordReset,
  to: "meera@example.com",
  data: { email: "meera@example.com", url: "http://localhost:3000/account/reset?token=t" },
  idempotencyKey: "password-reset:abc",
};

/** A notification row as `listNotifications` returns it; only four fields are ever read. */
function row(status: string, ageMs = 0) {
  return {
    id: "noti_1",
    status,
    created_at: new Date(Date.now() - ageMs),
    idempotency_key: RESET.idempotencyKey,
  };
}

describe("notify() when nothing has been tried before", () => {
  it("looks the key up once and sends", async () => {
    const r = rig(() => []);
    await notify(r.container, RESET);

    expect(r.listNotifications).toHaveBeenCalledTimes(1);
    expect(r.listNotifications.mock.calls[0][0]).toEqual({
      idempotency_key: "password-reset:abc",
    });
    expect(r.listNotifications.mock.calls[0][1]).toEqual({ take: 1 });
    expect(r.createNotifications).toHaveBeenCalledTimes(1);
    expect(sent(r).idempotency_key).toBe("password-reset:abc");
    expect(r.softDeleteNotifications).not.toHaveBeenCalled();
    expect(r.warn).not.toHaveBeenCalled();
  });
});

describe("notify() when the key has already been used", () => {
  it("sends nothing at all after a success", async () => {
    const r = rig(() => []);
    r.listNotifications.mockResolvedValueOnce([row("success")]);
    await notify(r.container, RESET);

    expect(r.createNotifications).not.toHaveBeenCalled();
    expect(r.softDeleteNotifications).not.toHaveBeenCalled();
  });

  // Without the sweep the module reprocesses this row, sends, and then throws NOT_FOUND on an id
  // it never inserted.
  it("retires a failed attempt so the key is free, then sends", async () => {
    const r = rig(() => []);
    r.listNotifications.mockResolvedValueOnce([row("failure")]);
    await notify(r.container, RESET);

    expect(r.softDeleteNotifications).toHaveBeenCalledWith(["noti_1"]);
    expect(r.createNotifications).toHaveBeenCalledTimes(1);
    expect(r.warn.mock.calls[0][0]).toBe(
      "[notify] retired failure notification noti_1 for password-reset:abc and is retrying the send.",
    );
  });

  // A worker killed between the insert and the provider call leaves this behind forever; without
  // the sweep every later attempt returns success having sent nothing.
  it("retires an abandoned pending row once it is old enough", async () => {
    const r = rig(() => []);
    r.listNotifications.mockResolvedValueOnce([row("pending", 61_000)]);
    await notify(r.container, RESET);

    expect(r.softDeleteNotifications).toHaveBeenCalledWith(["noti_1"]);
    expect(r.createNotifications).toHaveBeenCalledTimes(1);
  });

  // The other worker may still be inside its send. Throwing hands the job back to the bus, which
  // is the only outcome that neither duplicates the e-mail nor drops it.
  it("throws rather than racing a send that may still be in flight", async () => {
    const r = rig(() => []);
    r.listNotifications.mockResolvedValueOnce([row("pending", 5_000)]);

    await expect(notify(r.container, RESET)).rejects.toThrow(
      "Notification noti_1 for password-reset:abc is still in flight after 5s; " +
        "retrying later rather than sending twice.",
    );
    expect(r.createNotifications).not.toHaveBeenCalled();
    expect(r.softDeleteNotifications).not.toHaveBeenCalled();
  });

  // An unparseable date gives NaN, and NaN is not >= the threshold -- so it takes the safe branch
  // rather than sweeping a row that might be seconds old.
  it("treats an unreadable created_at as still in flight", async () => {
    const r = rig(() => []);
    r.listNotifications.mockResolvedValueOnce([
      { ...row("pending"), created_at: "not a date" as unknown as Date },
    ]);

    await expect(notify(r.container, RESET)).rejects.toThrow(
      "is still in flight after an unknown time",
    );
  });
});

describe("notify() on a notification module that cannot soft-delete", () => {
  // softDeleteNotifications is generated by MedusaService rather than declared on the published
  // interface, so a version bump could take it away. Losing it must cost the sweep, not the send.
  it("says so in the log and sends anyway", async () => {
    const r = rig(() => []);
    delete r.notificationModule.softDeleteNotifications;
    r.listNotifications.mockResolvedValueOnce([row("failure")]);
    await notify(r.container, RESET);

    expect(r.createNotifications).toHaveBeenCalledTimes(1);
    expect(r.warn.mock.calls[0][0]).toBe(
      "[notify] cannot retire failure notification noti_1: the notification module no longer " +
        "exposes softDeleteNotifications. Sending anyway.",
    );
  });
});
