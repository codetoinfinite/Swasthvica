import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  FULFILLMENT_FIELDS,
  ORDER_FIELDS,
  PAYMENT_FIELDS,
  address,
  capturedTotal,
  customerName,
  discountCode,
  head,
  latestRefund,
  lines,
  loadFulfillment,
  loadOrder,
  loadPayment,
  num,
  parcelLines,
  recipient,
  reference,
  totals,
  trackingNumbers,
  trackingUrl,
  type FulfillmentRow,
  type OrderRow,
  type PaymentRow,
} from "../_order";

/* ------------------------------------------------------------------------------------------------
 * The layer between a Medusa row and a customer's receipt.
 *
 * Everything here is a pure function over a shape that `query.graph` returns, which is exactly why
 * it is worth testing without a database: the failures this guards against are silent. A total read
 * off the wrong field still renders, still sends, and is only wrong by an amount nobody notices
 * until a customer does.
 * ---------------------------------------------------------------------------------------------- */

type Graph = { entity: string; fields: string[]; filters?: Record<string, unknown> };

/** A container that answers `query.graph` from a fixed table and records what it was asked. */
function fakeContainer(rows: Record<string, unknown[]>) {
  const calls: Graph[] = [];
  const container = {
    resolve(key: string) {
      if (key !== ContainerRegistrationKeys.QUERY) throw new Error(`unexpected resolve(${key})`);
      return {
        graph: async (args: Graph) => {
          calls.push(args);
          return { data: rows[args.entity] ?? [] };
        },
      };
    },
  } as unknown as MedusaContainer;
  return { container, calls };
}

const ORDER: OrderRow = {
  id: "order_1",
  display_id: 12,
  email: "meera@example.com",
  customer_id: "cus_1",
  currency_code: "inr",
  created_at: "2026-09-01T17:20:10.000Z",
  metadata: { draft_ref: "SV260901-K3M7Q" },
  items: [
    {
      title: "Hairfall Defense",
      variant_title: "200 ml",
      quantity: 2,
      total: 1298,
      adjustments: [{ code: "TWOBOTTLES" }],
    },
  ],
  shipping_address: {
    first_name: "Meera",
    last_name: "Rao",
    address_1: "12 Civil Lines",
    address_2: null,
    city: "Lucknow",
    province: "Uttar Pradesh",
    postal_code: "226001",
    country_code: "in",
    phone: "+919876543210",
  },
  shipping_methods: [{ adjustments: [{ code: "FREESHIPPING" }] }],
  total: 1298,
  original_item_total: 1298,
  item_discount_total: 0,
  shipping_total: 0,
  tax_total: 198,
};

describe("num", () => {
  it("passes a finite number through", () => {
    expect(num(1298)).toBe(1298);
    expect(num(0)).toBe(0);
    expect(num(-50.25)).toBe(-50.25);
  });

  it("parses the string form a BigNumber serialises to", () => {
    expect(num("1298")).toBe(1298);
    expect(num("7.25")).toBe(7.25);
  });

  it("reads the `numeric` getter off a BigNumber", () => {
    expect(num({ numeric: 649 })).toBe(649);
    expect(num({ numeric: "649.50" })).toBe(649.5);
  });

  it("reads the `{ value, precision }` raw form", () => {
    expect(num({ value: "1298.00", precision: 20 })).toBe(1298);
  });

  it("prefers `numeric` when both are present", () => {
    expect(num({ numeric: 10, value: "999" })).toBe(10);
  });

  // Every one of these would otherwise reach Intl.NumberFormat and render as "₹NaN".
  it("answers 0 for anything that is not a number", () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("not a number")).toBe(0);
    expect(num(Number.NaN)).toBe(0);
    expect(num(Number.POSITIVE_INFINITY)).toBe(0);
    expect(num(true)).toBe(0);
    expect(num({})).toBe(0);
    expect(num([])).toBe(0);
  });
});

