import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework/subscribers";
import { OrderWorkflowEvents } from "@medusajs/framework/utils";
import { TEMPLATE } from "../modules/resend/templates";
import { notify, skip } from "./_notify";
import { address, head, lines, loadOrder, recipient, totals } from "./_order";

/**
 * The receipt, sent when an order is placed.
 *
 * `order.placed` fires after payment is authorised and the order row exists, which is the earliest
 * moment everything this e-mail states is true. The storefront has already shown the customer the
 * same figures on /order/confirmation, so the totals mapping in _order.ts is what keeps the two
 * agreeing -- see the header there for why it is not the obvious set of fields.
 */
export default async function sendOrderPlaced({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data?.id;
  if (!orderId) return skip(container, "order-placed", "the event carried no order id");

  const order = await loadOrder(container, orderId);
  if (!order) return skip(container, "order-placed", `order ${orderId} no longer exists`);
  const to = recipient(order);
  if (!to) return skip(container, "order-placed", `order ${orderId} has no e-mail address`);

  await notify(container, {
    template: TEMPLATE.orderPlaced,
    to,
    idempotencyKey: `order-placed:${order.id}`,
    resource: { id: order.id, type: "order" },
    receiverId: order.customer_id ?? null,
    triggerType: OrderWorkflowEvents.PLACED,
    data: {
      ...head(order),
      ...totals(order),
      lines: lines(order),
      address: address(order),
    },
  });
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.PLACED,
  context: { subscriberId: "resend-order-placed" },
};
