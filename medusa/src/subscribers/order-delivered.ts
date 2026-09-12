import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework/subscribers";
import { FulfillmentWorkflowEvents } from "@medusajs/framework/utils";
import { TEMPLATE } from "../modules/resend/templates";
import { notify, skip } from "./_notify";
import { head, loadFulfillment, loadOrder, recipient } from "./_order";

/**
 * The delivery note.
 *
 * Same shape as the dispatch note -- a fulfilment id, resolved to an order through the link module
 * -- and keyed on the fulfilment for the same reason: two parcels means two deliveries, and the
 * customer should hear about both.
 *
 * `delivered_at` is read back off the fulfilment rather than taken as "now", because the delivery
 * may have been recorded hours after it happened, and a note that says the wrong day is worse than
 * one that says no day at all.
 */
export default async function sendOrderDelivered({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const fulfillmentId = event.data?.id;
  if (!fulfillmentId) {
    return skip(container, "order-delivered", "the event carried no fulfilment id");
  }

  const fulfillment = await loadFulfillment(container, fulfillmentId);
  if (!fulfillment) {
    return skip(container, "order-delivered", `fulfilment ${fulfillmentId} no longer exists`);
  }

  const orderId = fulfillment.order?.id;
  if (!orderId) {
    return skip(container, "order-delivered", `fulfilment ${fulfillmentId} belongs to no order`);
  }

  const order = await loadOrder(container, orderId);
  if (!order) return skip(container, "order-delivered", `order ${orderId} no longer exists`);
  const to = recipient(order);
  if (!to) {
    return skip(container, "order-delivered", `order ${orderId} has no e-mail address`);
  }

  const delivered = fulfillment.delivered_at;

  await notify(container, {
    template: TEMPLATE.orderDelivered,
    to,
    idempotencyKey: `order-delivered:${fulfillment.id}`,
    resource: { id: order.id, type: "order" },
    receiverId: order.customer_id ?? null,
    triggerType: FulfillmentWorkflowEvents.DELIVERY_CREATED,
    data: {
      ...head(order),
      deliveredAt:
        delivered instanceof Date
          ? delivered.toISOString()
          : typeof delivered === "string" && delivered.trim().length > 0
            ? delivered
            : null,
    },
  });
}

export const config: SubscriberConfig = {
  event: FulfillmentWorkflowEvents.DELIVERY_CREATED,
  context: { subscriberId: "resend-order-delivered" },
};