describe("reference", () => {
  it("prefers the storefront reference, because /track only accepts that one", () => {
    expect(reference(ORDER)).toBe("SV260901-K3M7Q");
  });

  it("falls back to the display id", () => {
    expect(reference({ ...ORDER, metadata: null })).toBe("#12");
    expect(reference({ ...ORDER, metadata: { draft_ref: "   " } })).toBe("#12");
    expect(reference({ ...ORDER, metadata: {} })).toBe("#12");
  });

  it("falls back to the raw id when there is no display id either", () => {
    expect(reference({ id: "order_1", metadata: null })).toBe("#order_1");
  });

  it("ignores a non-string draft_ref rather than printing [object Object]", () => {
    expect(reference({ ...ORDER, metadata: { draft_ref: { nope: true } } })).toBe("#12");
  });
});

describe("customerName", () => {
  it("reads the shipping address", () => {
    expect(customerName(ORDER)).toBe("Meera Rao");
  });

  it("falls back to the billing address, which is where a guest checkout may put it", () => {
    const order: OrderRow = {
      ...ORDER,
      shipping_address: null,
      billing_address: { first_name: "Asha", last_name: null },
    };
    expect(customerName(order)).toBe("Asha");
  });

  it("answers null rather than an empty string when neither address names anyone", () => {
    expect(customerName({ id: "order_1" })).toBeNull();
    expect(customerName({ id: "order_1", shipping_address: { first_name: "  " } })).toBeNull();
  });
});

describe("recipient", () => {
  it("answers the trimmed address", () => {
    expect(recipient(ORDER)).toBe("meera@example.com");
    expect(recipient({ ...ORDER, email: "  meera@example.com  " })).toBe("meera@example.com");
  });

  // A column holding a single space is truthy. Sending it would reach the provider, which trims
  // it, finds nothing and throws -- and that throw is a job the bus retries forever.
  it("answers null for a blank address, not the blank itself", () => {
    expect(recipient({ ...ORDER, email: "   " })).toBeNull();
    expect(recipient({ ...ORDER, email: null })).toBeNull();
    expect(recipient({ id: "order_1" })).toBeNull();
  });
});

describe("head", () => {
  it("normalises a Date to ISO so the template's formatter gets one shape", () => {
    const at = new Date("2026-09-01T17:20:10.000Z");
    expect(head({ ...ORDER, created_at: at }).placedAt).toBe("2026-09-01T17:20:10.000Z");
  });

  it("keeps a string timestamp", () => {
    expect(head(ORDER).placedAt).toBe("2026-09-01T17:20:10.000Z");
  });

  it("answers null for a missing timestamp", () => {
    expect(head({ ...ORDER, created_at: null }).placedAt).toBeNull();
  });
});

describe("lines", () => {
  it("keeps a variant that says something the title does not", () => {
    expect(lines(ORDER)).toEqual([
      { title: "Hairfall Defense", variant: "200 ml", quantity: 2, total: 1298 },
    ]);
  });

  it("drops a variant that merely repeats the title", () => {
    const order: OrderRow = {
      ...ORDER,
      items: [{ title: "Hairfall Defense", variant_title: "Hairfall Defense", quantity: 1 }],
    };
    expect(lines(order)[0].variant).toBeNull();
  });

  it("falls back to the product title, then to a word rather than a blank", () => {
    const order: OrderRow = {
      ...ORDER,
      items: [{ product_title: "Herbal Shampoo", quantity: 1 }, { quantity: 1 }],
    };
    expect(lines(order).map((line) => line.title)).toEqual(["Herbal Shampoo", "Item"]);
  });

  it("answers an empty list for an order with no items", () => {
    expect(lines({ id: "order_1" })).toEqual([]);
    expect(lines({ id: "order_1", items: null })).toEqual([]);
  });
});

