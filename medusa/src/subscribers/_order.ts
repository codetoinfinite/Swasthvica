import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Address, OrderLine } from "../modules/resend/templates/types";

/* ------------------------------------------------------------------------------------------------
 * One order, turned into the flat data an e-mail template reads.
 *
 * Five of the seven e-mails start from an order id and need the same things out of it: what the
 * customer quotes, what they bought, where it is going and what they paid. Doing that once means a
 * cancellation and a confirmation cannot disagree about the reference, and it means the totals
 * mapping below -- the part that is genuinely easy to get wrong -- is written down in one place.
 *
 * WHY THE TOTALS MAPPING IS NOT THE OBVIOUS ONE. The storefront's receipt (src/lib/cart.ts
 * `totals()`, printed by Confirmation.tsx) shows "Items" as the tax-INCLUSIVE list price sum,
 * because this catalogue is priced tax-inclusive. Medusa's `order.subtotal` is the opposite: it is
 * the net-of-tax figure, because line-item/index.js divides a tax-inclusive unit price by
 * (1 + rate) to produce it. Mailing `subtotal` would therefore quote a smaller "Items" figure than
 * the page the customer just paid on, which reads as a billing error.
 *
 * The fields that do reproduce it, all read off totals/cart/index.js `decorateCartTotals` (orders
 * run through the same function -- order-module-service.js calls it):
 *
 *   Items            original_item_total    Sum of each item's `original_total`, which for a
 *                                           tax-inclusive item is exactly unit_price x quantity.
 *   Discount         item_discount_total    Item-level discount, tax-inclusive. NOT `discount_total`:
 *                                           that one also folds in shipping-method discounts, so a
 *                                           free-shipping promotion would be counted twice -- once
 *                                           as a discount and again as a lower delivery line.
 *   Delivery         shipping_total         Already net of any shipping discount, so a free-shipping
 *                                           promotion shows up here as "Free", as it does on the page.
 *   GST (included)   tax_total              Items' tax plus shipping's tax. Shown, never added.
 *   Total            total                  What was charged.
 *
 * And the arithmetic closes: original_item_total - item_discount_total + shipping_total == total,
 * for the reason decorateCartTotals computes `total` as subtotal + tax - discount_subtotal.
 *
 * Requesting any total field makes the order module join items, tax lines, adjustments and shipping
 * methods on its own (`addRelationsToCalculateTotals`), which is why ORDER_FIELDS does not ask for
 * them and why the adjustment codes below are there to be read.
 * ---------------------------------------------------------------------------------------------- */

/**
 * Every money field on an order is a `BigNumberValue`: `number | string | BigNumber`, and which one
 * arrives depends on how far the value travelled. Arithmetic or `Intl.NumberFormat` on the object
 * form silently yields NaN, so nothing reads a total without going through here first.
 */
export function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object") {
    // A BigNumber exposes `numeric`; its serialised raw form is `{ value, precision }`.
    const box = value as { numeric?: unknown; value?: unknown };
    if (typeof box.numeric === "number" || typeof box.numeric === "string") return num(box.numeric);
    if (typeof box.value === "number" || typeof box.value === "string") return num(box.value);
  }
  return 0;
}

type AddressRow = {
  first_name?: string | null;
  last_name?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  phone?: string | null;
};

type AdjustmentRow = { code?: string | null };

type ItemRow = {
  title?: string | null;
  product_title?: string | null;
  variant_title?: string | null;
  quantity?: unknown;
  total?: unknown;
  adjustments?: AdjustmentRow[] | null;
};

/**
 * What `loadOrder` returns.
 *
 * Structural, not `OrderDTO`. The shape that comes back from `query.graph` is whatever `fields`
 * asked for, so typing it as the full DTO would promise fields that are not there -- and the
 * failure would be a blank line in a customer's receipt rather than a compile error.
 */
export type OrderRow = {
  id: string;
  display_id?: number | null;
  email?: string | null;
  customer_id?: string | null;
  currency_code?: string | null;
  created_at?: string | Date | null;
  canceled_at?: string | Date | null;
  metadata?: Record<string, unknown> | null;
  items?: ItemRow[] | null;
  shipping_address?: AddressRow | null;
  billing_address?: AddressRow | null;
  shipping_methods?: { adjustments?: AdjustmentRow[] | null }[] | null;
  total?: unknown;
  original_item_total?: unknown;
  item_discount_total?: unknown;
  shipping_total?: unknown;
  tax_total?: unknown;
};

/** Asked for by every order e-mail. Totals pull their own relations in; see the note above. */
export const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "customer_id",
  "currency_code",
  "created_at",
  "canceled_at",
  "metadata",
  "total",
  "original_item_total",
  "item_discount_total",
  "shipping_total",
  "tax_total",
  "items.*",
  "items.adjustments.*",
  "shipping_methods.adjustments.*",
  "shipping_address.*",
  "billing_address.*",
];

/** The order behind an event, or `null` when it has since been deleted. */
export async function loadOrder(
  container: MedusaContainer,
  orderId: string,
): Promise<OrderRow | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { id: orderId },
  });
  return (data as unknown as OrderRow[])[0] ?? null;
}

