import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework/subscribers";
import { OrderWorkflowEvents } from "@medusajs/framework/utils";
import { TEMPLATE } from "../modules/resend/templates";
import { notify, skip } from "./_notify";
import { capturedTotal, head, loadOrder, recipient, totals } from "./_order";

/**
 * The cancellation.
 *
 * The only figure this e-mail states is what is actually coming back, and that is not the order
 * total: an order cancelled before capture was never charged, and one cancelled after a partial
 * refund has already had some of it returned. `capturedTotal()` reads captured minus refunded off
 * the payment collections and answers `null` when nothing was ever taken, which is the case the
 * template words differently rather than printing a zero.
 */
export default async function sendOrderCanceled({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data?.id;
  if (!orderId) return skip(container, "order-canceled", "the event carried no order id");

  const order = await loadOrder(container, orderId);
  if (!order) return skip(container, "order-canceled", `order ${orderId} no longer exists`);
  const to = recipient(order);
  if (!to) {
    return skip(container, "order-canceled", `order ${orderId} has no e-mail address`);
  }

  await notify(container, {
    template: TEMPLATE.orderCanceled,
    to,
    idempotencyKey: `order-canceled:${order.id}`,
    resource: { id: order.id, type: "order" },
    receiverId: order.customer_id ?? null,
    triggerType: OrderWorkflowEvents.CANCELED,
    data: {
      ...head(order),
      currency: totals(order).currency,
      paid: await capturedTotal(container, order.id),
    },
  });
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.CANCELED,
  context: { subscriberId: "resend-order-canceled" },
};