describe("address", () => {
  it("spells the country as a person writes it", () => {
    expect(address(ORDER)?.country).toBe("India");
  });

  it("keeps an unrecognised two-letter code rather than printing Unknown Region", () => {
    const order: OrderRow = {
      ...ORDER,
      shipping_address: { ...ORDER.shipping_address, country_code: "zz" },
    };
    expect(address(order)?.country).toBe("ZZ");
  });

  it("upper-cases anything that is not a two-letter code", () => {
    const order: OrderRow = {
      ...ORDER,
      shipping_address: { ...ORDER.shipping_address, country_code: "india" },
    };
    expect(address(order)?.country).toBe("INDIA");
  });

  it("falls back to the billing address", () => {
    const order: OrderRow = {
      ...ORDER,
      shipping_address: null,
      billing_address: { address_1: "9 Hazratganj", city: "Lucknow" },
    };
    expect(address(order)?.line1).toBe("9 Hazratganj");
  });

  it("answers null when the order has no address at all", () => {
    expect(address({ id: "order_1" })).toBeNull();
  });

  it("turns every blank field into null, which is the case a template answers for", () => {
    const order: OrderRow = {
      ...ORDER,
      shipping_address: { first_name: "Meera", address_1: "  ", city: "" },
    };
    expect(address(order)).toEqual({
      name: "Meera",
      line1: null,
      line2: null,
      city: null,
      province: null,
      postalCode: null,
      country: null,
      phone: null,
    });
  });
});

describe("discountCode", () => {
  it("prefers an item adjustment", () => {
    expect(discountCode(ORDER)).toBe("TWOBOTTLES");
  });

  it("falls back to a shipping adjustment", () => {
    expect(discountCode({ ...ORDER, items: [{ title: "x", adjustments: [] }] })).toBe(
      "FREESHIPPING",
    );
  });

  it("answers null when nothing was applied", () => {
    expect(discountCode({ id: "order_1" })).toBeNull();
    expect(discountCode({ ...ORDER, items: [], shipping_methods: [] })).toBeNull();
  });

  it("skips an adjustment with no code, which is what a manual admin discount leaves", () => {
    const order: OrderRow = {
      ...ORDER,
      items: [{ title: "x", adjustments: [{ code: null }, { code: "TWOBOTTLES" }] }],
      shipping_methods: [],
    };
    expect(discountCode(order)).toBe("TWOBOTTLES");
  });
});

describe("totals", () => {
  it("maps the five rows the receipt prints", () => {
    expect(totals(ORDER)).toEqual({
      currency: "inr",
      subtotal: 1298,
      discount: 0,
      discountCode: "TWOBOTTLES",
      shipping: 0,
      tax: 198,
      total: 1298,
    });
  });

  // The whole point of preferring item_discount_total over discount_total: a free-shipping
  // promotion must show up once, as a zero delivery line, and not a second time as a discount.
  it("closes: items - discount + delivery == total", () => {
    const order: OrderRow = {
      ...ORDER,
      original_item_total: 1398,
      item_discount_total: 100,
      shipping_total: 79,
      total: 1377,
    };
    const t = totals(order);
    expect(t.subtotal - t.discount + t.shipping).toBe(t.total);
  });

  it("reads BigNumber-shaped money", () => {
    const order: OrderRow = {
      ...ORDER,
      original_item_total: { numeric: 1298 },
      item_discount_total: { value: "0", precision: 20 },
      total: "1298",
    };
    expect(totals(order).subtotal).toBe(1298);
    expect(totals(order).discount).toBe(0);
    expect(totals(order).total).toBe(1298);
  });

  it("defaults the currency rather than formatting money with an empty code", () => {
    expect(totals({ id: "order_1" }).currency).toBe("inr");
    expect(totals({ id: "order_1", currency_code: "  " }).currency).toBe("inr");
  });
});

describe("loadOrder", () => {
  it("asks for the order by id and returns the first row", async () => {
    const { container, calls } = fakeContainer({ order: [ORDER] });
    await expect(loadOrder(container, "order_1")).resolves.toEqual(ORDER);
    expect(calls[0]).toEqual({ entity: "order", fields: ORDER_FIELDS, filters: { id: "order_1" } });
  });

  it("answers null for an order that has been deleted", async () => {
    const { container } = fakeContainer({});
    await expect(loadOrder(container, "order_gone")).resolves.toBeNull();
  });
});