const text = (value: unknown): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * What the customer quotes when they write in.
 *
 * The storefront's own reference first, because that is the string POST /store/track accepts and
 * the one printed on the confirmation page they have already seen. `#12` only when there is none --
 * an order placed straight through the admin, say.
 */
export function reference(order: OrderRow): string {
  return text(order.metadata?.draft_ref) ?? `#${order.display_id ?? order.id}`;
}

/**
 * The address to send to, or nothing.
 *
 * `!order.email` is not the same test. A column holding a single space is truthy, passes that
 * check, and reaches the provider, which trims it, finds nothing, and throws -- and a throw inside
 * the provider is a notification on FAILURE and a job the bus retries forever, because the next
 * attempt reads the same blank column. Trimming here turns that into one skipped e-mail and one
 * line in the log.
 */
export function recipient(order: OrderRow): string | null {
  return text(order.email);
}

/** A country as a person writes it, falling back to the code when ICU does not know it. */
function countryName(code: string | null): string | null {
  if (!code || code.trim().length !== 2) return code ? code.trim().toUpperCase() : null;
  const upper = code.trim().toUpperCase();
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(upper);
    return name && name !== upper && !name.startsWith("Unknown") ? name : upper;
  } catch {
    return upper;
  }
}

function personName(address: AddressRow | null | undefined): string | null {
  if (!address) return null;
  const name = [text(address.first_name), text(address.last_name)].filter(Boolean).join(" ");
  return name.length > 0 ? name : null;
}

/**
 * Who to address.
 *
 * Taken from the address rather than from the customer record, because there is no customer
 * relation on an order in query.graph (the order module's joiner config declares none, and no link
 * module supplies one) -- and because a guest checkout has no customer record at all, while every
 * checkout has a name on the parcel.
 */
export function customerName(order: OrderRow): string | null {
  return personName(order.shipping_address) ?? personName(order.billing_address);
}

/** The three identifiers every order e-mail carries. */
export function head(order: OrderRow): {
  reference: string;
  placedAt: string | null;
  customerName: string | null;
} {
  const placed = order.created_at;
  return {
    reference: reference(order),
    placedAt: placed instanceof Date ? placed.toISOString() : (text(placed) ?? null),
    customerName: customerName(order),
  };
}

/**
 * The items.
 *
 * `title` on an order line is already the resolved product title at the time of purchase, and
 * `variant_title` is repeated into it often enough that showing both would read as a stutter -- so
 * the variant is dropped when it says nothing the title does not.
 */
export function lines(order: OrderRow): OrderLine[] {
  return (order.items ?? []).map((item) => {
    const title = text(item.title) ?? text(item.product_title) ?? "Item";
    const variant = text(item.variant_title);
    return {
      title,
      variant: variant && variant !== title ? variant : null,
      quantity: num(item.quantity),
      total: num(item.total),
    };
  });
}

/** Where it is going. `null` when the order carries no address at all. */
export function address(order: OrderRow): Address | null {
  const row = order.shipping_address ?? order.billing_address;
  if (!row) return null;
  return {
    name: personName(row),
    line1: text(row.address_1),
    line2: text(row.address_2),
    city: text(row.city),
    province: text(row.province),
    postalCode: text(row.postal_code),
    country: countryName(text(row.country_code)),
    phone: text(row.phone),
  };
}

/**
 * The promotion code that was applied, for the discount line.
 *
 * Read off the adjustments the order itself carries rather than the linked `promotions` alias:
 * the adjustment records the code as it was entered at checkout, it lives inside the order module
 * so no link has to resolve, and it is already joined by the totals request.
 */
export function discountCode(order: OrderRow): string | null {
  const adjustments = [
    ...(order.items ?? []).flatMap((item) => item.adjustments ?? []),
    ...(order.shipping_methods ?? []).flatMap((method) => method.adjustments ?? []),
  ];
  for (const adjustment of adjustments) {
    const code = text(adjustment.code);
    if (code) return code;
  }
  return null;
}

/** The receipt block, mapped as the file header sets out. */
export function totals(order: OrderRow): {
  currency: string;
  subtotal: number;
  discount: number;
  discountCode: string | null;
  shipping: number;
  tax: number;
  total: number;
} {
  return {
    currency: text(order.currency_code) ?? "inr",
    subtotal: num(order.original_item_total),
    discount: num(order.item_discount_total),
    discountCode: discountCode(order),
    shipping: num(order.shipping_total),
    tax: num(order.tax_total),
    total: num(order.total),
  };
}

/* ---------------------------------------------------------------------------------------------
 * The three things that are not an order but point at one.
 *
 * `shipment.created`, `delivery.created` and `payment.refunded` all arrive holding an id from a
 * different module, and none of those modules knows about orders: the association lives in a link
 * module, which publishes it as a field alias on the entity query.graph already understands.
 * Both hops below were checked against a live database rather than inferred --
 * `payment.payment_collection.order.id` and `fulfillment.order.id` resolve, and the amount fields
 * that look like they belong on a payment (`captured_amount`, `refunded_amount`) are in fact
 * columns on the payment *collection*, which is why they are read from there.
 * ------------------------------------------------------------------------------------------- */

