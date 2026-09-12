import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework/subscribers";
import { FulfillmentWorkflowEvents } from "@medusajs/framework/utils";
import { TERMS } from "../lib/brand";
import { TEMPLATE } from "../modules/resend/templates";
import { notify, skip } from "./_notify";
import {
  head,
  loadFulfillment,
  loadOrder,
  parcelLines,
  recipient,
  trackingNumbers,
  trackingUrl,
} from "./_order";

/**
 * The dispatch note.
 *
 * `shipment.created` carries a *fulfilment* id, not an order id -- the fulfilment module knows
 * nothing about orders, and the association comes back through the order-fulfillment link module's
 * `order` field alias. A split shipment produces one event and one e-mail per parcel, which is why
 * the key is the fulfilment and the item list is the fulfilment's, not the order's.
 *
 * `no_notification` is set by an admin who packs an order without wanting the customer told
 * (a replacement, a re-ship after a courier loss). Honouring it is the whole point of the flag.
 *
 * The courier name comes from TERMS for now. Shiprocket (docs/BACKEND-PLAN.md 8) will report the
 * real one per parcel and supersede this; until then it is null and the template says "the
 * courier", which is true, rather than naming one that might be wrong.
 */
export default async function sendOrderShipped({
  event,
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  const fulfillmentId = event.data?.id;
  if (!fulfillmentId) return skip(container, "order-shipped", "the event carried no fulfilment id");
  if (event.data.no_notification) {
    return skip(
      container,
      "order-shipped",
      `fulfilment ${fulfillmentId} asked for no notification`,
    );
  }

  const fulfillment = await loadFulfillment(container, fulfillmentId);
  if (!fulfillment) {
    return skip(container, "order-shipped", `fulfilment ${fulfillmentId} no longer exists`);
  }

  const orderId = fulfillment.order?.id;
  if (!orderId) {
    return skip(container, "order-shipped", `fulfilment ${fulfillmentId} belongs to no order`);
  }

  const order = await loadOrder(container, orderId);
  if (!order) return skip(container, "order-shipped", `order ${orderId} no longer exists`);
  const to = recipient(order);
  if (!to) {
    return skip(container, "order-shipped", `order ${orderId} has no e-mail address`);
  }

  await notify(container, {
    template: TEMPLATE.orderShipped,
    to,
    idempotencyKey: `order-shipped:${fulfillment.id}`,
    resource: { id: order.id, type: "order" },
    receiverId: order.customer_id ?? null,
    triggerType: FulfillmentWorkflowEvents.SHIPMENT_CREATED,
    data: {
      ...head(order),
      courier: TERMS.courier,
      trackingNumbers: trackingNumbers(fulfillment),
      trackingUrl: trackingUrl(fulfillment),
      lines: parcelLines(fulfillment),
    },
  });
}

export const config: SubscriberConfig = {
  event: FulfillmentWorkflowEvents.SHIPMENT_CREATED,
  context: { subscriberId: "resend-order-shipped" },
};