describe("trackingNumbers", () => {
  const withLabels = (labels: FulfillmentRow["labels"]): FulfillmentRow => ({
    id: "ful_1",
    labels,
  });

  it("de-duplicates, because one parcel can carry two label rows for one AWB", () => {
    expect(
      trackingNumbers(
        withLabels([
          { tracking_number: "AWB1" },
          { tracking_number: "AWB1" },
          { tracking_number: "AWB2" },
        ]),
      ),
    ).toEqual(["AWB1", "AWB2"]);
  });

  it("drops blanks and trims", () => {
    expect(
      trackingNumbers(
        withLabels([
          { tracking_number: "  " },
          { tracking_number: null },
          { tracking_number: " A " },
        ]),
      ),
    ).toEqual(["A"]);
  });

  it("answers an empty list rather than throwing on a fulfilment with no labels", () => {
    expect(trackingNumbers({ id: "ful_1" })).toEqual([]);
    expect(trackingNumbers({ id: "ful_1", labels: null })).toEqual([]);
  });
});

describe("trackingUrl", () => {
  it("returns the first non-blank url", () => {
    expect(
      trackingUrl({
        id: "ful_1",
        labels: [{ tracking_url: "  " }, { tracking_url: "https://track/1" }],
      }),
    ).toBe("https://track/1");
  });

  it("answers null when no label carries one", () => {
    expect(trackingUrl({ id: "ful_1", labels: [{ tracking_number: "AWB1" }] })).toBeNull();
    expect(trackingUrl({ id: "ful_1" })).toBeNull();
  });
});

describe("parcelLines", () => {
  // A dispatch note lists what is in the box, not what it cost -- there is no price on a
  // fulfilment item and no variant either, so both are constant here by design.
  it("lists the fulfilment's own items with no price and no variant", () => {
    expect(
      parcelLines({
        id: "ful_1",
        items: [{ title: "Hairfall Defense", quantity: 2 }, { quantity: "1" }],
      }),
    ).toEqual([
      { title: "Hairfall Defense", variant: null, quantity: 2, total: 0 },
      { title: "Item", variant: null, quantity: 1, total: 0 },
    ]);
  });

  it("answers an empty list for a fulfilment with no items", () => {
    expect(parcelLines({ id: "ful_1" })).toEqual([]);
  });
});

describe("loadFulfillment", () => {
  it("asks for the fulfilment by id, including the linked order", async () => {
    const row: FulfillmentRow = { id: "ful_1", order: { id: "order_1" } };
    const { container, calls } = fakeContainer({ fulfillment: [row] });
    await expect(loadFulfillment(container, "ful_1")).resolves.toEqual(row);
    expect(calls[0]).toEqual({
      entity: "fulfillment",
      fields: FULFILLMENT_FIELDS,
      filters: { id: "ful_1" },
    });
    expect(FULFILLMENT_FIELDS).toContain("order.id");
  });

  it("answers null when there is no such fulfilment", async () => {
    const { container } = fakeContainer({});
    await expect(loadFulfillment(container, "ful_gone")).resolves.toBeNull();
  });
});

describe("latestRefund", () => {
  it("picks the newest refund, which is the one the event is about", () => {
    const payment: PaymentRow = {
      id: "pay_1",
      refunds: [
        { id: "ref_1", amount: 100, created_at: "2026-09-01T10:00:00.000Z" },
        { id: "ref_2", amount: 250, created_at: "2026-09-03T10:00:00.000Z" },
        { id: "ref_3", amount: 50, created_at: "2026-09-02T10:00:00.000Z" },
      ],
    };
    expect(latestRefund(payment)).toEqual({ id: "ref_2", amount: 250 });
  });

  it("accepts a Date as well as a string", () => {
    const payment: PaymentRow = {
      id: "pay_1",
      refunds: [
        { id: "ref_1", amount: 100, created_at: new Date("2026-09-01T10:00:00.000Z") },
        { id: "ref_2", amount: 250, created_at: new Date("2026-09-03T10:00:00.000Z") },
      ],
    };
    expect(latestRefund(payment)?.id).toBe("ref_2");
  });

  it("tolerates a missing or unparseable timestamp by taking the last such row", () => {
    const payment: PaymentRow = {
      id: "pay_1",
      refunds: [
        { id: "ref_1", amount: 100 },
        { id: "ref_2", amount: 250, created_at: "not a date" },
      ],
    };
    expect(latestRefund(payment)).toEqual({ id: "ref_2", amount: 250 });
  });

  it("skips a row with no id, because the id is what the notification is keyed on", () => {
    const payment: PaymentRow = {
      id: "pay_1",
      refunds: [
        { amount: 999, created_at: "2026-09-09T10:00:00.000Z" },
        { id: "ref_1", amount: 10 },
      ],
    };
    expect(latestRefund(payment)).toEqual({ id: "ref_1", amount: 10 });
  });

  it("answers null when there is nothing to report", () => {
    expect(latestRefund({ id: "pay_1" })).toBeNull();
    expect(latestRefund({ id: "pay_1", refunds: [] })).toBeNull();
    expect(latestRefund({ id: "pay_1", refunds: [{ amount: 10 }] })).toBeNull();
  });

  it("reads a BigNumber amount", () => {
    const payment: PaymentRow = {
      id: "pay_1",
      refunds: [{ id: "ref_1", amount: { numeric: 649 } }],
    };
    expect(latestRefund(payment)?.amount).toBe(649);
  });
});