type LabelRow = { tracking_number?: string | null; tracking_url?: string | null };

export type FulfillmentRow = {
  id: string;
  canceled_at?: string | Date | null;
  shipped_at?: string | Date | null;
  delivered_at?: string | Date | null;
  labels?: LabelRow[] | null;
  items?: { title?: string | null; quantity?: unknown }[] | null;
  order?: { id?: string | null } | null;
};

export const FULFILLMENT_FIELDS = [
  "id",
  "canceled_at",
  "shipped_at",
  "delivered_at",
  "labels.tracking_number",
  "labels.tracking_url",
  "items.title",
  "items.quantity",
  "order.id",
];

export async function loadFulfillment(
  container: MedusaContainer,
  fulfillmentId: string,
): Promise<FulfillmentRow | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "fulfillment",
    fields: FULFILLMENT_FIELDS,
    filters: { id: fulfillmentId },
  });
  return (data as unknown as FulfillmentRow[])[0] ?? null;
}

/** Every distinct AWB on the fulfilment, in the order the provider recorded them. */
export function trackingNumbers(fulfillment: FulfillmentRow): string[] {
  const seen = new Set<string>();
  for (const row of fulfillment.labels ?? []) {
    const number = text(row.tracking_number);
    if (number) seen.add(number);
  }
  return [...seen];
}

/** The first tracking URL the provider gave, if any. Validated as http(s) by the template. */
export function trackingUrl(fulfillment: FulfillmentRow): string | null {
  for (const row of fulfillment.labels ?? []) {
    const url = text(row.tracking_url);
    if (url) return url;
  }
  return null;
}

/**
 * What is in this parcel.
 *
 * The fulfilment's own items, not the order's: a split shipment sends two dispatch notes and each
 * one has to list what is actually in that box. There is no price column on a dispatch note and no
 * variant on a fulfilment item, so `total` is never read and `variant` is always null.
 */
export function parcelLines(fulfillment: FulfillmentRow): OrderLine[] {
  return (fulfillment.items ?? []).map((item) => ({
    title: text(item.title) ?? "Item",
    variant: null,
    quantity: num(item.quantity),
    total: 0,
  }));
}

export type PaymentRow = {
  id: string;
  currency_code?: string | null;
  refunds?: { id?: string | null; amount?: unknown; created_at?: string | Date | null }[] | null;
  payment_collection?: {
    refunded_amount?: unknown;
    order?: { id?: string | null } | null;
  } | null;
};

export const PAYMENT_FIELDS = [
  "id",
  "currency_code",
  "refunds.id",
  "refunds.amount",
  "refunds.created_at",
  "payment_collection.refunded_amount",
  "payment_collection.order.id",
];

export async function loadPayment(
  container: MedusaContainer,
  paymentId: string,
): Promise<PaymentRow | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "payment",
    fields: PAYMENT_FIELDS,
    filters: { id: paymentId },
  });
  return (data as unknown as PaymentRow[])[0] ?? null;
}

/**
 * The refund that just happened.
 *
 * `payment.refunded` carries only the payment id, so the refund itself has to be recovered -- and
 * it has to be, because a second partial refund on the same payment is a second e-mail. Keying the
 * notification on the payment would silently suppress it; keying on the refund row does not. The
 * newest refund is the one the event is about.
 */
export function latestRefund(payment: PaymentRow): { id: string; amount: number } | null {
  let newest: { id: string; amount: number; at: number } | null = null;
  for (const row of payment.refunds ?? []) {
    const id = text(row.id);
    if (!id) continue;
    const at = row.created_at ? new Date(row.created_at).getTime() : 0;
    const when = Number.isFinite(at) ? at : 0;
    if (!newest || when >= newest.at) newest = { id, amount: num(row.amount), at: when };
  }
  return newest ? { id: newest.id, amount: newest.amount } : null;
}

/**
 * What has actually been taken from the customer for this order, or `null` if nothing has.
 *
 * Read off the payment collections rather than the payments: `captured_amount` is a column there
 * and is maintained by the payment module every time a capture or refund lands. `null` rather than
 * zero, because the cancellation e-mail says "nothing was charged" in one case and names an amount
 * in the other, and those are different sentences.
 */
export async function capturedTotal(
  container: MedusaContainer,
  orderId: string,
): Promise<number | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "payment_collections.captured_amount", "payment_collections.refunded_amount"],
    filters: { id: orderId },
  });
  const collections = (data as unknown as { payment_collections?: unknown[] }[])[0]
    ?.payment_collections;
  if (!collections?.length) return null;
  let captured = 0;
  for (const row of collections) {
    const box = row as { captured_amount?: unknown; refunded_amount?: unknown };
    captured += num(box.captured_amount) - num(box.refunded_amount);
  }
  return captured > 0 ? captured : null;
}