describe("loadPayment", () => {
  it("asks for the payment by id, reaching the order through the payment collection", async () => {
    const row: PaymentRow = { id: "pay_1", payment_collection: { order: { id: "order_1" } } };
    const { container, calls } = fakeContainer({ payment: [row] });
    await expect(loadPayment(container, "pay_1")).resolves.toEqual(row);
    expect(calls[0]).toEqual({
      entity: "payment",
      fields: PAYMENT_FIELDS,
      filters: { id: "pay_1" },
    });
    // `captured_amount` and `refunded_amount` are columns on the collection, not the payment: the
    // DTO declares them on the payment and query.graph silently drops them. Asking for them there
    // would produce "nothing was charged" on a paid order, so the field list must not regress.
    expect(PAYMENT_FIELDS).toContain("payment_collection.refunded_amount");
    expect(PAYMENT_FIELDS).not.toContain("refunded_amount");
    expect(PAYMENT_FIELDS).not.toContain("captured_amount");
  });

  it("answers null when there is no such payment", async () => {
    const { container } = fakeContainer({});
    await expect(loadPayment(container, "pay_gone")).resolves.toBeNull();
  });
});

describe("capturedTotal", () => {
  it("answers captured minus refunded, summed across collections", async () => {
    const { container, calls } = fakeContainer({
      order: [
        {
          id: "order_1",
          payment_collections: [
            { captured_amount: 1298, refunded_amount: 0 },
            { captured_amount: 500, refunded_amount: 200 },
          ],
        },
      ],
    });
    await expect(capturedTotal(container, "order_1")).resolves.toBe(1598);
    expect(calls[0].fields).toEqual([
      "id",
      "payment_collections.captured_amount",
      "payment_collections.refunded_amount",
    ]);
  });

  // null, not 0: the template says "nothing was charged" in one case and names an amount in the
  // other, and those are different sentences.
  it("answers null when nothing was ever taken", async () => {
    const { container } = fakeContainer({
      order: [{ id: "order_1", payment_collections: [{ captured_amount: 0, refunded_amount: 0 }] }],
    });
    await expect(capturedTotal(container, "order_1")).resolves.toBeNull();
  });

  it("answers null when the money has all been refunded already", async () => {
    const { container } = fakeContainer({
      order: [
        { id: "order_1", payment_collections: [{ captured_amount: 1298, refunded_amount: 1298 }] },
      ],
    });
    await expect(capturedTotal(container, "order_1")).resolves.toBeNull();
  });

  it("answers null for an order with no payment collection and for one that is gone", async () => {
    const empty = fakeContainer({ order: [{ id: "order_1", payment_collections: [] }] });
    await expect(capturedTotal(empty.container, "order_1")).resolves.toBeNull();

    const missing = fakeContainer({});
    await expect(capturedTotal(missing.container, "order_1")).resolves.toBeNull();
  });

  it("reads BigNumber-shaped amounts", async () => {
    const { container } = fakeContainer({
      order: [
        {
          id: "order_1",
          payment_collections: [{ captured_amount: { numeric: 1298 }, refunded_amount: "0" }],
        },
      ],
    });
    await expect(capturedTotal(container, "order_1")).resolves.toBe(1298);
  });
});
